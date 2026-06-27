# PR #796 レビュー Round2 — Issue #791（`.note-detail-content` 本文の折り返し）

対象差分（ローカル working tree vs main、push 前の修正含む）:
`app/styles/index.css` の `.note-detail-content` ベース規則に `overflow-wrap: anywhere;` を
1 行追加（+ 説明コメント）。前ラウンドの `break-word` は本ラウンドで `anywhere` に変更済み。

```css
.note-detail-content {
  color: var(--color-ink);
  max-width: var(--content-max);
  font-size: var(--text-base);
  line-height: var(--leading-relaxed);
  /* ... Issue #791 ... */
  overflow-wrap: anywhere;
}
```

## General Review

### Blockers

- なし。

  本質的に正しく、最小・低リスクの修正。`overflow-wrap` は継承プロパティ（CSS Text 仕様）で、
  ベース 1 箇所への付与で子孫（`p` / `a` / `li` / `blockquote` / `td` / インライン `code` /
  wikilink pill / hashtag）へ波及する。`.note-detail-content` の CSS 定義はリポジトリ内で
  **1 箇所のみ**（`app/styles/index.css:192`、`grep "\.note-detail-content {"` で重複なしを確認）。
  全共有面（`NoteDetail` / `PublicNoteDetail` / `NoteRevisionDetail` / `LegalDocument` /
  `InlineEditor` / `HtmlEditor`、加えて `CodeHighlight` / `QRCodeBlock` も同クラス着用）が
  この単一ブロックを着用するため、波及範囲の主張は妥当。`pre`（`index.css:340`）は CSS で
  `white-space` を上書きしておらずブラウザ既定の `white-space: pre`（折り返し不可）なので、
  継承された `anywhere` は no-op となり `overflow-x: auto`（`index.css:344`）の横スクロールが保たれる。
  動作確認レポートの 3 状態対比（content はみ出し `normal:780 → break-word:458 → anywhere:0`、
  table はみ出し全状態 0、`pre` 内部スクロール全状態 511 不変、TC-001〜004 PASS）と整合する。
  前ラウンドの W-001（テーブルセルはみ出し）は `anywhere` 採用で min-content も縮むため解消
  （実測 458px → 0px、TC-004）。受け入れ条件は全項目充足。

### Warnings

- なし。

### Notes

- **[N-001]** `anywhere` 採用はプロジェクトの既存規約に整合。本リポジトリは
  `[overflow-wrap:anywhere]` を全面的に採用しており（`NoteDetail.tsx:128` の本文タイトル h1、
  `note/list/ViewSwitcher.tsx`、`FilterBar.tsx`、`NoteMetaPanel.tsx`、`Breadcrumb.tsx`、
  `common/styles.ts` 等、20 箇所超）、`break-word` は使用箇所ゼロ。よって `anywhere` は
  ハウススタイルそのもので、前ラウンド N-001 の「`break-word` が可読性で妥当」という評価より
  本ラウンドの `anywhere` の方が一貫性が高い。`word-break: break-all` を避けた判断も妥当
  （`anywhere` は折り返さないと溢れる箇所だけ割り、通常語・CJK は字単位で割らない）。

- **[N-002]** inline-flex な wikilink pill（`.wikilink`、`index.css:280`）への副作用は
  実害なし・改善方向。`anywhere` は「溢れを避けるために必要な箇所でのみ」改行機会を使うため、
  短いラベルは従来どおり折り返さない（min-content が ~1ch に縮んでも、inline-flex pill は
  inline 流で content サイズに伸びるため squish されない。親 `.note-detail-content` は
  block でありフレックスコンテナではないので pill が圧縮される経路もない）。
  ごく長い無空白ラベルのみ pill 内で複数行に折り返り得る（`::before` ドットは
  `align-self: center` で第 1 行頭に残る）。極端なエッジケースで pill が縦に伸びる見た目は
  通常とやや異なるが、修正前の「pill ごと幅突き破り」よりは確実に改善で、許容範囲。
  インライン `code`（非 `pre`、`white-space: normal`）も継承で折り返るようになり可読性改善。

- **[N-003]** `table-layout: auto` の GFM テーブル（`index.css:426`）は `anywhere` により
  列が min-content（~1ch）まで縮み得るため、狭ビューポートで幅広テーブルは横スクロールせず
  積極的に折り返す挙動になる。これは「テーブルに `overflow-x` ラッパーを置かない」採用デザイン
  （Apple Calm mock、`index.css:418-424` のコメント）と本 Issue の目的（ページ横スクロール解消）
  に沿った意図的トレードオフであり、欠陥ではない。記録のみ。

- **[N-004]** ADR-002 準拠を確認。差分は既存の例外ブロック（`@layer components`、
  `index.css:191`）内への CSS プロパティ追加のみで、本文 HTML 構造（`dangerouslySetInnerHTML`）
  には一切手を入れていない。新規例外の導入もなし。コメントは WHY（Issue #791・継承で 1 箇所集約・
  `anywhere` vs `break-word` の min-content 差・`pre` の white-space 前提）を簡潔に説明しており
  CLAUDE.md のコメント方針に準拠。

- **[N-005]** 受け入れ条件「`pnpm typecheck && pnpm lint:fix && pnpm format` が通る」について、
  CSS 一行追加のため typecheck への影響は皆無。本レビューで独立に
  `biome format app/styles/index.css` / `biome check app/styles/index.css` を実行し、
  いずれも「No fixes applied」でクリーンであることを確認済み。

## 結論

主目的（本文の長い URL／英字列・テーブルセル長トークンによる横スクロール）は確実に解消。
前ラウンド W-001 も `anywhere` 採用で実測解消され、副作用はすべて中立または改善方向。
プロジェクト規約（`[overflow-wrap:anywhere]`）とも一致し、ADR-002・スタイル方針に違反なし。
**マージ可。**
