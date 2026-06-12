# PR Review #001 — fix(ui): ノート一覧（ListView / CalendarView）のクリック領域を行全体に拡張

**PR:** #508
**Date:** 2026-06-06
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 3（実質2テーマ）
- Notes: 11
- Verdict: **BLOCKED**（Warning 残存のため修正対象）

---

## Frontend

### Blockers
なし

### Warnings
- **[W-001]** 重複した orphaned JSDoc コメント
  - 場所: `app/components/note/list/ListView.tsx:14-24`
  - 理由: `NoteListRowBody` の直上に JSDoc が2つ連続。1つ目（14-18行 "Shared row renderer ... no discriminated branch or visibility guard is needed."）は元の `NoteListRow` の説明で、リファクタで宙に浮いた。内容も現状の `NoteListRowBody` とも `NoteListRow` とも噛み合わない。
  - 提案: 14-18行の旧 JSDoc を削除し、`NoteListRowBody` には新 JSDoc のみ残す。

### Notes
- [N-001] grid 構造は計画/ADR に忠実（非選択=Link が `[1fr_auto]` コンテナ、選択=`<li>` 外側 `[auto_1fr]`＋button 内側 `[1fr_auto]` の二段 grid、チェックボックスは外側）。
- [N-002] クリック領域と hover 範囲が一致（padding を Link/button 側、`<li>` は hover/選択ハイライトのみ、divide-y 維持）。
- [N-003] アクセシビリティ妥当（ListView aria-label=title、CalendarView は title のみでラベル不要、選択時 button はテキスト=title で無名にならない）。
- [N-004] リンク内 block 要素ネストは HTML5 valid、既存 TileView/公開側と同パターン。
- [N-005] スタイル規約遵守（data-x={value||undefined}、utility-first、items-center はコンテナ側、ADR-003 余白復元）。
- [N-006] 3ビューが同型に収斂。公開側の aria-label 無しはスコープ外。
- [N-007] テストは要件をカバー、typecheck/lint/test グリーン。

## Test

### Blockers
なし

### Warnings
- **[W-001]** 二重発火テストが二重発火の因果を行使していない（回帰を捕捉できない）
  - 場所: `app/components/note/list/__tests__/NoteListRowClick.test.tsx:128-144`
  - 理由: 実装ではチェックボックスと行 button は `<li>` 直下の兄弟（非ネスト）。よってチェックボックスクリックは構造的に行 button へバブリングしない。`NoteCheckbox` の `stopPropagation` を削除しても本テストは PASS のまま。テスト名/コメントが主張する「stopPropagation が二重発火を防ぐ」という因果を一切行使していないため、誤って checkbox を button 内へネストする回帰を捕捉できない。
  - 提案: 二重発火を防いでいる本当の不変条件「チェックボックスが行 button の外にある」を直接アサート（`expect(rowButton.contains(checkbox)).toBe(false)`）。コメント/テスト名から stopPropagation の主張を外し「checkbox click toggles exactly once」に限定。
- **[W-002]** チェックボックス経由 dispatch が「行 button 由来でないこと」を区別できない
  - 場所: 同ファイル 132-137 行
  - 理由: 同一 `dispatchSpy` が checkbox と行 button 両方に繋がり引数も同一。W-001 のとおり兄弟構造では 2 にならず空振りになりやすい。
  - 提案: W-001 の構造アサーションで担保する。

### Notes
- [N-001] 両ビュー・両モードの要件を具体的アサーションで網羅、相補アサーション（非選択時 button 無し / 選択時 a 無し）が良い。
- [N-002] Link モック・renderer パターンは既存テスト踏襲、`NoteCheckbox` は実物を使い素通ししていない。
- [N-003] 参考: `NoteCheckbox` の `stopPropagation` は 3ビューとも兄弟構造のため実質デッドコード。実装側コメント「nested inside ...」が現構造と不一致（NoteCheckbox 変更は本PRスコープ外）。
- [N-004] フィクスチャの `as unknown as` 二段キャストは許容範囲。

---

## Design Decisions

特になし（既存 ADR-001〜003 の範囲内）。
