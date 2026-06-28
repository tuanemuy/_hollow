# Issue #791 ブラウザ検証レポート

## 検証方法

修正対象は `.note-detail-content` の CSS 規則そのもの（`overflow-wrap`）。本文 HTML は
`dangerouslySetInnerHTML` 注入で構造に手を入れないため、検証の本質は「この CSS 規則が
実ブラウザでどう折り返すか」に尽きる。フルアプリ（D1＋認証＋シードノート）起動は
この決定的な CSS 挙動の確認に対して過大なため、`app/styles/index.css` の
`.note-detail-content` 関連規則（base / p / a / code / pre）を**そのまま**埋め込んだ
検証ハーネス（`/tmp/note791-harness.html`）を実ブラウザ（agent-browser 0.28.0 / Chromium）で
開き、モバイル相当の 360px コンテンツ列に長文字列・コードブロックを配置して
`scrollWidth - clientWidth` で横はみ出し量を実測した。

## テストケースと結果

ハーネスには本文段落・リンク・インラインコード・コードブロック（`pre`）・GFM テーブルを配置。

| TC | 観点 | 期待 | 実測 | 判定 |
|----|------|------|------|------|
| TC-001 | 長い URL／英字列が本文幅で折り返る | `.note-detail-content` の横はみ出し = 0px | content_overflow = **0** | PASS |
| TC-002 | コードブロック `pre` は従来どおり横スクロール | `pre` 内部スクロール > 0 | pre_internal_scroll = **511** | PASS |
| TC-003 | ページ全体に横スクロールが出ない | doc 横はみ出し = 0px | doc_overflow = **0** | PASS |
| TC-004 | GFM テーブルの長トークンセルもはみ出さない | table 横はみ出し = 0px | table_overflow = **0** | PASS |

### 3 状態の対比（同一ハーネスで `overflow-wrap` を切替え実測）

| `overflow-wrap` | content 横はみ出し | table 横はみ出し | `pre` 内部スクロール |
|------|------|------|------|
| `normal`（修正前） | **780px**（バグ再現） | 0px | 511px |
| `break-word`（初版） | **458px**（テーブルセルが残存） | 0px | 511px |
| `anywhere`（採用） | **0px** | 0px | 511px |

`break-word` は本文段落は折り返すが、`table-layout: auto` のテーブルセルに長い無空白トークンが
あると min-content が縮まず列が押し広げられ 458px のはみ出しが残った（PR レビュー W-001）。
`anywhere` は折り返しを min-content にも反映するため本文・テーブルとも 0px に収まり、
`pre` の横スクロール（511px）は全状態で不変＝コードブロック挙動に影響なし。

## 合計

4 件（PASS: 4 / FAIL: 0）。起票した Issue: なし。

## 備考

- 共有面（NoteDetail / PublicNoteDetail / NoteRevisionDetail / LegalDocument / InlineEditor /
  HtmlEditor）はすべて同一の `.note-detail-content` スタイルブロックを着用するため、
  ベース規則 1 箇所の修正で全面に効く（コード確認済み）。
- インラインコード（`<code>`、非 `pre`）も `overflow-wrap` 継承で折り返るが、
  受け入れ条件の対象外であり可読性向上に資するため許容。
