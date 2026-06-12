# PR #665 レビュー round 2（Issue #658）

## 対象

共有部品 4 変更（`Popover.tsx` / `usePopover.ts` / `useRovingMenu.ts` / `styles.ts`）の全消費者影響。ゼロベースで再確認。

確認した消費者（grep 全件）:

- `usePopover` / `<Popover>`: `common/Menu.tsx`（menu モード）、`note/list/ViewSwitcher.tsx`（listbox 単一選択）、`note/list/FilterBar.tsx`（TagPicker listbox / DatePopover dialog / VisibilityPopover dialog）、`public/PublicTopControls.tsx`（DatePopover dialog / SortMenu menu）
- `useRovingMenu`: `Menu.tsx`、`ViewSwitcher.tsx`、`FilterBar.tsx`（TagPicker / VisibilityPopover）、`PublicTopControls.tsx`（SortMenu）。`restoreFocusOnCommit: true` は TagPicker のみ（opt-in 確認済み、他消費者はデフォルト false）
- `popoverSheetPanel`: 消費者は `FilterBar.tsx` の `FILTER_POPOVER_PANEL`（タグピッカー / 期間 / 公開状態の 3 パネル）のみ。`PublicTopControls.tsx:381` は独自リテラルで非依存（既に同一の `max-sm:fixed` セットを保持 — 寄せは #588 で追跡済み）
- `VISIBILITY_OPTION_ITEM`: `FilterBar.tsx` 内 VisibilityPopover のみ。`TOUCH_TARGET` は `max-sm:min-h-[44px]` でデスクトップ非影響
- `DirectorySelectField.tsx` の `setActiveIndex` はローカル useState（同名別物）、`AppShellDrawer.tsx` はコメント言及のみ — 非依存

## review-001 指摘の対応確認

- W-001（relatedTarget=null ガードのグローバル影響）: `usePopover.ts` JSDoc に dismiss 経路一覧と commit-on-blur（NoteEditor / InlineEditor / FrontMatterEditor）をスコープ外とする理由、window blur が必要になった場合の方針（ガード復元ではなく明示リスナー追加）が明記された — 対応済み
- W-002（refocus 時の stale activeIndex）: refocus pass に `Math.min(activeIndex, items.length - 1)` クランプ + `setActiveIndex(clamped)` 同期が入った — 対応済み
- N-005 相当（`restoreFocusOnCommit` の opt-in 化、毎コミット refocus を単一選択消費者から切り離す）: opt-in 化済みで Menu / ViewSwitcher / VisibilityPopover / SortMenu は新 effect を一切通らない — 対応済み

## 個別検証

- `Popover.tsx` `multiselectable`: listbox ブランチのみで `|| undefined` 描画。ViewSwitcher は prop 未指定 → 属性なしを `Popover.test.tsx` の `it.each` が両方向で固定。menu / dialog ブランチへの影響ゼロ
- `usePopover.ts` `next === null` ガード: 外側 mousedown（document リスナー）・Escape（document リスナー）・Tab アウト（非 null relatedTarget）・`closeAndRestoreFocus` の 4 経路はすべて別経路で不変。既存消費者のクローズ動作は全件保たれる（`Popover.test.tsx` で stays-open / closes-on-focus-out の両方向が固定済み）
- `useRovingMenu.ts` closed→open リセットガード（`prevOpenRef`）: 既存消費者で「open 中に `initialIndex` が変わる」ケースは存在しない（Menu / SortMenu は定数 0、ViewSwitcher / VisibilityPopover は選択即クローズで open 中に値が変わらない）ため、リセットが open 遷移時のみになっても挙動は同一。クローズ→再オープンで `wasOpen=false` に戻るため「再オープンで initialIndex に着地」の既存契約も維持
- refocus pass: `restoreFocusOnCommit` / `open` / `activeElement === document.body` の三重ガード。window blur 時は item が activeElement のまま、ユーザーが別要素へフォーカスを移した場合はその要素が activeElement なので、どちらも盗まない。`setActiveIndex(clamped)` は `clamped !== activeIndex` 時のみで再レンダーは収束する
- `popoverSheetPanel` の `max-sm:fixed`: `FILTER_POPOVER_PANEL` の基底 `absolute / top-full / mt-2` とは Tailwind の variant 並び順で max-sm 側が勝つ（PublicTopControls で動作実績のある同一セット）。`clampToViewport` の translateX は `POPOVER_SHEET_BREAKPOINT`（`usePopover.ts:146`、< 640px でスキップ）により干渉しない。タグピッカーのみ `max-h-[min(60vh,400px)] overflow-y-auto` を追加合成しており既存 2 パネルの sm 以上の見た目は不変

### Shared Components Regression

#### Blockers

なし。

#### Warnings

- **[W-001]** refocus pass がパネル面（padding / スクロールバー）への mousedown で body に落ちたフォーカスを、次の commit でリスト内へ引き戻す / 場所: `app/components/common/useRovingMenu.ts`（refocus pass）+ `app/components/common/Popover.tsx`（listbox ブランチの `event.target !== event.currentTarget` ガード） / 理由: listbox ブランチはスクロールバー操作（Firefox）のために panel 自身への mousedown を preventDefault しない。そのため panel 面を掴むとフォーカスは body に落ち、`activeElement === document.body` ガードを素通りする。タグピッカーはトグルごとに楽観ナビゲーションが pending になる唯一の消費者なので、「タグをトグル → ナビ解決待ちの間にスクロールバーをドラッグ → 解決の commit で refocus pass が option へ `focus()`」という現実的な並びがあり、`focus()` の scroll-into-view がユーザーのドラッグ中スクロール位置と競合しうる / 提案: refocus pass の `focus()` を `focus({ preventScroll: true })` にする。TC-5 の本来ケース（commit がフォーカス中ノードを差し替えた）では対象 option は直前まで可視なので preventScroll でも矢印キー復活という目的は満たせる

#### Notes

- **[N-001]** round 1 N-001（`popoverSheetPanel` JSDoc への「transform / filter / backdrop-filter 持ち祖先の下で使うと fixed が viewport 基準にならない」caveat 追記）は未対応のまま。新 JSDoc は `max-sm:fixed` が load-bearing である説明を加えたが containing block の罠には触れていない。現消費者（FilterBar、HomePage main 配下）は安全と再確認済みなので Note 据え置き
- **[N-002]** `popoverSheetPanel` 自体は z-index を持たず、現状は `FILTER_POPOVER_PANEL` 側の `z-40` が fixed シートの重なりを担保している。#588 で PublicTopControls を寄せる際、定数単体を使う消費者が z 指定を忘れると fixed 化後は後続コンテンツに埋もれうる — #588 作業時の確認事項として記録
- **[N-003]** `prevOpenRef` ガードにより「open 中の `initialIndex` 変化で着地をやり直す」可能性は共有フックの契約から消えた（現消費者は誰も依存していないことを全件確認済み）。フックの JSDoc は restoreFocusOnCommit 側には WHY があるが、reset effect 側の「open 遷移時のみ」という契約はインラインコメントのみ。将来の消費者向けに `initialIndex` の JSDoc（"the open-effect filter passes…"）へ「open 遷移時に一度だけ評価される」旨があるとより安全
