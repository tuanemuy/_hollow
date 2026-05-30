# PR Review #002 — perf(security): changePassword の二重 verify / 二重 hash を解消

**PR:** #353
**Date:** 2026-05-30
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 多数
- Verdict: **APPROVED**

このラウンドの差分はテストファイルのみ（review-001 の W-001 / W-002 修正 + review 記録）。本体コード（adapter / usecase / port）は Round 1 で Blocker 0 / Warning 0 承認済み・無変更のため、Test 視点に絞って再レビュー。

---

## Test (Round 2)

### Blockers
なし

### Warnings
なし

### Notes
- N-001: **W-001 修正妥当** — round-trip テストが新パス `logIn` 成功 + `userId` 一致を検証。adapter の write 経路退行を捕捉可能に。退行モデルもコメントで言語化。
- N-002: **W-002 修正妥当・legacy 受理経路を実際に通る** — `makeLegacyPbkdf2Hash` の wire format（`pbkdf2-sha256-v1$<iter>$saltB64$hashB64`、SHA-256、16byte salt、256bit）は adapter `legacyVerifyPbkdf2Hash` とバイト単位一致。share-link 側 `$pbkdf2-sha256$` とは別物で混同なし。changePassword が legacy 現パスで成功して先に進む時点で rehash-free verify の legacy 受理が実行到達で証明される。変更後 `$scrypt$` prefix・新パスログイン可・旧 legacy パス不可を assert。
- N-003: **hoist 安全** — `makeLegacyPbkdf2Hash` を module スコープへ hoist、ネスト版削除。lazy-upgrade suite は同名参照で挙動不変、全テスト green。
- N-004: **seed 独立性 OK** — paul01/quinn1/rhea01/sten01 重複なし、`beforeEach` の `truncateIdentityTables` で隔離。
- N-005: `expect.fail` を try 内・catch で型検証する pattern は未 throw 時に正しく fail へ転ぶ既存慣習。成功握り潰しなし。
- N-006: 検証実行 — ChangePassword 4件 green、ファイル全体 green、`tsgo` typecheck clean、biome lint clean、lazy-upgrade 回帰なし。

---

## Design Decisions

新規の設計判断なし。

## 完了判定

全レイヤー（Security / Adapter・UseCase / Test）で Blocker 0 / Warning 0。**1ラウンドクリーンで APPROVED**（Round 1 の本体承認 + Round 2 のテスト承認）。PR を Ready for review に切替。

最終テスト: integration **480 passed (41 files)** / unit **2848 passed (151 files)** / typecheck・lint・format クリーン。
