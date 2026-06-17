# レビュー002: PR #756（Issue #754）— Frontend / UX / アクセシビリティ（2回目フルレビュー / ゼロベース）

対象: `app/components/note/list/FilterBar.tsx` / `app/components/note/list/styles.ts`
関連参照: `app/components/common/Dialog.tsx` / `app/components/common/styles.ts` / `app/components/note/list/NotePickerDialog.tsx`
検証 AC: AC-1 / AC-2 / AC-3 / AC-5 / AC-6 / AC-7
静的検査: `pnpm typecheck` クリーン / `biome lint`（変更2ファイル）クリーン / `FilterBar.test.tsx` 39 passed

## 前回 Warning の修正確認

- **[review-001 W-001] モバイルトリガーの focus-visible 欠落 → 修正済み。** `mobileFilterTrigger`（styles.ts:133-134）に `focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent` が付与され、`filterClearX` / `TAG_OPTION_ITEM` / `VISIBILITY_OPTION_ITEM` と揃った。主導線ボタンのキーボード可視性が確保された。
- **[review-001 W-002] 件数バッジの SR 文脈欠落 → 修正済み。** バッジ span を `aria-hidden="true"` にし、ボタン内に `<span className={SR_ONLY}>（適用中のフィルタ {activeFilterCount} 件）</span>` を併記（FilterBar.tsx:481-486）。トリガーのアクセシブル名が「絞り込み （適用中のフィルタ N 件）」となり、数値だけ読まれる問題が解消。`aria-pressed`/`aria-checked` を付けない制約（arch S-003）も維持。
- **[review-001 W-003] シート `<h2>` の pr-10 欠落 → 修正済み。** `className={`${dialogTitle} pr-10`}`（FilterBar.tsx:515）で右上 ×（`dialogCloseButton`、32px）との視覚衝突を回避。`Dialog` の `showCloseButton` JSDoc が要求する手当てが入った。
- **[review-001 Test W-001] in-sheet 公開状態ラジオ・期間プリセット経由のナビゲーション未テスト → 修正済み。** テスト2件追加（in-sheet visibility radio で `visibility: "public"` を search に乗せる / in-sheet 期間プリセット「今日」で from/to を乗せる）。テスト総数 37 → 39 passed。AC-2 の「期間・公開状態」枝が機械的に閉じた。

いずれも妥当に修正されており、退行・副作用は見られない。

## 受け入れ基準の検証

- **AC-1（横スクロール撤去）: 満たす。** `filterBar` は `flex flex-wrap … max-sm:hidden`（styles.ts:115-116）で `overflow-x-auto`/`flex-nowrap`/`scrollbarHidden` を撤去・モバイル非描画。`scrollbarHidden` import も除去済み（lint クリーン）。回帰テスト（test:861）で固定。
- **AC-2（全フィルター到達）: 満たす。** タグ/期間/公開状態/内部リンク参照すべてがシート内に再配置され横スクロールに非依存。内部リンク参照は代替案(b)（シート内は「適用中チップ + 解除」、新規選択はシート閉→`NotePickerDialog` の別動線）で実装（FilterBar.tsx:596-634）。新規追加2テストで期間・公開状態のナビゲーションも固定。
- **AC-3（省スペース）: 満たす。** 常時占有はモバイルトリガーバー1行（`mobileFilterBar`、`mb-5`）のみ。dangling 時のみフォールバックチップ +1（AC-7 許容）。
- **AC-5（a11y）: 満たす。** `Dialog`（`aria-modal` / フォーカストラップ / ESC / スクロールロック / トリガー復帰）を再利用、`ariaLabelledBy={sheetTitleId}` で可視 `<h2>絞り込み` を紐付け。ESC 閉＋トリガー復帰をテスト（test:1107）で固定。`showCloseButton` の × は初期フォーカス対象から除外（`INITIAL_FOCUS_SELECTOR`）され初期フォーカスは先頭の意味あるコントロールへ。
- **AC-6（件数 ⇔ hasAnyFilter 不変条件）: 満たす。** `activeFilterCount`（FilterBar.tsx:323-328）を `optimistic` 由来の単一式で導出し `hasAnyFilter = activeFilterCount > 0`。ディレクトリ項は `optimisticDirectoryId !== undefined`（dangling 非依存）で `hasAnyFilter` と同一 predicate。非 dangling ディレクトリで件数≥1 ∧ clear× 表示をテスト（test:938）で固定。
- **AC-7（ディレクトリ退行なし）: 満たす。** フォールバックチップ block（FilterBar.tsx:664-678）は無改変。

## 主要観点の所見

