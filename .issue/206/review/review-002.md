# PR Review #002 — feat(security): migrate password hashing from PBKDF2 to Argon2id (hash-wasm)

**PR:** #207
**Date:** 2026-05-24
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0 (round 1 の sccope 内 warning はすべて解消; scope 外 4 件は別 Issue 化方針)
- Notes: 多数
- Verdict: **APPROVED**

---

## Security

### Blockers
なし

### Warnings
- round 1 W-S-001 解消 — `LEGACY_PBKDF2_ITERATIONS_MAX = 10_000_000` を admin 側に追加、share-link 側と対称化、`credentialStoreLegacyVerify.test.ts` で境界 fixture (`iter=10,000,001`) の reject を担保
- round 1 W-S-002 解消 — `parseArgon2idParams` が WASM 呼び出し前に `m ≤ 38 MiB / t ≤ 16 / p ≤ 4` を判定、`argon2id.test.ts` で m=100M / t=9999 / p=999 の各境界カバー、ADR-006 で記録
- round 1 W-S-003 部分解消 — `console.warn` tripwire 追加によりサイレントダウングレードが可観測化。message 文字列マッチの根本的脆さは hash-wasm の仕様上残存だが ADR-005 に明記済み

新規 blocker/warning なし。

### Notes
- N-S-001: `parseArgon2idParams` の key 重複時は後勝ち。cap 判定はループ後で回避不能、問題なし
- N-S-002: `parts.length < 5` で salt 欠落も検出。後段の `argon2Verify` も PHC 形式不正で false に倒す二重防護
- N-S-003: `legacyVerifyPbkdf2Hash` export は JSDoc で test-only 明示、grep 検証で他 import なし
- N-S-004: production で fallback が万一発火しても次回 lazy upgrade で自己治癒する構造
- N-S-007: OWASP 第一推奨パラメータ + CSPRNG salt + PHC encoded + timing-safe compare — round 1 評価維持

---

## Adapter

### Blockers
なし

### Warnings
- round 1 W-A-001 (changePassword 二重書き込み) — 本 PR スコープ外として **別 Issue 起票予定** (Phase 4)
- round 1 W-A-002 解消 — `LEGACY_PBKDF2_ITERATIONS_MAX` 追加で share-link と対称化
- round 1 W-A-003 解消 — docstring が mutation/verify (UoW 必須) と pure-read (UoW 任意) を切り分け

新規 blocker/warning なし。

### Notes
- N-A-001: `legacyVerifyPbkdf2Hash` export は JSDoc で test 用途を明記、誤用ガード成立
- N-A-002: `parseArgon2idParams` は非 export、`verifyArgon2id` 内で parse → cap → WASM の順序が守られている
- N-A-003: `console.warn` tripwire は `vitest-pool-workers` で毎回出るが CI ログ容量を圧迫するほどではない、tripwire としての設計意図が明示済み
- N-A-004: defense-in-depth が adapter 層に閉じ込められている (responsibility 配置適切)
- N-A-005: `maybeRehashLegacy` は UoW 規約に沿う (`pending.add`、accounts は OCC 対象外)
- N-A-006: PBKDF2 fallback は test 専用、production 未発火

---

## Test

### Blockers
なし

### Warnings
- round 1 B-T-001 解消 — `argon2idAvailable()` が `hashArgon2id("probe")` の try/catch with `WasmUnavailableError` 判定に置換され、判定と本実装が完全同期
- round 1 W-T-001 解消 — `credentialStoreLegacyVerify.test.ts` を新設、iter=100k / 600k の事前計算固定文字列 + wrong password + malformed + cap 超過まで網羅
- round 1 W-T-002 解消 — `frozenUpdatedAt` セットして lazy upgrade 後の `updatedAt` 更新を assert
- round 1 W-T-003 解消 — share-link 側 fixture に iter=100k 追加、`it.each` でラベル付き両形式 verify
- round 1 W-T-004 部分解消 — `argon2id.test.ts` に defense-in-depth cap テスト追加。`legacyHashPbkdf2Sha256` 関数自体への直接テストは未追加だが、share-link legacy verify fixtures が同じ PBKDF2 を round-trip するため回帰捕捉可能

新規 blocker/warning なし。

### Notes
- N-T-001: cap 超過テストは W-S-001 解消も同時に検証
- N-T-002: defense-in-depth テストは parser regression もクロスチェック可能
- N-T-003: probe と本体が同一関数で hash-wasm バージョン変更にも自動追随
- N-T-004: 固定 fixture の salt 再利用 + Node `crypto.pbkdf2Sync` 出典明記で再現性高い

---

## Performance

### Blockers
なし

### Warnings
- round 1 W-P-001 (per-call WebAssembly.instantiate) — ライブラリ仕様、**別 Issue で扱う** (review-001 方針通り、staging smoke で実測)
- round 1 W-P-002 (lazy upgrade 直列 WASM 実行) — **別 Issue で扱う** (status NG rate-limit 議論ごと)
- round 1 W-P-003 (bundle size マージン 414 KiB) — **別 Issue で扱う** (CI gate 化)
- round 1 W-P-004 解消 — console.warn tripwire 追加で可観測化

新規 blocker/warning なし。

### Notes
- N-P-001: `parseArgon2idParams` の計算量は WASM verify 100ms に対して 1µs 未満で誤差。むしろ DoS 耐性向上で**正のパフォーマンス効果**
- N-P-002: `LEGACY_PBKDF2_ITERATIONS_MAX` で admin 側の DoS 耐性を share-link と対称化、早期 reject は O(1)
- N-P-003: `console.warn` は production 未発火、発火しても workerd で数 µs オーダー
- N-P-004: `parseArgon2idParams` の object 新規確保は WASM 19 MiB アロケート前なので誤差以下
- N-P-005: 正規表現マッチは catch 経路のみ、hot path 影響なし

---

## Design Decisions

このラウンドで追加した設計判断:

- **ADR-006**: `verifyArgon2id` に m/t/p の上限 caps を追加、admin 側 PBKDF2 iter 上限を share-link と対称化 (`.issue/206/adr.md` に記録済み)
- **ADR-005 amendment**: probe を `WebAssembly.compile(empty)` から `hashArgon2id("probe")` に置換、`console.warn` tripwire 追加 (`.issue/206/adr.md` 末尾で更新)

すべての round 1 sccope 内指摘は解消、scope 外項目は Phase 4 で別 Issue として起票予定。**APPROVED**。
