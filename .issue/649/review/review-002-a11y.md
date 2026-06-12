# PR #659 レビュー — アクセシビリティ観点 (review-002 / ラウンド2 フルレビュー)

対象: feat(ui): #626 確定デザインの実装反映 — P10 ツールバー再設計
参照: `.issue/649/plan.md`、`.issue/649/adr.md`（ADR-005 改訂・ADR-009/010 追加）、`.issue/626/adr.md`
前回: `.issue/649/review/review-001-a11y.md`（B-001 / W-001 / W-003 修正済み、W-002 は #660 へ委譲済み — 本ラウンドでは再指摘しない）

## 前回指摘の修正確認

- **B-001（Label in Name）→ 修正確認 OK**: `listSelectors.ts` の `viewSwitcherAriaLabel` が `${homeHeadingText(q, viewName)} — ビューを切り替え` の合成形になり、検索時（「「memo」の検索結果 — ビューを切り替え」）・非検索時（「すべてのノート — ビューを切り替え」）とも可視テキストがアクセシブルネームの先頭に含まれる（WCAG 2.5.3 充足）。内容→操作の順になり前回 N-002 も同時解消。`ViewSwitcher.test.tsx`（ADR-005 / 2.5.3 明記のケース）と `listSelectors.test.ts` でロック済み。adr.md ADR-005 も改訂済み（Accepted）。
- **W-001（エラー時の h1 消失）→ 修正確認 OK**: `SectionErrorBoundary` に `fallbackHeading` prop が追加され（ADR-009）、`HomePage.tsx` のツールバー境界がエラーフォールバックに静的 `<h1>{homeHeadingText(search.q)}</h1>` をアラートより前（document order）に描く。`SectionErrorBoundary.test.tsx` で h1 残存と順序（`compareDocumentPosition`）をロック済み。
- **W-003（disabled 保存ボタン）→ 修正確認 OK**: `NoteListToolbar.tsx` がネイティブ `disabled` をやめ `aria-disabled` + クリック早期 return + `aria-describedby` → `sr-only` の理由テキスト（「条件が設定されていません」）に変更（ADR-010）。フォーカス可能なまま SR に理由が届く。視覚面も `pillBtn` の `aria-disabled:opacity-disabled aria-disabled:cursor-not-allowed` と hover ガード（`hover:not-aria-disabled:`）が効くため、見た目の不活性表現も維持される。`NoteListToolbar.test.tsx` でロック済み。

### A11y

#### Blockers

なし

#### Warnings

- **[W-001]** listbox オプションのフォーカスインジケーターが背景色差 約1.08:1 のみで知覚困難
  / 場所: `app/components/note/list/ViewSwitcher.tsx`（`OPTION_ITEM` = `outline-none ... focus-visible:bg-surface`）
  / 理由: roving tabindex でプログラム的に `.focus()` されたオプションの唯一の視覚表示が白パネル（#fff）上の `bg-surface`（#f5f5f7）への変化で、コントラスト比 約1.08:1。多くのディスプレイ・輝度設定では矢印キー移動中の現在位置がほぼ視認できず、WCAG 2.4.7 (Focus Visible, AA) の「視認可能」を実質満たさない。既存の `menuItem`（common/styles.ts）と同一の app 全体パターンの踏襲であり PR 固有の新規逸脱ではないが、本 PR が新コンポーネントとして同パターンを増殖させている。
  / 提案: ViewSwitcher 単独で直すと既存メニューと不整合になるため、`menuItem` / `OPTION_ITEM` 共通の課題として Issue 起票を推奨。修正方向は `focus-visible:bg-surface` に加えて `focus-visible:outline-2 focus-visible:outline-accent`（トリガー類と同じ accent アウトライン）か、より濃い背景（`surface-hover` 等で 3:1 確保は難しいため outline 推奨）。

#### Notes

- **[N-001]** ツールバー境界のエラーフォールバック h1 は savedViews 不在のため `viewId` 適用中でも「すべてのノート」を表示する（ADR-009 で文書化済み）。savedViews のみ失敗し一覧が保存ビューの条件で描画された場合、見出しと内容が一時的に食い違う（2.4.6 観点）。`resetKey` / 再読み込みで回復するエッジケースであり許容範囲。
- **[N-002]** Suspense フォールバック表示中はページに `<h1>` が存在しない（`ToolbarSkeleton` は `aria-hidden` の純装飾）。ADR-002 で明示的に許容されたトレードオフ（過渡状態のみ）で、エラー時の恒久欠落は ADR-009 で解消済みのため指摘としては残さない。記録のみ。
- **[N-003]** ViewSwitcher トリガーの `title="ビューを切り替え"` は `aria-label`（「{見出し} — ビューを切り替え」）と文言が一致しないが、`aria-label` がアクセシブルネーム計算で優先されるため 2.5.3 上の問題はない。可視テキストを持つボタンへの `title` は ADR-003（常時レンダー方針）の範囲として妥当。
- **[N-004]** 良好な点（ゼロベースで再確認済み）:
  - listbox パターン: トリガー `aria-haspopup="listbox"` / `aria-expanded` / `aria-controls`、パネル `role="listbox"` + `aria-label`、項目はネイティブ `<button role="option">` + `aria-selected`（Enter/Space 活性はネイティブ）。不明 `viewId` は `selectedIndex=0` に正規化され見出しフォールバック・`aria-selected`・初期フォーカスが常に一致。`useRovingMenu` で Arrow/Home/End + wrap、選択中項目へ初期フォーカス、Esc 閉鎖 + トリガーへフォーカス復帰（`usePopover`）、選択時は `close()`（フォーカス復帰）→ navigate の順。パネルは `<h1>` の外（ADR-006）で phrasing content 制約も満たす。
  - Popover の menu / listbox / dialog 分岐が literal `role` の別 JSX で実装され、a11y lint が解決可能。
  - アイコンのみ化した全コントロール（segmented 3 ボタン・選択・保存・フィルタクリア×・見出しトリガー）に `aria-label` + `title` 全環境レンダー（ADR-003）と `focus-visible:outline-2 outline-accent` が揃っている。装飾 SVG はすべて `aria-hidden="true"`。
  - フィルタクリア × は `aria-label="フィルタをすべてクリア"`、モバイル擬似要素で当たり判定 44×44px（32 + inset 6px×2）。segmented はモバイル縦 44px / 横 40px（隣接干渉回避の文書化済みトレードオフ、2.5.8 AA は充足）。
  - アナウンス集約: `role="status"` は FilterBar / NoteList の 2 箇所のみ、`ToolbarSkeleton` は `aria-hidden` で三重アナウンスなし。`NoteListSkeleton` の件数バー削除で meta-row 件数との二重表現も解消。
  - 選択モードボタンは `aria-pressed` でトグル状態を公開（手動テスト IMPACT-002 でも確認済み）。
  - P30 モック（desktop / mobile）の segmented も `aria-label` + `title` + `tablist/tab/aria-selected` 契約を明記し、実装契約と一致（tablist パターン自体の不完全さは #660 へ委譲済みのため再指摘しない）。
