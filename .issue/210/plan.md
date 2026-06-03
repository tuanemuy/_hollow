# 実装計画 — Issue #210: hash-wasm の Instance 再利用 / lazy upgrade 直列実行の最適化検討

**Issue:** #210
**作成日:** 2026-06-04
**複雑度:** 中〜大規模（ただし非ゴールにより成果物は調査・設計ドキュメントのみ）

## 目的

Issue #206 / PR #207 レビューで挙がったパスワードハッシュ周りの性能・DoS 懸念について、実測と設計検討を行う。Issue 本文の非ゴールに従い、本 Issue では**調査と設計検討のみ**を成果物とし、コード実装は別 PR に委ねる。

## 前提の重大な変化

Issue #210 起票後、**ADR 012（2026-05-24）で `hash-wasm` (Argon2id) が完全に廃止され、scrypt (`@noble/hashes`) に置き換えられた**。理由は、Cloudflare Workers が本番含む全環境で動的 WASM compile を拒否し、`hash-wasm` 経由の Argon2id が本番で一度も機能していなかったため。

この結果、Issue #210 の 5 ゴールのうち①②は前提が消滅し、③④⑤のみが scrypt ベースで形を変えて残存する。

| ゴール | 状態 | 本 Issue での扱い |
|---|---|---|
| ① 並列 verify の heap / p95 実測（hash-wasm 19 MiB linear memory 懸念） | 前提消滅（scrypt は pure JS、WASM linear memory なし） | スコープ外 |
| ② hash-wasm 上流に Instance pool / cache 提案 or fork | 完全に無意味（依存・コードから削除済み） | スコープ外 |
| ③ lazy upgrade の `Promise.all` 並列化検討 | 残存（legacy PBKDF2 verify → scrypt rehash の直列） | 調査対象 |
| ④ rate limit が `unverified` 拒否前に効く前提を testing.md に明示 | 残存（前提自体が誤りと判明） | 調査対象 |
| ⑤ lazy upgrade を status OK 確定後に遅延させる設計変更 | 残存 | 調査対象 |

## スコープ

### 含まれるもの

- ③④⑤の現状コードに基づく調査
- 各論点の設計検討と推奨案（実装は別 PR）
- ④の知見を踏まえた testing.md への前提明記

### 含まれないもの

- ①② hash-wasm に関する一切（前提消滅）
- 本 Issue でのコード実装（非ゴール：実装は別 PR）
- staging smoke の実測（hash-wasm 前提だったため。scrypt の実測が要るなら別 Issue で再定義）

## 成果物

- `.issue/210/investigation.md` — 調査・設計検討の本体ドキュメント
- `.issue/210/testing.md` — ④の前提（rate limit 不在）の明記
- 必要に応じてフォローアップ Issue の起票（実装委譲先）

## テスト方針

本 Issue はコード変更を伴わないため、動作確認はドキュメントの正確性レビューで担保する。investigation.md の主張（コードの直列構造・rate limit 不在・rehash 発火条件）が実コードと一致するかを review フェーズで突き合わせる。
