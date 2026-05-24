# PR Review #001 — feat(security): migrate password hashing from PBKDF2 to Argon2id (hash-wasm)

**PR:** #207
**Date:** 2026-05-24
**Round:** 1回目

---

## Summary

- Blockers: 1
- Warnings: 11
- Notes: 多数
- Verdict: **BLOCKED**

---

## Security

### Blockers
なし

### Warnings
- **[W-S-001]** `legacyVerifyPbkdf2Hash` (admin credentialStore) で iterations 上限なし — share-link 側と非対称
  - 場所: `app/core/adapters/d1/repositories/credentialStore.ts:125`
  - 理由: share-link 側は `iterations > 10_000_000` で false。admin 側は無制限。DB compromise 時に CPU 即時消費。
  - 提案: `iterations > 10_000_000` を admin 側にも追加し対称化。

- **[W-S-002]** `verifyArgon2id` が m/t/p の不正に巨大な値を計算前に拒否しない
  - 場所: `app/core/adapters/security/argon2id.ts:72-85`
  - 理由: hash-wasm の `validateOptions` は m/t/p の上限を持たない。DB 上の encoded が改竄されると Worker isolate の OOM/CPU 超過。
  - 提案: パースして `m ≤ ARGON2ID_MEMORY_KIB * 2`, `t ≤ 16`, `p ≤ 4` を超えるものは false で早期 reject。

- **[W-S-003]** `isWasmDisallowedError` の message 正規表現マッチが脆い
  - 場所: `app/core/adapters/security/argon2id.ts:39-49`
  - 理由: workerd 側の message 変更で本物 CompileError を誤分類しサイレントダウングレード。
  - 提案: ADR-005 へ既知リスクとして明記、+ console.warn による可観測化、または adapter 初期化時の 1 回 probe。

### Notes
- N-S-001〜N-S-007: OWASP 準拠 / timing-safe / enumeration defence / UoW 整合性 / CSPRNG salt / port 契約遵守 / downgrade attack 不在 を確認

---

## Adapter

### Blockers
なし

### Warnings
- **[W-A-001]** `changePassword` の二重書き込み: verify path で rehash → 直後 changePassword で新パスワード上書き
  - 場所: `app/core/application/identity/changePassword.ts:26-39` および `credentialStore.ts:340-373`
  - 理由: 同一リクエストで Argon2id 演算 2 回 + UPDATE 2 回。
  - 提案: 本 PR スコープ外 → 別 Issue で「changePassword 経路で adapter 内 verify 1 回 + rehash 抑制」を起票。

- **[W-A-002]** W-S-001 と重複 (iter 上限欠落)

- **[W-A-003]** `D1CredentialStore` のクラスコメント改訂が pure-read メソッドまで「UoW 必須」と読める
  - 場所: `credentialStore.ts:172-184` 付近
  - 理由: `hasPassword` / `resolveProvider` / `listCredentials` は `pending` を触らない。
  - 提案: コメント緩和（write/verify のみ UoW 必須、pure-read は両方可だが慣習として UoW 内）。

### Notes
- N-A-001〜N-A-007: WasmUnavailableError の脆さは spec/adr/011 で認識済み / port 契約 verify 不 throw 保持 / 共通モジュール export 設計妥当 / Argon2idPasswordHasher constructor 削除は callers 9 箇所すべて no-args / hexagonal 規約遵守 / accounts OCC 対象外 / status NG lazy upgrade は ADR-003 で許容

---

## Test

### Blockers
- **[B-T-001]** `wasmCompileAllowed()` probe が空 WASM モジュールで判定しており、`hashArgon2id` の実際の挙動と乖離
  - 場所: `app/core/application/identity/__tests__/identity.integration.test.ts:678-688` および `app/core/adapters/security/argon2id.ts:39-49`
  - 理由: probe (`WebAssembly.compile(empty)`) と実行時の `WasmUnavailableError` 判定 (`name === "CompileError" && message matches`) は別物。空モジュールが compile できるが hash-wasm が拒否される、あるいは逆のケースで skip 判定が外れる。
  - 提案: probe を `hashArgon2id("probe")` の try/catch に置き換え、判定と実装を直接同期させる。

