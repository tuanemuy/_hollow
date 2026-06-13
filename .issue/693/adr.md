# ADR — Issue #693: ノート詳細でMarkdownテーブルの枠線が表示されない

## ADR-001: テーブル外枠の角丸・横スクロールラッパーを採用しない

### Status
Accepted

### Context
ノート本文は `dangerouslySetInnerHTML` で挿入され、`.note-detail-content` 配下に
markdown-it が生成した `<table>` がラッパー要素なしで直接置かれる。
プロジェクトのテーブルデザイン言語（`spec/design/pages/P47-admin-metrics.html`）は
`.table-wrap` という外側 div に `border-radius` + `overflow:hidden` を持たせ、
広いテーブルの横スクロールもこのラッパーで吸収している。
ノート本文側にはこのラッパーを差し込む手段がない（本文 HTML は描画時に動的生成され、
個々の要素に utility class も付けられない — ADR-002 の例外領域）。

選択肢:
- (A) `table` 自身に `border-radius` + `overflow:hidden` を付ける
- (B) `table` を `display:block; overflow-x:auto` にして横スクロール対応
- (C) ラッパー前提の装飾（角丸・スクロール）は採用せず、罫線とヘッダ区別に限定する

### Decision
(C) を採用。`.note-detail-content table/th/td/thead th` に
`border-collapse: collapse` + `--color-hairline` 罫線 + ヘッダ背景のみを定義し、
外枠の角丸と横スクロールラッパーは付けない。

### Consequences
- 良い点:
  - Issue の主目的（罫線が出ない・ヘッダが区別されない）を過不足なく解決する
  - admin テーブル（P47）と同じトークン・罫線色で視覚的に統一される
  - (A) の `border-collapse: collapse` × `border-radius` で生じる角の二重線・
    四角い角の描画崩れを回避できる（collapse ではセル罫線がラッパーなしに丸めきれない）
  - (B) の `display:block` でテーブルがコンテナ幅まで伸びず内容幅に縮む違和感を回避できる
- トレードオフ:
  - 画面幅を超える非常に広いテーブルは横スクロールされず、コンテナ内で折り返し/はみ出す。
    ノート本文のテーブルは通常 2〜4 カラムで実用上問題になりにくいと判断。
    将来ラッパーを挟む仕組み（NoteBodyRenderer 側で `<table>` を `<div>` 包む等）を
    入れる場合は P47 同等の角丸＋スクロールに拡張できる
