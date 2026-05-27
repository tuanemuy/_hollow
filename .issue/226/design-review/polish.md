# Design Polish — Issue #226 Upload Preview Modal

出荷前の最終品質パス。アライメント・スペーシング・一貫性・ディテールに絞って手を入れた。デザインモック (`spec/design/pages/P13a-upload-modal.html`) を基準に、既存ダイアログ（`SaveViewDialog` / `MoveNoteDialog` 等）との見た目連続性を担保する方向で調整。

## 修正したファイル

### app/components/ingestion/IngestionPreviewForm.tsx

- **フォーム container の縦余白の二重がけを解消**
  - before: `<form onSubmit={onSubmit} className="flex flex-col gap-4">`
  - after: `<form onSubmit={onSubmit}>`
  - 各 `<div className={field}>` は `field = "flex flex-col gap-2 mb-4"` で既に 16px の下マージンを持つため、container の `gap-4` と合わせて 32px のダブル余白になっていた。`SaveViewDialog` / `MoveNoteDialog` 等の既存パターンに合わせ container の gap を撤去し、`field` の `mb-4` 単独で 16px に統一。これはモックの `.field-block { margin-bottom: 16px; }` と一致する。

- **本文プレビューの max-height をモックに合わせて 240px に短縮**
  - before: `max-h-[280px]`
  - after: `max-h-[240px]`
  - モック `.readonly-content { max-height: 240px; }` と一致。モーダル全体の縦長を抑制する。

- **FrontMatter textarea の min-height をモックに合わせて 140px に短縮**
  - before: `min-h-[160px]`
  - after: `min-h-[140px]`
  - モック `.field-textarea { min-height: 140px; }` と一致。既存 `fieldTextarea` の 320px はフルページエディタ用の値なので、モーダル文脈で明示的にオーバーライド済み。

### app/components/ingestion/UploadDialog.tsx

- **ハードコード px の text サイズを tokens.css 由来の utility に置換**（SSOT 尊重）
  - SelectView 「複数選択にも対応」: `text-[13px]` → `text-xs`（モック 12px と一致、`text-xs = clamp(11px, ..., 12px)`）
  - WaitingView 「数十秒かかることがあります」: `text-[12px]` → `text-xs`
  - FailedView エラー詳細: `text-[13px]` → `text-sm`（`text-sm = clamp(12px, ..., 13px)`、上限が同じ）
  - MultiResultView 補足文: `text-[13px]` → `text-sm`
  - MultiResultView 失敗ファイル一覧: `text-[12px]` → `text-xs`
  - TimedOutView 補足文: `text-[13px]` → `text-sm`
  - 視覚的には同等だが、レスポンシブ環境で clamp が効くようになり、tokens.css の "Typography" SSOT に揃う。

- **アクション行の top-margin をモーダル全 view で `mt-4` に統一**
  - before: MultiResultView と TimedOutView で `mt-5`、FailedView で `mt-4`
  - after: 3 view すべて `mt-4`
  - 共通 `dialogActions = "inline-flex gap-2 mt-4 justify-end w-full"` の値と揃え、モーダル内アクション行の余白を一貫化。

- **UploadingView / WaitingView の縦パディングをモックに合わせて `py-8` に統一**
  - before: UploadingView `py-12` (48px) / WaitingView `py-10` (40px)
  - after: 両方 `py-8` (32px)
  - モック `.skeleton { padding: 32px 0; }` と一致し、2 view 間の縦サイズもブレが消える。

## 修正カテゴリ別サマリー

### Alignment
- フォーム内の見出し・ラベル・本文プレビュー・アクションバーの軸揃えは既に揃っていたため、構造変更は行っていない。
- `IngestionPreviewForm` のスティッキー action bar (`-mx-6 -mb-6` で panel padding を打ち消し、`border-t border-hairline` で区切る) はモックと同等の構造で、垂直軸も問題なし。

### Spacing
- フォーム要素間の縦リズムを `mb-4`（16px）の単一階層に揃えた（最重要修正）。これによりタイトル → ディレクトリ fieldset → タグ → FrontMatter → 本文プレビュー → action bar が均等な 16px ピッチで並ぶ。
- スケルトン領域の padding を `py-8` に統一（モック準拠）。
- アクション行の top margin を `mt-4` に統一。

### Consistency
- `text-[13px]` / `text-[12px]` のハードコード px を `text-sm` / `text-xs` トークンに揃えた。CLAUDE.md の "`tokens.css` を SSOT" 方針に沿う。
- 似た要素（補足文・キャプション・エラー詳細）が同じ utility を使うようになり、レビュー時の差分が減る。
- WaitingView と UploadingView は同じ "スケルトン + 進捗テキスト" のレイアウトなのに padding が違っていたのを統一。

### Details
- 本文プレビューと FrontMatter textarea のサイズをモック値に揃え、モーダル全体の縦長をモック想定に収束させた。
- 細部のレイアウト・色・border-radius・hover 状態・disabled 状態は既存 `field` / `fieldControl` / `pillBtn` / `PILL_BTN` / `dialog*` のトークンに乗っているので追加変更なし。
- focus visible / disabled は既存 `disabled:opacity-55 disabled:cursor-not-allowed` および `:focus-visible { box-shadow: var(--shadow-focus); }`（base layer）で担保済み。

## 検証結果

- `pnpm typecheck`: ✓（エラーなし）
- `pnpm lint:fix`: ✓（本変更分はクリーン。既存 `view.test.ts` の警告 7 件は本 Issue 範囲外）
- `pnpm format`: ✓（No fixes applied）
- `pnpm test:unit`: ✓（128 files, 2516 tests passed）

## 判断・メモ

- **モックとの乖離はほぼゼロに収束**。スティッキー action bar の `bottom-0` vs モック `bottom: -24px` は、Tailwind の `-mb-6` で 24px 分突き出す現状実装の方が意図を素直に表現していると判断し、踏襲した。
- **dialog 内 `<form>` の `gap-4` 削除**は、既存ダイアログ群（`SaveViewDialog` / `MoveNoteDialog` / `BulkExportDialog` 等）の踏襲でもある。`IngestionPreviewForm` だけが浮いた書き方をしていたのを揃えた格好。
- **タイトル `dialogTitle = "text-lg ..."` vs モック `font-size: 17px`** は base が同サイズで clamp の上限が 19px。常識的なレスポンシブで許容範囲のため変更なし。
- **`PILL_BTN`（layout/styles.ts）と `pillBtn`（common/styles.ts）の二系統共存**は、`IngestionJobRow` 等の既存 ingestion コンポーネントとの視覚連続性のため `PILL_BTN` を選択するなど合理的な使い分けがされていて、本 Issue で統合するのはスコープ外。フォローアップ候補。
- **`DirectoryPicker` の `fieldset` 内側のラベル `<legend>`** はモック (`fieldset.dir-set legend`) と一致。手は入れていない。