### Warnings
- **[W-T-001]** admin 側に固定 PBKDF2 fixture の **単体テスト** が無い — TDD 計画の明示違反
  - 場所: `credentialStore.ts` 周辺、テストファイル不在
  - 理由: integration test の `makeLegacyPbkdf2Hash` は **生成と verify が同じコードパス** で回るので、エンコード仕様回帰を検出できない。
  - 提案: `app/core/adapters/d1/repositories/__tests__/credentialStore.legacyVerify.test.ts` を新設し、iter=100,000 / 600,000 の **事前計算済み固定文字列** fixture を verify=true させる。

- **[W-T-002]** lazy upgrade 統合テストで `updatedAt` 更新が検証されていない
  - 場所: `identity.integration.test.ts:748-755`
  - 理由: `maybeRehashLegacy` は `clock.now()` で `updatedAt` を更新するが、テストは未検証。
  - 提案: `expect(after.updatedAt).not.toBe(beforeUpdatedAt)` を追加。

- **[W-T-003]** share-link 側 fixture が iter=600,000 のみ — iter=100,000 (Workers 上限) を欠く
  - 場所: `passwordHasher.test.ts:10-11`
  - 提案: iter=100,000 の fixture を 1 件追加。

- **[W-T-004]** WASM fallback (`legacyHashPbkdf2Sha256`) に対する直接テストが無い、`hash().startsWith("$argon2id$")` の assertion が test pool に依存
  - 場所: `passwordHasher.test.ts:17` / `argon2id.test.ts`
  - 提案: B-T-001 と同じ probe を unit テストでも導入し、WASM availability に応じて hash の prefix expectation を切り替える。

### Notes
- N-T-001〜N-T-004: テスト独立性確保 / fake hasher 影響なし / port 契約「verify は throw しない」を網羅検証

---

## Performance

### Blockers
なし

### Warnings
- **[W-P-001]** verify 毎に `WebAssembly.instantiate` が走り 19 MiB linear memory を新規割り当て
  - 場所: hash-wasm 内部仕様 (`argon2id.ts:78` 経由)
  - 理由: コンパイル結果はキャッシュされるが Instance はキャッシュされない。並列ログイン時の GC pressure。
  - 提案: ライブラリ仕様のため変更不可。spec/adr/011 の Performance セクションに instance 非キャッシュを明記し staging smoke で計測。

- **[W-P-002]** lazy upgrade ヒット時に verify (legacy PBKDF2) + hash (Argon2id) の直列実行
  - 場所: `credentialStore.ts` の `verifyPassword` / `verifyPasswordForUser`
  - 理由: 50-150ms の CPU 二重消費。status NG ユーザでも発火 (DoS 増幅可能性)。
  - 提案: 本 PR スコープ外。staging smoke で実測 → 必要なら別 Issue で並列化検討。application 層の rate limit 前提を testing.md / ADR に明記。

- **[W-P-003]** bundle size マージン薄い (4596 KiB / gzip 969 KiB → 5 MiB 上限まで 414 KiB)
  - 提案: 本 PR スコープ外。継続観測する CI gate を別 Issue で起票。

- **[W-P-004]** = W-S-003 と重複 (WASM error detection 脆性)

### Notes
- N-P-001〜N-P-005: cold start 受容可能 / lazy upgrade は同 batch / bundle size 余裕あり / メモリ 14.8% / fallback は本番未発火

---

## Design Decisions

このラウンドで見つかった設計判断はないが、以下の対応方針を決定:

- **scope 内即時修正**: B-T-001, W-S-001/W-A-002, W-S-002, W-A-003, W-T-001, W-T-002, W-T-003, W-T-004, W-S-003/W-P-004 (ADR-005 への追記による可観測化)
- **scope 外 → 別 Issue 起票**: W-A-001 (changePassword 二重書き込み), W-P-001/W-P-002 (hash-wasm instance 非キャッシュ / lazy upgrade 直列), W-P-003 (bundle CI gate)
