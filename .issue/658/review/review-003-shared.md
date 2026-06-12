# PR #665 レビュー round 3（Issue #658）

## 対象

共有部品 4 変更（`Popover.tsx` / `usePopover.ts` / `useRovingMenu.ts` / `styles.ts`）の全消費者影響。ゼロベースで再確認（HEAD: `abac6f7d`、round 3 で追加されたコミット `4ee9ac1c` の safe-area / preventScroll / 変異耐性テストを含む）。

確認した消費者（grep 全件）:

- `usePopover` / `<Popover>`: `common/Menu.tsx`（menu）、`note/list/ViewSwitcher.tsx`（listbox 単一選択）、`note/list/FilterBar.tsx`（TagPicker listbox / 期間 dialog / 公開状態 dialog）、`public/PublicTopControls.tsx`（期間 dialog / SortMenu menu）
- `useRovingMenu`: `Menu.tsx`、`ViewSwitcher.tsx`、`FilterBar.tsx`（TagPicker / VisibilityPopover）、`PublicTopControls.tsx`（SortMenu）。`restoreFocusOnCommit: true` は TagPicker のみ（opt-in、他はデフォルト false で新 effect を一切通らない）
- `popoverSheetPanel`: `FilterBar.tsx` の `FILTER_POPOVER_PANEL` のみ（タグピッカー / 期間 / 公開状態の 3 パネル）。`PublicTopControls.tsx` は独自リテラルで非依存
- `TOUCH_TARGET`: `max-sm:` スコープの追加合成のみでデスクトップ非影響

## round 2 指摘の対応確認

- W-001（refocus の `focus()` がユーザースクロールと競合）: `useRovingMenu.ts` の refocus pass が `focus({ preventScroll: true })` になり、WHY コメントも付いた — 対応済み
- N-001（containing block caveat）/ N-002（z-index）/ N-003（reset 契約の JSDoc）: Notes として見送り済み — 蒸し返さない

## round 3 新規差分の検証

- `popoverSheetPanel` への `max-sm:pb-[calc(var(--space-4)+env(safe-area-inset-bottom))]` 追加: `--space-4`（16px）は `tokens.css` に実在。`max-sm:` variant が基底 `p-4` に対し決定的に勝つ（`dialog` 定数の確立済み同一パターン）。消費者は `FILTER_POPOVER_PANEL` の 3 パネルのみで、`sm:p-3` は sm 以上スコープのため干渉しない。sm 以上の見た目は不変 — 回帰なし
- refocus pass のクランプ + `setActiveIndex(clamped)`: `clamped !== activeIndex` 時のみ setState するため再レンダーは 1 回で収束。既存の roving mirror effect（deps: `activeIndex`）との往復ループなし

## テスト

`app/components/common/__tests__/` 全件 + `FilterBar.test.tsx` / `ViewSwitcher.test.tsx` / `public/__tests__` を実行 — 26 ファイル 197 テスト全通過。`Popover.test.tsx` は relatedTarget=null の stays-open / 非 null の closes-on-focus-out 両方向、`multiselectable` の有無両方向を固定済み。

### Shared Components Regression

#### Blockers

なし。

#### Warnings

なし。round 1–2 の警告（relatedTarget=null ガードのグローバル影響、stale activeIndex、preventScroll）はすべて対応済みで、ゼロベース再確認でも新たな回帰経路は見つからなかった。

#### Notes

- **[N-001]** refocus pass の `focus({ preventScroll: true })` 直後、クランプが起きたケースでは次コミットで既存の roving mirror effect（`useRovingMenu.ts:85-91`）が同じ要素に preventScroll なしの `.focus()` を再実行する。すでにフォーカス済みの要素への `focus()` はスクロールを伴わない no-op となるためブラウザ実害はないが、「復元経路は preventScroll」という意図が mirror effect 側には及ばないことだけ記録（対応不要）
- **[N-002]** safe-area padding は `popoverSheetPanel` 消費者（FilterBar 3 パネル）にのみ効く。`PublicTopControls.tsx` の独自リテラルは safe-area を持たないままで、#588 の定数寄せ時に差分として吸収される — #588 作業時の確認事項として記録
