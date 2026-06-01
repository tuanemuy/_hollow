# ADR — Issue #382: テキスト併記が冗長なボタンをアイコンのみに整理する

## ADR-001: アイコンのみ化の accessible name は親要素の aria-label で担保する

### Status
Accepted

### Context
可視テキストを外したボタンには、スクリーンリーダー向けのアクセシブルネームが必要。本プロジェクトの `Icon` コンポーネント（`app/components/common/Icon.tsx`）は `label` prop を受け取ると SVG に `role="img"` + `aria-label` を付け、省略時は `aria-hidden="true"` の装飾扱いになる。Icon の JSDoc は明確に「アイコンが `<button>` の唯一の可視子のときは `label` を省略し、`aria-label` を親 `<button>` 側に置く（両方付けると accessible name が二重化する）」と規定している。

選択肢:
- (a) `Icon` に `label` を渡してアイコン自身にアクセシブルネームを持たせる
- (b) 親 `<button>`/`<Link>` に `aria-label` を付け、`Icon` は装飾（`aria-hidden`）のままにする

### Decision
(b) を採用。親要素に `aria-label` を付与し、`Icon` には `label` を渡さない。これは Icon の JSDoc 規約および既存の icon-only 実装（`MenuButton`、`WysiwygEditor` のツールバー、`BulkActionBar` の ×）と一貫する。

### Consequences
- 良い点: 既存の確立パターンと完全に一致。accessible name の二重化を防ぐ。
- トレードオフ: なし。

---

## ADR-002: 高優先度のみアイコンのみ化し、中・低優先度はテキストを維持する

### Status
Accepted

### Context
Issue は対象を高 / 中 / 低の3段階に整理している。中優先度（公開設定 `Globe`、エクスポート `Download`、復元 `RotateCcw`）はアイコンが多義的でテキスト維持も可、低優先度（削除系・リネーム・統合・移動・再生成・ノートを開く）は破壊的・専門的・多義的でテキスト維持が望ましい、とされる。Issue 補足にも「判断に迷う中・低優先度の箇所はテキストを維持する」とある。

### Decision
本Issueでは高優先度のうち「未対応のもの」だけをアイコンのみ化する:
- NoteActions: 編集（`Pencil`）/ 複製（`Copy`）
- NoteListToolbar: 新規作成（`Plus`）/ アップロード（`Upload`）を全ブレークポイントで

既にアイコンのみの MenuButton・WYSIWYG ツールバー・BulkActionBar の × は対応不要。中・低優先度はテキスト維持。`NoteListToolbar` の「選択」「ビューとして保存」は高優先度リスト外のため現状維持。

### Consequences
- 良い点: 誤操作リスク（破壊的操作）と認知負荷（多義的アイコン）を避けつつ、明確なアイコンだけ整理。Issue の意図とスコープに忠実。
- トレードオフ: ツールバー内にアイコンのみボタンとアイコン+テキストボタンが混在する。ただし破壊的操作のテキスト維持は誤操作防止の観点で許容される一貫性のなさ。

---

## ADR-003: マウスユーザー向けに title 属性を付ける（UploadButton は例外）

### Status
Accepted

### Context
アイコンのみボタンはマウスユーザーがホバーで意味を確認できると親切。WYSIWYG ツールバーは既に `aria-label` + `title` の両方を付けている。一方 `UploadButton` の `Props` は `aria-label` のみを中継し、`title` を中継しない。

### Decision
直接 `<button>`/`<Link>` を持つ箇所（NoteActions の編集・複製、NoteListToolbar の新規作成）には `title` を付与する。`UploadButton` 経由のアップロードは、最小変更を優先し `aria-label` のみで担保する（`title` 中継の追加は本Issueの整理目的に対し過剰なため見送る）。

### Consequences
- 良い点: WYSIWYG ツールバーのパターンと揃う。最小変更で済む。
- トレードオフ: アップロードボタンだけホバーツールチップが出ない。a11y（accessible name）は `aria-label` で担保済みのため実害は軽微。
