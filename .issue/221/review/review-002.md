# PR Review #002 — feat(ingestion): improve upload feedback (#221)

**PR:** #277
**Date:** 2026-05-28
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 1（直後に修正済み）
- Notes: 多数
- Verdict: **BLOCKED → 修正後 → Clean 想定（round 3 で確認）**

---

## Frontend

### Blockers / Warnings
なし

### Notes
- [N-001] `inflightRef` ガードの全エッジケース（visibilitychange、fatal、cancelled、setState例外）が try/finally で守られている
- [N-002] W-F-004 の fatal kind 限定が SerializedError kind 集合と整合（ADR-009 通り）
- [N-003] ref 群の相互作用問題なし
- [N-004] 微細な表現指摘（コメント文言）

**Verdict: Clean**

---

## Presentation / Error Handling

### Blockers / Warnings
なし

### Notes
- [N-001] errorResponse.test.ts の網羅性十分（5ケース）
- [N-002] CONSTRAINT_VIOLATION ケース挿入が楽観ロックpathに影響なし
- [N-003] business fallback 汎用文言化が既存マッピング（FRONT_MATTER_JSON_INVALID 等）に影響なし
- [N-004] ADR-008 の根拠が Issue #221 完了条件と整合
- [N-005] redactForClient 二重防御に影響なし
- [N-006] toEqual 識別性に関する微細メモ

**Verdict: Clean**

---

## Application / Domain

### Blockers / Warnings
なし

### Notes
- [N-001] 0-byte ガード移動が正しい
- [N-002] ADR-007 参照コメントは no-comments 例外として妥当
- [N-003] ADR-007 追記が W-P-002 と整合
- [N-004] ドメインルール優先順位に影響なし
- [N-005] bulkUpload 経由も同じガードが効く

**Verdict: Clean**

---

## Test / Spec

### Blockers
なし

### Warnings
- **[W-T-004]** `.issue/221/plan.md` の L278 と L570 に `notFound` を fatal kind として記述したまま → ADR-009 と乖離
  - 対応: round-002 で同箇所を `unauthorized` / `forbidden` のみに修正し、ADR-009 参照を追記 → **修正済み**

### Notes
- [N-006] spec/design/index.md の polling 間隔記述が「1.5〜4 秒」と実装値（4s active / 16s idle / 12s backoff）と乖離（既存負債、本 PR スコープ外）
- [N-007] ADR Status ヘッダーの一貫性（ADR-001〜006 には無く、007以降のみ。本 PR スコープ外）
- [N-008] progress.md が future engineer に十分な情報を渡せている
- [N-009] errorResponse.test.ts は既存スタイル整合
- [N-010] errorDisplay.test.ts (c) グループの intent ベース命名が良好
- [N-011] 番号削除方式（10b → 番号なし）は他ファイル参照と完全同期済み
- [N-012] TC-10.md の補足記述が手動再現時の保守性を担保

**Verdict (修正後): Clean**

---

## Design Decisions

特になし（round-002 で派生する新たな設計判断はない）
