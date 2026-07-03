# 残存課題・観察メモ — Issue #723

本 Issue（P12 エディターモックの FrontMatter 下部常設追従）はスコープを完了。以下は本筋の外にある観察で、いずれも本 PR では対応せず記録に留めたもの。**新規 Issue は起票していない**（いずれも非出荷のデザインモック限定で軽微・pre-existing のため、トラッカーを散らかさない判断）。

## 見送った観察

### 1. mobile モックの `.mode-tabs` が APG 属性を欠く（pre-existing / スコープ外）

- 場所: `spec/design/pages/mobile/P12-editor.html` の `.mode-tabs`
- 内容: desktop モックは #776 で編集モードタブが APG Tabs 化（`role=tab` + `id` + `aria-controls` → tabpanel、roving tabindex）されたが、モバイルモックには #776 が及んでおらず、`role="tablist"/"tab"` のみで `aria-controls`/`id`/roving tabindex を欠く。
- 判断: 本 PR は FrontMatter 追従（タブ除去 + 下部常設）に限定。APG 化はモバイル全モックにまたがる #776 系の別スイープであり、本 Issue のスコープ外。本 PR で悪化はさせていない（FrontMatter タブ除去のみ）。非出荷モックの装飾的 a11y のため単独起票は見送り。

### 2. desktop モックのタブ構成と本文コンテンツの不整合（pre-existing / #776 由来）

- 場所: `spec/design/pages/P12-editor.html`
- 内容: モック本文は「編集中の既存ノート」（保存済み2分前・本文あり）を描くが、モードタブは新規セット（`WYSIWYG / HTML`、`ビジュアル`(inline) なし）。実装では既存ノートは `ビジュアル / WYSIWYG / HTML`。
- 判断: #776 のタブ再構成時に生じた既存の不整合で、本 Issue（FrontMatter 追従）のスコープ外。plan.md「スコープ・リスク」に既述の通り温存。

### 3. 静的モックの微小な忠実度差（Note レベル・許容）

- 「キーを追加」ボタン: 実装は空入力時 disabled だが、モックは追加アフォーダンスを見せる静的表現として活性のまま（レビュアーも Note 判定）。
- fm-row の sr-only `<label>` は for/id 未関連付けだが、各入力の `aria-label` が accessible name を提供するため実害なし。
- いずれもデザインモックとして許容範囲であり、修正不要と判断。
