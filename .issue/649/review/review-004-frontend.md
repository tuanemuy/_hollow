# PR #659 レビュー（Round 4 / Frontend・フルレビュー）

対象: `gh pr diff 659`（commit `15dd94b8` 時点）
計画: `.issue/649/plan.md` / `.issue/649/adr.md`

## R3 指摘の修正確認

- **FE-W-001（修正済み）**: `app/components/note/HomePage.tsx` の `SectionErrorBoundary` `fallbackHeading` の `<h1>` に `[overflow-wrap:anywhere]` が追加された。className も通常系（`mb-[10px] text-3xl font-regular tracking-tightest leading-tight text-ink`）と整合しており、エラー時⇔通常時の見出し見た目が一致する。
- **A11y R3 指摘（PANEL max-height）（修正済み）**: `app/components/note/list/ViewSwitcher.tsx` の `PANEL` に `max-h-[min(60vh,400px)] overflow-y-auto` が追加された。roving focus（`useRovingMenu` の `focus()`）はブラウザ標準のスクロール追従でオーバーフロー内でも可視位置に入るため、キーボード操作との干渉はない。`max-w-[calc(100vw-2rem)]` と合わせてビューポート逸脱が両軸で抑止される。

## フルレビューで確認した観点（問題なし）

- **React `cache` 参照同一性（ADR-002）** — `notesQuery` は同期 `HomePage` 本体で1回だけ構築され、同一参照が `HeaderSection`（`Promise.all` 内 `loadOwnedNotes`）と `NotesSection` の両方へ渡る。`OwnedNotesQuery` 型は `loaders.ts` からの正規 export。
- **ViewSwitcher のナビゲーション契約** — `onSelectView` は旧 `<select>` の #215（page/limit ドロップ）/ #219（display ドロップ→サーバー側リダイレクト）コメント込みで忠実に移植。`close()` → `onSelectView()` の順序（フォーカス返却が先）も妥当。
- **未知 viewId のフォールバック一貫性** — `findIndex + 1 = 0` で index 0 へ落ち、`resolveViewName` の「すべてのノート」フォールバック・`aria-selected`・roving 初期フォーカスが必ず一致。selector テストで固定済み。
- **Popover listbox 枝** — menu 枝と同じ `onMouseDown` preventDefault（Safari/Firefox click-drop ガード）、dialog 枝は意図的に除外。3枝とも `it.each` でテスト固定。`role` リテラル維持（a11y lint 対応）。
- **ADR-006（パネルは `<h1>` の外）** — trigger render prop 内で `<h1><button/></h1>`、パネルはコンテナ直下で `text-sm font-regular tracking-normal leading-normal` の書体リセット済み。HTML 妥当性 OK。
- **ADR-010（保存ボタンの `aria-disabled`）** — onClick ガード + `aria-describedby` + sr-only 理由テキスト + `title` 切り替え。実装・テスト整合。
- **ADR-005（label-in-name）** — `viewSwitcherAriaLabel` は可視見出しテキストが先頭（WCAG 2.5.3）。検索中は検索文言が勝ち、矛盾する「現在 {ビュー名}」を出さない。
- **`TOOLBAR_ICON_BTN` の `sm:` override** — responsive 変種が base（`h-10` / `data-[icon]:w-10`）より後にソートされ勝つ。モバイルは `pillBtnIcon` の 44px 床が有効。
- **segmented / クリア × の max-sm 擬似要素当たり判定**、**focus-visible リング**、**skeleton の `aria-hidden` 非対称契約（ADR-007）**、**P30 モック追従（実装追従は #619 委譲・tablist/tab/aria-selected 契約維持・非表示モード用途は対象外と明記）** — いずれも妥当。
- 関連ユニットテスト（ViewSwitcher / Popover / SectionErrorBoundary、32件）はローカルで全て pass。

過去ラウンドで Notes 扱いとした軽微事項（TOUCH_TARGET リテラル重複、`saveDisabled` の二重判定、`isPending` 未使用、skeleton 数px差）は方針どおり再指摘しない。

## Blockers

なし。

## Warnings

なし。

## Notes

なし（新規の指摘事項はありません）。
