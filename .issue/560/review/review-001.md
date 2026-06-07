# PR Review #001 — fix: 共有リンクのパスワード失敗カウンタを永続化しロックアウトを発火させる (#560)

**PR:** #575
**Date:** 2026-06-08
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 2
- Notes: 12
- Verdict: **BLOCKED**（Warning 2件を本ラウンドで修正）

---

## Use Case

### Blockers
- なし

### Warnings
- なし

### Notes
- **[N-001]** 核心の修正は正しい。UoW の不変条件（`run` は `fn` の正常 return 後にのみ `db.batch()` を flush）を一切変更せず、失敗時の `save()` を pending batch に積んだうえで `{ outcome: "password_invalid" }` を return → UoW 外で throw、という案A の意図どおり。save→throw の順序が単一 UoW・単一 batch で確実に保証されている。
- **[N-002]** discriminated outcome 型 `RunOutcome`（ok / password_invalid）は型安全。ローカル型でクローズド、`ResolveShareLinkOutput` 不変で presentation 波及ゼロ。ADR-002 の `shareLinkId: string` 採用も妥当。
- **[N-003]** note-not-found / owner-not-found を UoW 内 throw のまま（save 破棄）にした判断は正しい。revoked / locked / not-found は save より前の早期 throw で破棄の影響なし。JSDoc にも正確に反映。
- **[N-004]** cross-layer catch policy 準拠。domain error の再 translate なし、broad try/catch 追加なし。
- **[N-005]** エラーコード文言・メッセージ（id 入り）不変。`errorCodeNaming.test` 影響なし。presentation 無変更の前提維持。
- **[N-006]** 参考: `verifyShareLinkAccess` の `eventDrafts` は全分岐で常に `[]` のため未 collect でも実害ゼロ。本 PR スコープ外。

## Test

### Blockers
- なし

### Warnings
- **[W-001]** ロックアウト境界「5回目で arm（4回目時点では lockedUntil=null）」が暗黙にしか検証されていない。
  - 場所: `app/core/application/publication/__tests__/resolveShareLink.integration.test.ts:193-204`
  - 理由: plan.md テスト方針2の「ちょうど5回目で arm」を、`recordFailedAttempt` のオフバイワンが逆方向にズレた場合（4回目で arm 等）に取りこぼす。
  - 提案: ループの4回目直後に `findById` で `failedAttempts===4 && lockedUntil===null` を1度 assert する。
  - → 本ラウンドで修正。
- **[W-002]** version 進行アサートが不等号のみで緩い。
  - 場所: 同ファイル `:274`
  - 理由: 成功時は `resetFailedAttempts` + `recordAccess` で version が **2回** 進む。`not.toBe` は1回しか進まないリグレッションを検出できない。
  - 提案: `versionBefore` を数値で取り出し `toBe(versionBefore + 2)` にする。
  - → 本ラウンドで修正。

### Notes
- **[N-001]** 回帰の核（#560）を real D1 で正しく再現・防止。pre-fix（`eda9e75^`）では `failedAttempts` が 0 のままで確実に fail する。
- **[N-002]** clock 固定が安定。`withFixedClock` の `{...c, clock}` 上書きで `lockedUntil` の完全一致 assert が成立。flaky 要因なし。
- **[N-003]** test 2 の6回目で正パスワードを使うのは良い設計（ロック中は正解でも弾くことを証明）。
- **[N-004]** 異常系（revoked / unknown token）・成功時 reset のカバレッジが plan.md 方針を満たす。
- **[N-005]** seed 構築（hashShareLinkToken / passwordHasher.hash）が本番経路と整合。D1 pool の beforeEach で状態汚染なし。`regression for #560` 明記。
- **[N-006]** `viewerIpHash` は永続化されず分岐ロジックも無いためテスト不足ではない。

---

## Design Decisions

特になし（ADR-001 / ADR-002 で既出の判断のみ。新規の設計判断は本ラウンドでは発生せず）。