- **コンポーネント設計・状態管理:** 良好。`run()`/`useOptimistic`/各ハンドラは無改変、シート内コントロールは既存ハンドラをそのまま呼ぶ。`filterSheetOpen` はローカル `useState`（props 同期 `useEffect` なし）でナビゲーション再レンダーをまたいで保持（arch S-005）。`DateRangeFields` 抽出は「内側プレゼンテーションのみ・デスクトップ外側 DOM 不変」で AC-4 を割らない。`NotePickerDialog` を fragment 直下の単一インスタンスへ移動した点もポータルでレイアウト影響なし。
- **モバイル/デスクトップ分岐:** 正しい。`max-sm:hidden`（`data-desktop-filters`）/ `hidden max-sm:flex`（`data-mobile-filter`）/ シート `data-filter-sheet`。happy-dom の matchMedia 未評価で両 UI 共存する前提に対し、テストヘルパーが `desktopScope()` にスコープ限定済み。
- **UX:** 横スクロール撤去・件数バッジによる発見性改善は計画意図通り。シート内クリアでシートを閉じない（`clearAll` は navigate のみ）、トリガー外 clear× は `hasAnyFilter && !filterSheetOpen` で背後不可視化（FilterBar.tsx:490）。

---

## Frontend / UX / アクセシビリティ

### Blockers

なし。AC-1/2/3/5/6/7 はいずれも実装で満たされ、デスクトップ DOM は温存。前回 Warning 4件（Frontend 3 + Test 1）はすべて妥当に修正済み。typecheck/lint クリーン、ユニットテスト 39 passed。

### Warnings

なし。

### Notes

- **[N-001]** シート内の公開状態ラジオ行（FilterBar.tsx:575-591、`<label class="flex items-center gap-2.5 text-sm">` + ネイティブ `<input type="radio">`）はモバイル専用シート内にありながら 44px のタップ床（`TOUCH_TARGET`）を持たず、行高は文字＋ swatch 由来でおおむね 20px 程度になる。ただしシート内タグチップ（`h-8`=32px）・期間プリセットボタンも同様に床を持たず、これは「チップ/小コントロールに 44px 床を適用しない」既存規約（#749 ADR-001、`filterChip` JSDoc）と整合しており本 PR の退行ではない。ラジオは `<label>` 全体がクリック可能でヒット領域は文字幅まで広がるため実用上の取りこぼしは小さい。改善するなら各 `<label>` に `py-1.5`〜`min-h` を足してタップ高を稼ぐ余地はあるが、規約踏襲の範囲内なので任意。

- **[N-002]** 件数バッジと clear-× の単一情報源化が綺麗。`activeFilterCount`（`optimistic` 由来の単一式）から `hasAnyFilter = activeFilterCount > 0` を導出し、ディレクトリ項を `hasAnyFilter` と完全同一 predicate（dangling 非依存）に揃えたことで「バッジ0なのに clear× が出る」不整合を構造的に排除（FilterBar.tsx:317-329）。不変条件をテストで固定している点も良い。

- **[N-003]** ネスト Dialog 回避を代替案(b)で堅く確定。`Dialog.tsx:256` が `stopPropagation`（`stopImmediatePropagation` ではない）ゆえ ESC でネスト両 Dialog が同時に閉じる挙動を避けるため、シート内は「適用中チップ + 解除」のみ・新規選択はシート閉→picker 開の別動線にした判断は妥当。「ノートを選択」押下でシートが閉じ第二 Dialog を開かないことをテスト（test:1090）で固定。

- **[N-004]** デスクトップ不変（AC-4）の担保が手堅い。既存 JSX を温存しラッパに `max-sm:hidden` + `data-desktop-filters` を足すのみ、`DateRangeFields` 抽出も外側 DOM 不変に限定。`data-*` スコープでテストヘルパーの母集合を分離。AC-4 回帰ガード（3 Popover トリガー・タグチップ・clear× の存在/クラス列挙、test:871）も追加済み。

- **[N-005]** 公開状態をシート内ではネイティブ `<fieldset>`+`<legend>`+`<input type="radio">` 群で構成し、デスクトップの `role="menu" + menuitemradio` を流用していない（FilterBar.tsx:567-594）。APG 的に menu/listbox をモーダル内に入れ子にしない ADR-001 の方針に忠実。`name` に `useId` 由来値を使い、ページ内に複数 FilterBar が並んでもラジオグループが衝突しない点も良い。

- **[N-006]** モバイルトリガーバーへ `aria-busy={isPending}` を引き継ぎ（FilterBar.tsx:464）、`max-sm:hidden` で消えるデスクトップラッパの pending 表現がモバイルでも欠落しない（arch S-006）。

- **[N-007]** `SR_ONLY` 定数（FilterBar.tsx:828）はコンポーネント本体（同 484 行）より後で宣言されているが、モジュールスコープ `const` であり関数呼び出し時（render 時）に参照されるため TDZ には掛からない。typecheck/lint も通過。可読性の観点では他の定数同様コンポーネント上方に置く整理余地はあるが、機能上の問題はない。
