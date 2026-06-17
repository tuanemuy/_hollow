# レビュー: PR #756（Issue #754）— Frontend / UX / アクセシビリティ

対象: `app/components/note/list/FilterBar.tsx` / `app/components/note/list/styles.ts`
関連参照: `app/components/common/Dialog.tsx` / `app/components/common/styles.ts` / `app/components/note/list/NotePickerDialog.tsx`
検証 AC: AC-1 / AC-2 / AC-3 / AC-5 / AC-6 / AC-7

## 受け入れ基準の検証サマリ

- **AC-1（横スクロール撤去）: 満たす。** `filterBar` から `max-sm:flex-nowrap` / `max-sm:overflow-x-auto` / `max-sm:gap-2` / `max-sm:pb-0.5` / `scrollbarHidden` が撤去され、デスクトップラッパは `max-sm:hidden` でモバイル非描画（styles.ts:115-116）。`scrollbarHidden` import も削除済み（lint クリーン確認済み）。テスト「keeps the desktop wrapper free of horizontal-scroll utilities」が回帰防止。
- **AC-2（全フィルター到達）: 満たす。** タグ/期間/公開状態/内部リンク参照すべてがシート内に再配置され、横スクロールに依存しない。内部リンク参照は代替案(b)（シート内は「適用中チップ + 解除」のみ、新規選択はシートを閉じて別動線で `NotePickerDialog`）で確定通り実装（FilterBar.tsx:589-627）。ネスト Dialog を開かないことをテスト「closes the sheet when choosing to select a new reference」で固定。
- **AC-3（省スペース）: 満たす。** 常時占有はモバイルトリガーバー1行（`mobileFilterBar`、`mb-5`）のみ。フィルター本体はシート展開時のみ縦消費。dangling 時のみフォールバックチップ行が +1（許容範囲、AC-7）。
- **AC-5（a11y）: 概ね満たす。** `Dialog`（`aria-modal` / フォーカストラップ / ESC / スクロールロック / トリガー復帰）を再利用し、`ariaLabelledBy={sheetTitleId}` で可視 `<h2>絞り込み` をアクセシブル名に紐付け。テスト「opens an accessible-named sheet」「closes the sheet and restores focus to the trigger on Escape」で担保。W-002/W-003 参照。
- **AC-6（件数バッジ / 不変条件）: 満たす。** `activeFilterCount` を `optimistic` 由来の単一式で導出し `hasAnyFilter = activeFilterCount > 0`（FilterBar.tsx:323-329）。ディレクトリ項は `optimisticDirectoryId !== undefined`（dangling 非依存）で計画通り、`hasAnyFilter` と同一 predicate。非 dangling ディレクトリで件数≥1 かつ clear-× 表示の整合をテスト「badge count agrees with the clear-× gating」で固定。
- **AC-7（ディレクトリ退行なし）: 満たす。** フォールバックチップ block（FilterBar.tsx:657-671）は無改変で温存。`DirectoryBreadcrumb.test.tsx` 系も既存通り。

## 主要観点の所見

- **コンポーネント設計・状態管理:** 良好。`run()` / `useOptimistic` / 各ハンドラは無改変で、シート内コントロールは既存ハンドラ（`toggleTag` / `selectPreset` / `updateDate` / `selectVisibility` / `clearReferencingNoteId`）をそのまま呼ぶ。`filterSheetOpen` はローカル `useState`（`pickerOpen` と同型、props 同期 `useEffect` なし）で、ナビゲーション再レンダーをまたいで保持される設計をコメントで明文化（arch S-005）。`DateRangeFields` 抽出は「内側プレゼンテーションのみ・デスクトップ外側 DOM 不変」で AC-4 を割らない（FilterBar.tsx:830-904）。重複 state・無駄な再レンダーは見当たらない。
- **モバイル/デスクトップ分岐:** 正しい。デスクトップ列 `max-sm:hidden`（`data-desktop-filters`）/ モバイルバー `hidden max-sm:flex`（`data-mobile-filter`）/ シート `data-filter-sheet`。happy-dom（matchMedia 未評価）で両 UI 共存する前提に対し、テストヘルパーが `desktopScope()` にスコープ限定済み。
- **UX:** 横スクロール撤去・件数バッジによる発見性改善は計画意図通り。シート内クリアでシートを閉じない（`clearAll` は navigate のみ）、トリガー外 clear-× は `hasAnyFilter && !filterSheetOpen` で背後不可視化（FilterBar.tsx:483）— 妥当。内部リンク参照の「別動線」（シート閉→picker 開）も破綻なし。`NotePickerDialog` を fragment 直下の単一インスタンスに移動した点もポータルなのでレイアウト影響なし。

---

## Frontend / UX / アクセシビリティ

### Blockers

なし。AC-1/2/3/5/6/7 はいずれも実装で満たされ、デスクトップ DOM は温存されている。ユニットテスト 37 件パス、typecheck/lint（変更ファイル）クリーン。

### Warnings

