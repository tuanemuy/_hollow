# ADR — Issue #693: ノート詳細でMarkdownテーブルの枠線が表示されない

## ADR-001: テーブルの視覚処理は admin テーブル(P47)ではなく採用デザイン Apple Calm(draft-4)に従う

### Status
Accepted

### Context
当初、テーブルのデザイン言語を admin metrics ページ（`spec/design/pages/P47-admin-metrics.html`）
の `.table` から抽出し、「全周ボーダー（`border:1px solid`）＋ヘッダ背景グレー
（`--color-surface-elevated`）」で実装した。これは見た目が GitHub Markdown の全周グリッド
テーブルに近い。

しかしレビューで方針を再確認したところ:
- `spec/design/index.md:4` — デザイン方向は **Apple Calm**（ミニマリズム + GitHub Markdown
  互換の本文表示）。
- `spec/design/index.md:75` — 「GitHub Markdown 風の本文レンダリングでも、**配色は Apple 側に
  寄せたやや低彩度のセットを使う**」。
- ここでの「GitHub Markdown 互換」は **機能・構造の互換**（GFM 構文をレンダリングする）であり、
  GitHub の全周グリッドという**ビジュアルを複製する意味ではない**。
- ノート本文のビジュアル SSOT は採用された Apple Calm モック
  （`spec/design/drafts/draft-4-apple-calm-detail.html:294-309`）。`.content table` は
  **横罫線（`border-bottom`）のみ・全周ボーダーなし・ヘッダ背景なし**で、ヘッダは太字
  （`font-weight:600`）＋濃いめの下罫線（`--hairline-strong`）で区別する。
- `.note-detail-content` の既存要素（p / h2 / blockquote / code / list）も全て draft-4
  apple-calm から作られており、admin テーブル流の装飾は本文サーフェスでは異質。

### Decision
admin テーブル(P47)流の全周ボーダー＋ヘッダ背景は採用せず、**Apple Calm draft-4 の本文
テーブルスタイルに忠実に寄せる**:
- `th/td`: `border-bottom: 1px solid var(--color-hairline)` のみ（全周ボーダー廃止）
- `thead th`: `font-weight: var(--weight-semibold)` ＋ `color: var(--color-ink)` ＋
  `border-bottom: 1px solid var(--color-hairline-strong)`（ヘッダ背景グレーは廃止）
- `table`: `width:100%` + `border-collapse: collapse`

外枠の角丸・横スクロールラッパーは付けない（draft-4 も付けていない。`dangerouslySetInnerHTML`
の本文にはラッパーを差し込む手段がなく、`border-collapse` 下では角丸も効かないため）。

### Consequences
- 良い点:
  - ノート本文の他要素（draft-4 apple-calm 由来）と視覚的に一貫する
  - 「GitHub の全周グリッドに見える」というデザイン不整合を解消する
  - Issue の主目的（罫線が出ない・ヘッダが区別されない）は横罫線＋太字ヘッダで満たす
- トレードオフ:
  - 画面幅を超える非常に広いテーブルは横スクロールされず、コンテナ内で折り返し/はみ出す。
    ノート本文のテーブルは通常 2〜4 カラムで実用上問題になりにくいと判断。
    将来ラッパーを挟む仕組み（NoteBodyRenderer 側で `<table>` を `<div>` 包む等）を
    入れる場合は横スクロールに拡張できる。
