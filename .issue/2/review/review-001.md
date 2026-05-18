# PR Review #001 — feat(tag): connect mergeTags usecase to TagActions UI

**PR:** #53
**Date:** 2026-05-18
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 5
- Notes: 7
- Verdict: **BLOCKED**（Warning 解消後に再レビュー）

---

## Frontend

### Blockers
なし

### Warnings

- **[W-001]** ダイアログのフォーカストラップ・Esc 閉じが未実装
  - 場所: `app/components/tag/MergeTagDialog.tsx:57-115`
  - 理由: 既存 `MoveNoteDialog` も同様だが、アクセシビリティの観点で改善余地あり。
  - 提案: 本 PR の対応は不要（既存パターン踏襲）。共通ダイアログコンポーネント化で別 Issue 化。
  - **対応:** → 別 Issue で対応（W-002 とまとめる）

- **[W-002]** ダイアログのレンダリング位置が `<li>` 配下になっており Portal 化されていない
  - 場所: `app/components/tag/TagActions.tsx:142-150`
  - 理由: 既存 `MoveNoteDialog` 同様のパターンだが、AT 観点では弱い。
  - 提案: 共通化のタイミングで Portal 化を検討。
  - **対応:** → 別 Issue で対応（W-001 とまとめる）

- **[W-003]** 確認文言の段落がインラインスタイル
  - 場所: `app/components/tag/MergeTagDialog.tsx:81-91`
  - 理由: ダイアログ用 CSS への集約原則に反する。
  - 提案: `.dialog` 配下に説明テキスト用クラスを追加するか、既存の secondary text パターンに揃える。
  - **対応:** その場で修正（インラインスタイルを削除し、シンプルな `<p>` に変更）

- **[W-004]** `tags.filter().map()` を `tags.map()` ループ内で実行している（O(n²)）
  - 場所: `app/components/tag/TagManager.tsx:27-50`
  - 理由: `TAG_RESOLVE_LIMIT = 200` の上限で実害はないが、ループ外で正規化済み配列を1度作る方が素直。
  - 提案: ループ外で `all = tags.map(...)` を計算し、ループ内では filter のみ。
  - **対応:** その場で修正

- **[W-005]** `readonly T[]` と `ReadonlyArray<T>` の表記が混在
  - 場所: `app/components/tag/MergeTagDialog.tsx:16` / `app/components/tag/TagActions.tsx:17`
  - 理由: 同じデータ形状で表記が分かれており可読性低下。
  - 提案: プロジェクトで多い方に統一。
  - **対応:** その場で修正（プロジェクトの主流表記に揃える）

### Notes

- **[N-001]** `MoveNoteDialog` のパターン踏襲が忠実で計画・ADR-001 と整合
- **[N-002]** 同一タグ選択ガードを UI 側で実現（候補から source を除外）
- **[N-003]** `candidates.length === 0` で「統合」ボタン非表示の分岐が ADR の判断と整合
- **[N-004]** 削除確認文言が ADR-003 通り更新
- **[N-005]** `isPending` 中の disabled 制御・`router.invalidate()` → `onClose()` の順序が適切
- **[N-006]** `target === ""` の早期 return は `<select required>` への防御コードとして妥当
- **[N-007]** `affectedCount` を UI に表示しない判断は計画通り（トースト基盤不在）

---

## Design Decisions

W-001 / W-002 を別 Issue として切り出すかは Phase 4 の判断対象。`MoveNoteDialog` も同じ構造を抱えるためプロジェクト全体の共通課題であり、本 PR で個別に直すと中途半端な状態になる。`.issue/2/adr.md` に判断を追記し、Phase 4 でフォロー Issue 起票を行う。
