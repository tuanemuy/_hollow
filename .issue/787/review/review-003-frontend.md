# PR #809 レビュー — Frontend 観点 (round-3 / フル再レビュー)

**対象:** PR #809 / Issue #787（ノート詳細アクションツールバーのモバイル縮小: gap / margin / icon density）
**計画:** `.issue/787/plan.md`（AC-1〜AC-7）
**判定:** Blocker なし / Warning なし。round-2 W-001（tokens.md doc 追記が未コミットで PR 未反映）は本ラウンドで**完全解消**。Frontend 観点の AC（AC-1/2/3/4/5/6/7）はすべて満たす。

---

## Frontend

### Blockers

なし。

差分（`Icon.tsx` / `NoteActions.tsx` / `NoteActionsMenu.tsx` / `UrlCopyButton.tsx` / `spec/design/pages/mobile/P11-note-detail.html` / `spec/design/tokens.md`）をゼロベースで再検証し、致命的問題は検出されなかった。

### Warnings

なし。

**round-2 W-001 の解消を確認:** round-2 で「tokens.md への doc 追記が working tree 上にあるだけで未コミット、PR の committed diff に未反映」と指摘した点が解消された。

- `git diff origin/main...HEAD -- spec/design/tokens.md` に追記が**コミット済み**として現れる（L214 付近、`--icon-*` セクション）。
- 追記文面は round-2 W-001 が提案したものと**逐語一致**:
  「例外として、レスポンシブ縮小に限り `Icon` ラッパへ `max-sm:size-[var(--icon-*)]` を当てて glyph を縮小してよい。この場合も `size` prop はデスクトップ寸法の SSOT として据え置く（消さない・無印 `w-*`/`h-*` と併用しない）。詳細は `Icon.tsx` JSDoc / `.issue/787/adr.md` ADR-002。」
- `Icon.tsx:30-38` の JSDoc カーブアウトおよび ADR-002 と整合し、tokens.md SSOT が実装の実態（`max-sm:size-[var(--icon-md)]` 上書き）と一致した。AC-2（新規トークン非追加 + 必要 doc のミラー）は committed diff レベルで充足。

### Notes

- **[N-001]** AC 充足を再確認（committed diff ベース、変更ファイルは `gh pr diff 809 --name-only` で確認）:
  - AC-1: mobile mock `.action-toolbar` が gap `--space-2→--space-1`、margin `--space-4 0 --space-6 → --space-3 0 --space-4`、icon-only svg `20→18` に縮小（mock 先行）。デスクトップ mock は未変更でスコープ限定。
  - AC-3: 実装 `MENU`(`NoteActions.tsx:88-89`) に `max-sm:my-3 max-sm:mb-4 max-sm:gap-1`、`MENU_RAIL`(L93) に `max-sm:gap-1`、icon-only グリフ 5 箇所に `max-sm:size-[var(--icon-md)]` を追加。mock と逐語一致。
  - AC-4: `styles.ts` は **diff に含まれず**（`git diff --name-only` で不在を確認）。44px 床（`pillBtn`/`pillBtnIcon` の `TOUCH_TARGET`）は不変。グリフ縮小はボタン box に非干渉。
  - AC-5: `role="toolbar"` / `aria-label="ノート操作"`（L186）、各ピルの `aria-label`/`title`、`MENU_RAIL` の `max-sm:overflow-x-auto`/`scrollbarHidden`(L93) すべて維持。
  - AC-6: 3 レバー（gap/縦マージン/グリフ密度）の意図値が mock↔実装で一致。ラベル付き「公開」ピルの `Globe` は default 16px で、mock 公開ピル svg(width=16, L892) と一致＝過不足なし。編集(Pencil)構成差は計画どおりスコープ外。
  - AC-7: 変更は className 文字列追加 + JSDoc 追記 + Markdown 追記のみ。round-2 以降の唯一の差分は tokens.md（Markdown）の commit であり、コードは不変なので型/lint リスクは round-2 から増えていない。
- **[N-002]** round-2 → round-3 の実コード差分はゼロ（`Icon.tsx`/`NoteActions.tsx`/`NoteActionsMenu.tsx`/`UrlCopyButton.tsx`/mobile mock は round-2 時点の committed 内容のまま）。本ラウンドの実質的変化は W-001 解消（tokens.md commit）に限られる。
- **[N-003]** モック内 icon-only svg の `stroke-width="1.7"/"2"` と実装 `Icon` の `strokeWidth=1.5` 固定という pre-existing なモック↔実装差は、本 Issue の 3 レバーと無関係でスコープ外（round-2 N-004 と同旨）。
