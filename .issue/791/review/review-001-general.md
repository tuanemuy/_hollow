# PR #796 レビュー — Issue #791（`.note-detail-content` 本文の折り返し）

対象差分: `app/styles/index.css` の `.note-detail-content` ベース規則に
`overflow-wrap: break-word;` を 1 行追加（+ 計画/動作確認ドキュメント）。

## General Review

### Blockers

- なし。

  本質的に正しい修正。`overflow-wrap` は継承プロパティ（CSS Text 仕様）であり、
  ベース 1 箇所への付与で `p` / `a` / `li` / `blockquote` / `h1-3` 等の本文要素へ波及する。
  `.note-detail-content` の CSS 定義はリポジトリ内で 1 箇所のみ（`app/styles/index.css:192-205`、
  grep で重複なしを確認）で、全共有面（`NoteDetail` / `PublicNoteDetail` /
  `NoteRevisionDetail` / `LegalDocument` / `InlineEditor` / `HtmlEditor`）がこの単一ブロックを
  着用するため、波及範囲の主張は妥当。`pre` は CSS で `white-space` を上書きしておらず
  ブラウザ既定の `white-space: pre`（折り返し不可）なので、継承された `break-word` は no-op となり
  `overflow-x: auto`（`index.css:341`）の横スクロールが保たれる。動作確認レポートの
  実測（本文はみ出し 780px→0px、pre 内部スクロール 511px 不変）と整合する。

### Warnings

- **[W-001]** テーブルセル（`td`/`th`）の長い無空白文字列は依然としてはみ出し得る
  — `app/styles/index.css:204`（影響先 `:423-435` の table 規則）。
  `overflow-wrap: break-word` は通常のブロックフロー（`p` 等）では確実に折り返すが、
  **min-content 固有サイズには影響しない**（min-content に影響するのは `overflow-wrap: anywhere`
  または `word-break: break-all` のみ）。`.note-detail-content table` は `width: 100%` だが
  `table-layout: auto` のため、列幅はセルの min-content を下限とする。
  したがってセル内の長い URL／ハッシュは折り返らずに列を押し広げ、テーブルには
  `overflow-x: auto` のラッパーが無いため横スクロールが残る余地がある。
  GFM テーブル（Issue #693 で導入済み）にセル内長文字列を含むノートが、この修正の主目的
  「本文の横スクロール解消」の対象になり得るため、計画/受け入れ条件の「全本文面で効く」は
  テーブルセルに関しては厳密には成立しない。動作確認（TC-001〜003）も `p`/`pre` のみで
  テーブルセルは未検証。
  対応案: (a) 本 PR のスコープ外として「テーブルセルの折り返しは別 Issue」と明記する、
  または (b) `.note-detail-content td, .note-detail-content th` に `overflow-wrap: anywhere`
  を併用する、または (c) テーブルを `overflow-x: auto` のラッパーで包む。
  最小修正の方針自体は支持するので Blocker ではないが、「全面に効く」という主張の精度として
  記録しておくべき。

### Notes

- **[N-001]** `word-break: break-all` を採らず `overflow-wrap: break-word` を選んだのは
  本文可読性の観点で妥当（通常語を字単位で割らず、はみ出す語だけ折る）。プロパティ選択は適切。

- **[N-002]** 動作確認は実アプリ起動ではなく、`.note-detail-content` の base/p/a/code/pre 規則を
  そのまま埋め込んだハーネスでの実測（agent-browser/Chromium）。決定的な CSS 挙動の確認としては
  合理的だが、ハーネスにはテーブル／wikilink pill／インラインコードの規則を含めていないため、
  これらの面の検証は「`overflow-wrap` が継承される」というプロパティ性質に依拠した推論であり
  実測ではない点は留意（W-001 と関連）。インラインコード（背景 pill 付き `<code>`）と
  wikilink pill（`inline-flex`）は継承で折り返るが、いずれも修正前は折り返し制御が無かったため
  リグレッションではなく改善方向。

- **[N-003]** コメント品質は CLAUDE.md のコメント方針に準拠。WHY（Issue #791・継承で 1 箇所集約・
  `pre` の white-space 前提）を簡潔に説明しており、ADR-002 の既存例外ブロック内への
  プロパティ追加であって新規例外の導入は無い。スタイル方針（ユーティリティファースト例外・
  ADR-002・トークン）への違反なし。なお動作確認レポートに自動ゲート
  （`pnpm typecheck && pnpm lint:fix && pnpm format`）の実行結果は明示されていない（受け入れ条件の
  最終項目）。CSS 一行追加のため影響は軽微だが、エビデンスとして残すのが望ましい。

## 結論

主目的（本文段落の長い URL／英字列による横スクロール）は確実に解消されており、
最小・低リスクで方針も適切。マージ可。ただし W-001（テーブルセルの未カバー）について、
スコープ外として明記するか追加対応するかを判断されたい。

---

## 対応記録（メイン）

- **[W-001]** → このPRで修正。`overflow-wrap: break-word` を `anywhere` に変更し、テーブルセルの
  min-content も縮むようにした。実ブラウザ実測で table 横はみ出し 458px → 0px を確認。
- **[N-003]** 自動ゲートのエビデンス: `pnpm typecheck`（pass）/ `pnpm lint:fix`（index.css にエラーなし）/
  `pnpm format`（変更なし）を実行済み。