- **[W-001]** モバイルトリガー「絞り込み」ボタンに `focus-visible` アウトリングが無い / 場所: `app/components/note/list/styles.ts:133-134`（`mobileFilterTrigger`）/ 理由: このボタンはモバイルで全フィルターへの唯一の入口になった最重要コントロールだが、`focus-visible:outline` を持たずキーボードフォーカス時の可視インジケーターが無い。同ファイルの `filterClearX`（styles.ts:29）や Popover 内の `TAG_OPTION_ITEM` / `VISIBILITY_OPTION_ITEM` は揃って `focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent` を持つため不揃い。なお既存 `filterChip` / `filterChipGhost` もリングを持たない先例はある（チップ群はその慣習に従っている）が、集約トリガーはチップではなく主導線のボタンであり、フォーカス可視性の優先度が高い。/ 提案: `mobileFilterTrigger` に `focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent` を付与する。

- **[W-002]** 件数バッジがスクリーンリーダーに「4」とだけ読まれ文脈が無い / 場所: `app/components/note/list/FilterBar.tsx:479-481`（`<span className={mobileFilterCount}>{activeFilterCount}</span>`）/ 理由: トリガーボタンのアクセシブル名が「絞り込み 4」のように数値だけ連結され、何の 4 なのか SR ユーザーに伝わらない。AC-6 は視覚的発見性が主眼で達成済みだが、SR 可読性の観点では改善余地。/ 提案: バッジ span に視覚的に隠した文脈ラベルを併記する（例: バッジを `aria-hidden="true"` にし、ボタン内に `<span className={SR_ONLY}>適用中のフィルタ {activeFilterCount} 件</span>` を置く）か、トリガーに `aria-label="絞り込み（適用中 N 件）"` を動的付与する。`aria-pressed`/`aria-checked` は付けない制約（arch S-003）は維持できる手法を選ぶこと。

- **[W-003]** シートの `<h2>` タイトルに `pr-10`（×ボタン回避の右パディング）が無い / 場所: `app/components/note/list/FilterBar.tsx:508-510`（`<h2 id={sheetTitleId} className={dialogTitle}>`）/ 理由: 本シートは `showCloseButton` を使うため右上に絶対配置の `×`（`top-3 right-3` / 32px、`dialogCloseButton`）が乗る。`Dialog.tsx` の `showCloseButton` JSDoc は「title 等が右上ボタンと視覚衝突しないよう `pr-10` 等の右パディングを確保すること」を明記している。タイトル文言「絞り込み」は短く実害は出にくいが、規約上の手当てが欠けている（先例 `NotePickerDialog` は `showCloseButton` 不使用なので衝突せず、本件とは状況が異なる）。/ 提案: シートのタイトルに `pr-10` を足す（`className={`${dialogTitle} pr-10`}` 等）か、シート用タイトル定数を styles.ts に用意する。

### Notes

- **[N-001]** 件数バッジと clear-× の単一情報源化が綺麗。`activeFilterCount`（`optimistic` 由来の単一式）から `hasAnyFilter = activeFilterCount > 0` を導出し、ディレクトリ項を `hasAnyFilter` と完全同一 predicate（dangling 非依存）に揃えたことで「バッジ0なのに clear× が出る」不整合を構造的に排除している（FilterBar.tsx:317-329）。不変条件をテスト（非 dangling ディレクトリで件数≥1 ∧ clear× 表示）で固定している点も良い。
- **[N-002]** ネスト Dialog 回避を代替案(b)で堅く確定。`Dialog.tsx:256` が `stopPropagation`（`stopImmediatePropagation` ではない）ゆえ ESC でネスト両 Dialog が同時に閉じる挙動を避けるため、シート内は「適用中チップ + 解除」のみ・新規選択はシート閉→picker 開の別動線にした判断は妥当で、フォーカス復帰連鎖の脆さ（代替案 a）も回避できている。テストで「ノートを選択」押下時にシートが閉じ第二 Dialog を開かないことを固定。
- **[N-003]** デスクトップ不変（AC-4）の担保が手堅い。既存 JSX を温存しラッパに `max-sm:hidden` + `data-desktop-filters` を足すのみ、`DateRangeFields` 抽出も外側 DOM 不変に限定。`data-*` スコープでテストヘルパー（`buttonByText` / `tagButton`）の母集合を分離し、happy-dom の matchMedia 未評価による両 UI 共存を正しく扱っている。AC-4 回帰ガード（3 Popover トリガー・タグチップ・clear× の存在/クラス列挙）も追加済み。
- **[N-004]** シート内クリア後にシートを閉じない設計（`clearAll` は navigate のみで `filterSheetOpen` に触れない、FilterBar.tsx:629-639）と、トリガー外 clear× の `!filterSheetOpen` ガード（背後で押せない）は UX 上適切で、計画（arch S-004）通り。
- **[N-005]** 公開状態をシート内ではネイティブ `<fieldset>` + `<legend>` + `<input type="radio">` 群で構成し、デスクトップの `role="menu" + menuitemradio` を流用していない（FilterBar.tsx:560-587）。APG 的に menu/listbox をモーダル内に入れ子にしない ADR-001 の方針に忠実で良い。`name` に `useId` 由来値を使う点も問題なし。
- **[N-006]** モバイルトリガーバーへ `aria-busy={isPending}` を引き継いでおり（FilterBar.tsx:464）、`max-sm:hidden` で消えるデスクトップラッパの pending 表現がモバイルでも欠落しない（arch S-006）。
