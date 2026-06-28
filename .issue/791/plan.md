# Issue #791 対応計画

## 概要

ノート本文ホスト `.note-detail-content` に折り返し制御がなく、空白を含まない長い文字列
（長い URL／英数字トークン）がコンテンツ幅を突き破り横スクロールが発生する。本文 HTML は
`dangerouslySetInnerHTML` 注入（ADR-002 の例外）のため、折り返し制御は `.note-detail-content`
側 CSS で行う。

## 原因

`app/styles/index.css` の `.note-detail-content` ベース規則（`192-197`）が
`color` / `max-width` / `font-size` / `line-height` のみで、`overflow-wrap` 等の
折り返し制御を持たない。空白で改行できない連続文字列が折り返されずはみ出す。

## 方針

- ベース規則 `.note-detail-content`（`app/styles/index.css:192-197`）に
  `overflow-wrap: anywhere;` を 1 行追加する。
- `overflow-wrap` は**継承プロパティ**なので、子孫の `p` / `a` / `li` / `td` 等の本文要素に
  自動で波及する。各要素に個別付与せず、ベース 1 箇所で全本文面をカバーする。
- `break-word` ではなく `anywhere` を採用する。`break-word` は min-content 固有幅を縮めない
  ため、`table-layout: auto` の GFM テーブルセル（Issue #693）に長い無空白トークンがあると
  列が押し広げられテーブルが横にはみ出す（実ブラウザ実測で 458px 残存を確認）。`anywhere` は
  折り返し位置を min-content にも反映するため、本文段落・リンクに加えテーブルセルも縮んで収まる。
- `pre`（`329-337`）はブラウザ既定の `white-space: pre` のまま（CSS で上書きしていない）。
  `white-space: pre` は行の折り返し自体が起きないため、継承された `overflow-wrap` は no-op。
  既存の `overflow-x: auto`（横スクロール）挙動はそのまま維持される。
- `word-break: break-all` は採用しない（通常語を文字単位で割って可読性を損なうため）。

### なぜベース 1 行で全共有面に効くか

`.note-detail-content` は以下すべてが着用する共有スタイルブロック。ベースに付ければ全面で効く。

- 読み取り面: `NoteDetail` / `PublicNoteDetail` / `NoteRevisionDetail` / `LegalDocument`
- 編集ホスト: `InlineEditor` / `HtmlEditor`

## 変更ファイル

- `app/styles/index.css`（`.note-detail-content` ベース規則に `overflow-wrap: break-word;` を追加）

## スコープ外

- 本文 HTML 構造の変更（ADR-002 により不可）
- `pre` / インラインコードブロックのスクロール挙動の変更
- 新規 UI 画面・デザイントークンの追加（→ Phase 1.5 デザインはスキップ）

## 受け入れ条件

- [ ] 空白なしの長い URL／英字列がコンテンツ幅内で折り返され、本文の横スクロールが出ない
- [ ] コードブロック（`.note-detail-content pre`）の横スクロール挙動は従来どおり維持
- [ ] 折り返し制御は `.note-detail-content` 側 CSS のみ、本文 HTML 構造は不変
- [ ] 全共有面（読み取り 4 面＋編集 2 ホスト）で折り返しが効く
- [ ] `pnpm typecheck && pnpm lint:fix && pnpm format` が通る
