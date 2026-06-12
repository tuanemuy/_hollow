# PR #659 レビュー（Round 2 / ゼロベース） — Frontend（コンポーネント設計・RSC/Suspense・スタイル規約）

対象: `feat(ui): #626 確定デザインの実装反映`（branch `issue/649/p10-toolbar-implementation`）
検証: `pnpm typecheck` PASS / 変更コンポーネントの unit テスト（ViewSwitcher / NoteListToolbar / Popover / skeletonAria）34 passed。
確定モック `spec/design/pages/P10-home.html` / `mobile/P10-home.html` / `P10-home-skeleton.html` / `P30-user-public-top.html`（desktop / mobile）と突合済み。

## 前回指摘（review-001-frontend.md）の修正確認

- **W-001（skeleton の `role="status"` 契約テスト不在 + モック乖離の未記録）→ 修正済み。** `app/components/common/__tests__/skeletonAria.test.tsx` が「announcing skeleton は `role="status"` を正確に1つ持つ / `ToolbarSkeleton` は decorative-only（status ゼロ + 全 DOM `aria-hidden`）」の非対称契約を固定。`.issue/649/adr.md` ADR-007 にスケルトンモック `sk-header` の `role="status"` と**意図的に乖離**する判断と理由（savedViews 遅延時も一覧/フィルタ側 status が読み込み中を伝える・二重アナウンス回避）が明記された。
- **W-002（検索中の label-in-name 不一致）→ 修正済み。** `viewSwitcherAriaLabel`（`listSelectors.ts:508`）が `「{q}」の検索結果 — ビューを切り替え` / `すべてのノート — ビューを切り替え` と可視見出しテキストを先頭に包含する合成になり、WCAG 2.5.3 と ADR-005（「現在 …」と検索文言の矛盾排除）を両立。`ViewSwitcher.test.tsx` でも固定されている。
- 前回 N-005(a) の死分岐（`initialIndex` の `< 0` ガード）も解消済み（`ViewSwitcher.tsx:60-63` は `findIndex + 1` の 0 フォールバックに一本化され、コメントで `aria-selected` / 初期フォーカス / 見出しフォールバックの一致が説明されている）。

### Frontend

#### Blockers

なし

#### Warnings

なし

#### Notes

- **[N-001]** `hasAnyFilter` prop の意味が層によって揺れている / 場所: `app/components/note/HomePage.tsx:107`、`app/components/note/list/NoteListToolbar.tsx:35` / 理由: `HomePage` は `HeaderSection` に `hasAnyFilter || search.q !== undefined`（= q 込み）を渡すため、`NoteListToolbar` 内の `saveDisabled = !hasAnyFilter && search.q === undefined` の後半条件は到達不能（`hasAnyFilter` が false なら q は必ず undefined）。動作は正しいが、`listSelectors.hasAnyHomeFilter` の JSDoc が「non-query filter」と定義しているのに対し prop には q 込みの値が流れており、将来の読み手が条件を二重に保守するリスクがある / 提案: `hasSavableCondition`（q 込み）のような別名 selector を `listSelectors` に切り出して両所から使うか、Toolbar 側の冗長条件を削除してどちらか一方を SSOT にする。
- **[N-002]** ViewSwitcher の listbox パネルに `max-h` / `overflow-y` がない / 場所: `app/components/note/list/ViewSwitcher.tsx:27`（`PANEL`） / 理由: 保存ビューが多い場合パネルが viewport 下端を越えて伸びる。`position: absolute` なのでページスクロールで到達は可能であり、既存 `<Menu>` 系も同様の挙動のため一貫はしている。確定モックは閉状態のみで規定なし / 提案: 対応するなら `max-h-[60vh] overflow-y-auto` 程度を `PANEL` に足す（既存メニュー群と合わせて別 Issue でも可）。
- **[N-003]** モック忠実度は引き続き高い。view-switcher（gap 10px/8px・`-ml` 相殺・`py-0.5`=2px・`whitespace-normal [overflow-wrap:anywhere]`・mobile min-h 44px・chevron 18px/ink-tertiary 縦中央 = R3 反映）、page-meta-row（space-between・`gap-x-3 gap-y-2`・mb-5・flex-wrap）、toolbar-group（icon ボタン desktop 36px 角 = `TOOLBAR_ICON_BTN`、mobile は pillBtnIcon の 44px 床）、segmented（32×28 / 36×32・ink 濃度差 active・白カード/shadow 廃止・アイコン 13px）、filter-clear-x（28/32px 円形・hover surface+ink・icon 13px）、ToolbarSkeleton（`mb-3` は skeleton モック `.sk-header { margin-bottom: var(--space-3) }` と一致）まで確定モックどおり。P30 系 segmented の追従（desktop = `title` 併記 / mobile = `aria-label` のみ、`role="tablist"`/`tab`/`aria-selected` 維持、実装追従は #619 へ委譲の注記あり）も契約どおり。
- **[N-004]** モックの「+ タグ」ゴーストチップ（#626 R3 ADR-008）が実装に無いのはスコープ外として正しい — `.issue/649/plan.md` が明示的に除外し、ステップ10でフォローアップ Issue 起票を計画している（モックと実装の乖離が追跡される構造になっている）。
- **[N-005]** RSC / Suspense 構成が ADR-002 どおりで健全: `OwnedNotesQuery` は同期の `HomePage` 本体で1回だけ構築し同一参照を `HeaderSection` / `NotesSection` へ渡して React `cache` の参照同一性デデュープを成立させている（JSDoc に根拠明記）。`SectionErrorBoundary` の `fallbackHeading`（ADR-009: エラー時もページ唯一の `<h1>` を維持）はテストで文書順（h1 が alert に先行）まで固定。`Popover` の listbox 枝は menu 枝と JSX を分離して `role` をリテラルに保ち（a11y lint 対応）、Safari/Firefox click-drop guard（panel `onMouseDown` preventDefault）を 3 role でパラメタライズテスト済み。
- **[N-006]** スタイル規約準拠: 新規ユーティリティ列は `styles.ts` の module-scope 定数（`TOOLBAR_ICON_BTN` / `filterClearX` / `DISPLAY_SEGMENTED_BTN` 改訂）、状態は `data-active` / `data-on`（`value || undefined` 規約）、手書き CSS / `@apply` 追加なし、`focus-visible` リングと `motion-reduce:transition-none` をアイコンのみ化した全コントロールに付与。モバイルの 44px 当たり判定は擬似要素 `after:-inset-*` で見た目寸法を保ったまま拡張しており、横方向を控えめにする判断はモック注記（「44×44px 相当」「隣接干渉回避」）の範囲内。
