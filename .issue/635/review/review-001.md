# PR Review #001 — feat(ui): 共通ローディングUX資産の整備＋ミューテーションの pending 可視化（#634 Phase 1）

**PR:** #641
**Date:** 2026-06-11
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 2（うち1件は Frontend/Test が重複指摘）
- Notes: 多数（良い点中心）
- Verdict: **BLOCKED**（Warning を潰してから再レビュー）

---

## Frontend

### Blockers
なし

### Warnings
- **[W-001]** `setPendingBulk` reducer アクションと `pendingBulk` の全 action 横断保持・no-op 高速パスにテストが無い
  - 場所: `app/components/note/list/__tests__/listSelectors.test.ts` / 実装 `listSelectors.ts:95-147`
  - 理由: このファイルは純粋ロジックの隔離検証が存在意義で、既存 reducer は参照同一性 no-op まで明示テスト済み。新規 `pendingBulk`/`setPendingBulk` だけ未カバーで不整合。
  - 提案: `setPendingBulk` の true/false 切替・同値 no-op、各 action の pendingBulk 保持、exitSelectMode が pendingBulk:true でも emptySelection を返すこと、を追加。
  - → **このPRで修正**（Test W-001 と同一・統合）

### Notes（要約）
- N-002: B-3 `creatingDirectory` を startTransition 外で立て finally でリセットする設計は plan のリスク懸念を正しく回避。
- N-003: BulkActionBar の dispatch タイミング・行側 `data-pending`/`aria-busy` は ADR-002 と規約に準拠。
- N-004: Skeleton/Spinner は presentational に徹し過剰抽象化なし、aria 集約・motion-safe ガードも適切。
- N-006: スコープ厳守を確認（Suspense 実張り・useFormStatus・進捗ストリーミングに未着手）。range diff の `spec/design/pages/*-skeleton.html` は merge 済み #636/#639 由来で本PRのコミットは未変更。
- N-007: typecheck green / test:unit 3502 green / 新規 lint 警告なし。

---

## Accessibility & UX

### Blockers
なし

### Warnings
- **[W-001]** `ListView`/`TileView` の dim 行に `transition-opacity` が無く、ADR-002 の規定（`transition-opacity ... data-[pending]:opacity-60`）と実装が乖離。`transition-colors` のみのため opacity 変化が即時 dim になる（参照元 `NoteListViews` はふわっと dim）。
  - 場所: `ListView.tsx:82` / `TileView.tsx:62`
  - 理由: 機能・a11y 上の害はなく ListView/TileView 間の一貫性もあるが、ADR-002 の「NoteListViews と同じ dim 視覚に統一」宣言と食い違う。
  - 提案: 両行の transition プロパティに opacity を含める（`transition-[color,background-color,opacity]` 等）で ADR どおり統一。
  - → **このPRで修正**（コードを ADR-002 の宣言に合わせる）

### Notes（要約）
- N-001: Skeleton バーの角丸 `rounded-md`(8px) は P13a の `--radius-sm`(6px) と2px差。ただし置換前 `SkeletonBlock` も `rounded-md` で **regression なし**。12px高で視認困難のため許容（受容判断を記録）。
- N-002: Skeleton の `aria-label` と `label`/`sublabel` の二重読み上げ余地。実害小、Phase 2 の Suspense 組み込み時に再検討。
- N-003: `disabled`+`aria-busy` は既存プロジェクト標準パターンと一致、文言・3点リーダーも一貫。
- N-004/N-005: B-2 は Spinner 多用を避け aria-busy+文言段階化に留めた妥当な抑制（ADR-004 整合）。Spinner の reduce 時 static ring は JSDoc どおり、Phase 1 未組み込みで実害なし。

---

## Test

### Blockers
なし

### Warnings
- **[W-001]** `listSelectors` の新規 action `setPendingBulk` と `pendingBulk` 保持に回帰テストが無い（Frontend W-001 と同一）。
  - → **このPRで修正**

### Notes（要約）
- N-001: Skeleton/Spinner 新規テストは質・粒度とも妥当、スナップショット頼みでなく ConfirmDialog スタイル準拠。
- N-002: Skeleton 側に `motion-safe:animate-pulse` のクラス検証を足すと Spinner と対称。→ **このPRで取り込む**（安価な改善）。
- N-003: UploadDialog 置換は既存 `UploadDialog.test.tsx` の `[role="status"]` textContent アサートで no-regression 担保。
- N-005: test:unit 全 green（218 files / 3502 tests）。

---

## 仕分け結果

| 指摘 | 対応 |
|------|------|
| W-001 (Frontend/Test): listSelectors の pendingBulk/setPendingBulk テスト | このPRで修正 |
| W-001 (A11y): dim 行の transition-opacity 欠落 | このPRで修正（コードを ADR-002 に合わせる） |
| N-002 (Test): Skeleton の motion-safe アサート | このPRで取り込む |
| N-001 (A11y): rounded-md vs radius-sm | 受容（regression なし、ADR-005 に記録） |
| N-002 (A11y): aria-label 二重読み上げ | Phase 2 で再検討（実害小） |

## Design Decisions
- dim 行の transition に opacity を含め、ADR-002 の「NoteListViews と同じ dim 視覚」宣言に実装を一致させる。
- Skeleton バーの角丸は既存 `SkeletonBlock`（rounded-md）を踏襲し regression を避ける（P13a の radius-sm との2px差は許容）→ ADR-005 に記録。
