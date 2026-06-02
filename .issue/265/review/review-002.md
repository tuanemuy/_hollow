# PR Review #002 — domain: extend no-op version/event skipping to User/Directory/Note value-setters

**PR:** #427
**Date:** 2026-06-03
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 多数（修正確認）
- Verdict: **APPROVED**

1回目の Warning 4件（[W-T-001]/[W-T-002]/[W-C-001]/[W-C-002]）の修正を Use Case/Caller・Test の2レイヤーで再レビュー。すべて正しく入っており、新規 Blocker・Warning なし。1ラウンドクリーンで完了。

---

## Use Case / Caller Impact

#### Blockers
なし

#### Warnings
なし

#### Notes
- `saveNoteDraft.ts` の `if (next === found.entity) return next;` ガードはドメイン no-op 契約と完全整合。save・collectEvents を両方スキップ。OCC・UoW 境界に問題なし。
- 正常系（内容変更ある autosave）を壊さない。部分更新でも他フィールドのフォールバック一致判定が正しい。
- `saveNote`/`restoreNoteRevision` 非ガード（ADR-008）は実装と一致。no-op でも OCC は version 据置でマッチし破綻なし。`saveNote` の revision append は #158 ADR-002 の意図的挙動。
- `commitIngestionPreview` 経由の波及なし（commit は別集約として進む）。ADR-005/007/008 と実装に齟齬なし。
- note + ingestion 統合テスト 194件 pass。回帰なし。

## Test

#### Blockers
なし

#### Warnings
なし

#### Notes
- [W-T-001] resolvedNoteId 除外テスト: seed を resolved 付きで作り null 版を再投入し no-op を確認。ミューテーション検証で赤になることも確認済み（空虚でない）。
- [W-T-002] 順序付き比較テスト: 同一集合・順序違いで version+1 を確認。3配列が同一 `sameOrdered` 経由のため tagIds 代表でカバレッジ十分。
- [W-C-002] saveNoteDraft 統合テスト: version 据置が clock 非依存の強シグナル、updated_at 不変が補強。flaky でない。
- 3ドメイン entity 102件 + saveNoteDraft 統合 4件 pass。回帰なし。

---

## Design Decisions

特になし（1回目の ADR-008 で確定済み）。
