# レビュー — PR #756 / Issue #754（規約準拠・デスクトップ不変・スコープ整合性）

**対象 PR:** #756
**観点:** プロジェクト規約準拠（CLAUDE.md Styling）/ デスクトップ不変（AC-4, 最重要）/ スコープ整合性（plan.md「含まれないもの」）
**レビュー日:** 2026-06-18

---

## 規約準拠・デスクトップ不変・スコープ

### Blockers

なし。

### Warnings

なし。

### Notes

- **[N-001] デスクトップ不変（AC-4）= 充足。** デスクトップのインライン UI への差分は次の2点のみで、いずれも描画結果を変えない。
  - `<div className={filterBar} … data-desktop-filters="">` への `data-*` 属性付与（additive、DOM 構造・描画不変）。
  - `filterBar` 定数（`app/components/note/list/styles.ts`）から **`max-sm:*` ユーティリティのみ撤去 + `max-sm:hidden` 追加**。デスクトップ実クラス（`flex flex-wrap items-center gap-3 mb-5 min-w-0`）は `git show main` と完全一致。撤去/追加された `max-sm:*` は定義上 `sm` 以上で発火しないため、デスクトップ描画は不変。

- **[N-002] `DateRangeFields` 抽出 = デスクトップ DOM 不変。** `app/components/note/list/FilterBar.tsx` で `DatePopover` 内側の「プリセットグリッド + 範囲入力」JSX を `DateRangeFields` 純コンポーネントへ切り出し。抽出後の JSX（`role="group"` / 同一 biome-ignore コメント / `grid grid-cols-3 gap-1.5` / 同一クラス文字列 / `SR_ONLY` ラベル + `DATE_INPUT_SM` input）は撤去前と byte 一致。`DatePopover` の外側 DOM（`Popover` シェル・クリア/閉じる行）は不変で、ADR-001 実装メモ・arch S-002 の「内側のみ抽出」方針どおり。AC-4 を割らない。

- **[N-003] `NotePickerDialog` のフラグメント直下への移動 = 描画位置不変。** `Dialog` は `createPortal(…, document.body)`（`app/components/common/Dialog.tsx:340,411`）でポータルするため、JSX ツリー上の親が `filterBar` div → フラグメント直下に変わっても実 DOM 出力位置は不変。`pickerOpen` の単一インスタンスが維持されており（旧インスタンス削除 + 新規1個）、重複なし。デスクトップ/モバイル共有の単一 picker という ADR 実装メモと整合。

- **[N-004] Styling 規約 = 準拠。**
  - 新規ユーティリティ文字列はすべて `styles.ts` に module-scoped 定数としてホイスト済み（`mobileFilterBar` / `mobileFilterTrigger` / `mobileFilterCount` / `filterSheetSection`）。JSX にインライン散在した文字列は、シート固有で1箇所のみ使用のもの（タグ件数 span・公開状態ラジオ行・クリアリンク等）に限られ、ホイスト規約の趣旨（繰り返し文字列の集約）に反しない。
  - 新規 CSS / `@apply` の導入なし（差分は `.tsx` / `styles.ts` のみ、`index.css` 改変なし）。
  - 使用トークンは全て実在を確認：`rounded-pill`（`--radius-pill`）/ `bg-surface`・`surface-hover`（`--color-surface` / `--color-surface-hover`）/ `bg-ink`・`text-ink`・`text-ink-tertiary`・`text-ink-secondary` / `bg-bg` / `border-hairline`。新トークン追加なし（スコープ「新トークン追加しない」を遵守）。
  - `data-*={value || undefined}` 規約に準拠：シート内タグチップ `data-active={active || undefined}`、プリセット `data-active={sel || undefined}`。`data-desktop-filters="" / data-mobile-filter="" / data-filter-sheet=""` は静的常時属性として `=""` 形式（ADR-003 準拠）。

- **[N-005] スコープ = 逸脱なし。** バックエンド（ドメイン/UC/アダプター）への変更ゼロ。差分は提示層（`FilterBar.tsx` / `styles.ts` / テスト）+ `.issue/` ドキュメントのみ。フィルター適用ロジック・URL search・`run()`/`reduceFilters`/`useOptimistic` の挙動は不変で、シート内コントロールは既存ハンドラ（`toggleTag` / `selectPreset` / `updateDate` / `selectVisibility` / `clearReferencingNoteId` / `clearAll`）を呼ぶだけ。ディレクトリ仕様（パンくず / dangling フォールバックチップ）も改変なし。`HomePage` / `FilterSection` 無改変（props シグネチャ不変）。

- **[N-006] import 整理 = 正しい。** `app/components/note/list/styles.ts` の `scrollbarHidden` import を削除。撤去後 `styles.ts` 内に `scrollbarHidden` 使用箇所が残っていないことを確認（grep 0 件、未使用 import lint 落ちなし）。`common/styles.ts` 側の `scrollbarHidden` 定数は残置（BulkActionBar 等が使用）。Step 2 の明示タスクどおり。

- **[N-007] JSDoc / ADR トレーサビリティ = 充足。** `filterBar` JSDoc を「#749 ADR-001（チップ行は横スクローラ）を #754 が更新：モバイルは集約シートへ移行」と更新済み（ADR-002 / Step 2 の要求）。新規定数にも用途・arch 制約（S-003: aria-pressed/aria-checked を付けない理由）を JSDoc で明記。ADR-002（モックからの意図的逸脱）が `.issue/754/adr.md` に残り追跡可能。`spec/design/` モック同期はスコープ外として明記済み。

- **[N-008] a11y 規約 = 妥当。** モバイルトリガーは `aria-haspopup="dialog"` + `aria-expanded` のみで状態表現し、`aria-pressed`/`aria-checked` を付けない（arch S-003、`tagButton` 全件走査との非衝突）。シート内公開状態はネイティブ `<fieldset>` + `<input type="radio">`、期間はネイティブ date input + トグルボタンで、ADR-001「シート内はデスクトップ menu/listbox を流用せずフォーム要素」方針どおり。シート a11y（フォーカストラップ/ESC/スクロールロック/トリガー復帰）は既存 `Dialog` primitive 任せで独自実装なし。

### 静的検査・テスト（AC-8）

- `pnpm typecheck` … PASS。
- `biome lint`（変更3ファイル）… 警告/エラー 0。リポジトリ全体の既存 lint 警告は本 PR の変更ファイル外（`NotePickerDialog.tsx` の non-null assertion 等の先行警告）であり本 PR 起因ではない。
- `biome format`（format:check）… 差分なし。
- `FilterBar.test.tsx` … 37 件全 PASS。テストヘルパー（`tagButton` / `buttonByText` / `radioItems`）のクエリ起点を `data-desktop-filters` ラッパへスコープ限定し、モバイル UI 追加によるセレクタ重複（happy-dom はメディアクエリ未評価で両 UI 共存）を回避。デスクトップ不変の機械的回帰テスト + モバイルシート系テストを追加。

---

## 総評

plan.md / adr.md の方針（集約トリガー + 既存 `Dialog` ボトムシート、デスクトップ完全温存、モバイル `max-sm` の CSS variant に閉じる）に忠実な実装で、CLAUDE.md Styling 規約・AC-4（デスクトップ不変）・スコープ境界のいずれにも逸脱なし。Blocker / Warning ともに検出されず。
