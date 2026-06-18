# レビュー (002) — PR #756 / Issue #754（規約準拠・デスクトップ不変・スコープ整合性）

**対象 PR:** #756
**観点:** プロジェクト規約準拠（CLAUDE.md Styling）/ デスクトップ不変（AC-4, 最重要）/ スコープ整合性（plan.md「含まれないもの」）
**レビュー:** 2回目フルレビュー（ゼロベース）。前回（review-001）以降に追加された focus-visible / SR_ONLY テキスト / `pr-10` を含む最新差分を精査。
**レビュー日:** 2026-06-18

---

## 規約準拠・デスクトップ不変・スコープ

### Blockers

なし。

### Warnings

なし。

### Notes

- **[N-001] focus-visible パターン = 既存に完全一致。** `mobileFilterTrigger`（`styles.ts:134`）に追加された
  `focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent` は、リポジトリ内の既存フォーカスリング
  （`ViewSwitcher.tsx:23/34` / `NoteCheckbox.tsx:23` / `dialogCloseButton`（`common/styles.ts:349`）/ `FilterBar.tsx` の
  `TAG_OPTION_ITEM`・`VISIBILITY_OPTION_ITEM` / `styles.ts` の各トグル）と同一の3トークン構成で、独自パターンの発明はない。
  `outline-accent` は `--color-accent`（`tokens.css:3`）を `index.css:6` の `@theme inline` でブリッジ済みのトークンで、実在を確認。
  新トークン追加なし。

- **[N-002] SR_ONLY テキスト追加 = a11y 規約に適合・モバイルスコープに閉じる。** トリガー内の件数バッジは
  `<span className={mobileFilterCount} aria-hidden="true">{count}</span>` + `<span className={SR_ONLY}>（適用中のフィルタ N 件）</span>`
  の二段構成（`FilterBar.tsx:480-487`）。視覚バッジを `aria-hidden`、SR 向けに語を補う既存パターンで、`SR_ONLY` 定数（`FilterBar.tsx:828`）を再利用。
  この span は `data-mobile-filter` バー内（トリガー `<button>` 配下）のみに存在し、デスクトップ（`data-desktop-filters`）サブツリーには
  一切混入しない。

- **[N-003] `pr-10` 追加 = 正当な必要利用（衝突回避）。** シート見出しは `` `${dialogTitle} pr-10` ``（`FilterBar.tsx:515`）。
  本シートは `showCloseButton` を立てるため `dialogCloseButton`（`absolute top-3 right-3 w-8 h-8`、`common/styles.ts:349`）が見出しに
  重なる。`dialogTitle` 利用の全14ダイアログを走査したところ、**`showCloseButton` を併用するのは本シートが唯一**（NotePicker/SaveView/
  MoveNote/BulkVisibility/BulkExport ほか全て非併用）であり、既存に「close ボタン + dialogTitle」の先例が無いのは妥当。`pr-10`（2.5rem）で
  右上 close ボタン（`right-3`=0.75rem + `w-8`=2rem ≈ 2.75rem 占有）下への文字回り込みを防ぐ補正で、`dialogTitle` 定数自体は不変・他ダイアログへ
  無影響。インライン1ユーティリティで、ホイスト規約（繰り返し文字列の集約）の趣旨にも反しない（単一箇所・単一用途）。新規CSS / `@apply` なし。

- **[N-004] デスクトップ不変（AC-4）= 充足（最新差分で再確認）。** デスクトップ系への差分は
  (1) `data-desktop-filters=""` の additive 属性付与、(2) `filterBar` 定数からの `max-sm:*` のみ撤去 + `max-sm:hidden` 追加 の2点のみ。
  デスクトップ実クラス `flex flex-wrap items-center gap-3 mb-5 min-w-0` は `git show main` と byte 一致。新規追加3要素
  （focus-visible / SR_ONLY テキスト / `pr-10`）はいずれも `mobileFilterTrigger`（line 468）/ 件数 span（line 485）/ `Dialog` シート見出し
  （line 515）に閉じ、`data-desktop-filters` ラッパ配下には一切現れない。`DateRangeFields` 抽出も内側 JSX のみで `DatePopover` 外側 DOM 不変。
  `pnpm typecheck` PASS、`FilterBar.test.tsx` 39件 PASS（デスクトップ系アサーションはラッパスコープ限定で意味不変）。

- **[N-005] Styling 規約 = 準拠。**
  - 新規ユーティリティ文字列は `styles.ts` の module-scoped 定数（`mobileFilterBar` / `mobileFilterTrigger` / `mobileFilterCount` /
    `filterSheetSection`）にホイスト済み。JSX 内インライン文字列はシート固有・単一箇所のもの（タグ件数 span・公開状態ラジオ行・期間/全クリアリンク・
    `pr-10` 補正）に限られ、ホイスト規約に反しない。
  - 新規 CSS / `@apply` の導入なし（差分は `.tsx` / `styles.ts` / テストのみ、`index.css`・`tokens.css` 改変なし）。
  - 使用トークンは全て実在：`outline-accent`(`--color-accent`) / `rounded-pill` / `bg-surface`・`surface-hover` / `bg-ink`・`text-ink` 系 /
    `bg-bg` / `border-hairline` / `--icon-xs`。新トークン追加なし。
  - `data-*={value || undefined}` 規約準拠：シート内タグチップ・プリセットの `data-active={x || undefined}`。
    `data-desktop-filters="" / data-mobile-filter="" / data-filter-sheet=""` は静的常時属性として `=""`（ADR-003 準拠）。

- **[N-006] スコープ = 逸脱なし。** バックエンド（ドメイン/UC/アダプター）変更ゼロ。差分は提示層（`FilterBar.tsx` / `styles.ts` / テスト）
  + `.issue/` ドキュメントのみ。フィルター適用ロジック・URL search・`run()`/`reduceFilters`/`useOptimistic` の挙動は不変で、シート内コントロールは
  既存ハンドラ（`toggleTag`/`selectPreset`/`updateDate`/`selectVisibility`/`clearReferencingNoteId`/`clearDateRange`/`clearAll`）を呼ぶだけ。
  `activeFilterCount` は表示用の純導出（`optimistic` 由来の単一式、`hasAnyFilter = count > 0` に一本化）で、適用ロジックには触れない。新トークン追加なし。
  焦点の3追加（focus-visible / SR_ONLY / `pr-10`）はいずれも a11y / 視覚補正であり、スコープ逸脱（適用ロジック・search・backend・新トークン）に当たらない。

### 静的検査・テスト（AC-8）

- `pnpm typecheck` … PASS。
- `biome lint`（変更3ファイル）… 警告/エラー 0。
- `FilterBar.test.tsx` … 39件全 PASS。

---

## 総評

前回（review-001）以降に追加された focus-visible リング / SR_ONLY 件数テキスト / 見出し `pr-10` は、いずれも
(a) 既存パターン・既存トークンの再利用、(b) モバイルトリガー / `Dialog` シートのスコープに完全に閉じる、(c) デスクトップ DOM・`dialogTitle` 定数・
適用ロジック・URL search・backend へ無影響、であることを最新差分で確認。CLAUDE.md Styling 規約・AC-4（デスクトップ不変）・スコープ境界の
いずれにも逸脱なし。Blocker / Warning ともにゼロ。
