# PR Review #002 — fix(spec-sync): close 4 behavior gaps surfaced by Issue #5

**PR:** #81
**Date:** 2026-05-20
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 多数（前回指摘の対応確認）
- Verdict: **APPROVED**

review-001 で指摘された全 Warning 10 件（うち 1 件は重複）が全レイヤーで適切に対応された。新規の Blocker / Warning は検出されなかった。

---

## Domain

### Blockers
なし

### Warnings
なし

### Notes
- **[N-001]** W-001（ADR-007 への `resolveInternalLinks` 言及追加）、W-002（anonymous + unlisted unit test 追加）、W-003（`assertSlugUnique` 前倒し + `exceptId: null`）すべて適切に対応
- **[N-002]** W-004（命名規約混在）は本 Issue スコープ外として別 Issue 化が前提となっており、新規追加の `SlugConflict: "slug_conflict"` は spec 文言リテラル一致を優先したという ADR の主張と整合
- **[N-003]** `findByOwnerAndSlug` の active 限定化はポート JSDoc / 新規 adapter 統合テストで二重に守られている

## Application

### Blockers
なし

### Warnings
なし

### Notes
- **[N-001]** W-001 への対応は適切。`restoreNote.ts` で `assertSlugUnique` を directory 解決の前に前倒し配置し、`exceptId: null` を渡している。directory 解決による無駄な root insert を回避でき、fail-fast 原則が PR 全体で一貫している
- **[N-002]** `unitOfWorkProvider.run` 内のトランザクション境界内で slug 検査が実行されており整合性が取れている

## Adapter

### Blockers
なし

### Warnings
なし

### Notes
- **[N-001]** W-001（insert JSDoc 更新）、W-002（schema.ts の述語不変条件コメント追加）ともに適切に解消
- **[N-002]** schema.ts と migration 0007 の述語テキストは byte-identical で SQLite の partial-index matcher が確実に効く

## Test

### Blockers
なし

### Warnings
なし

### Notes
- **[N-001]** W-001（`findByOwnerAndSlug` active 限定回帰テスト追加）、W-002（trashLifecycle のロールバック検証追加）、W-003（ADR-006 文言改善）、W-004（Domain W-002 と重複・対応済）すべて適切に対応
- **[N-002]** `it.todo` 4 件はラウンド 1 で既に解消済み。本ラウンドで新たな skip / todo の混入はなし

---

## Design Decisions

このラウンドで新たに発見された設計判断はなし。
