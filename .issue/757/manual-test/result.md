# ブラウザ検証結果 — Issue #757

**検証方法:** agent-browser で `spec/design/pages/mobile/P10-home.html` と
`spec/design/pages/P10-home.html` を `file://` で開き、モバイル幅(390)/デスクトップ幅(1100)で描画確認。
対象は静的デザインモック（インライン CSS 完結）のためアプリサーバー起動は不要。

## 結果サマリー: 4件 PASS / 0件 FAIL

| AC | 内容 | 結果 | 証跡 |
|----|------|------|------|
| AC-1 | mobile モックのフィルタ行が集約トリガー「絞り込み」+件数バッジ+クリア× | PASS | mobile-home-390.png（上部） |
| AC-2 | mobile モックに集約フィルターのボトムシート（開いた状態）が表現 | PASS | mobile-sheet-context.png |
| AC-3 | desktop モックが <640px でチップ列→集約トリガーへ切替、デスクトップ幅は不変 | PASS | desktop-1100.png / desktop-mock-390.png |
| AC-4 | #749 ADR-001 横スクローラ前提が #754 で更新された旨をコメント反映 | PASS | diff（コメント） |

## 確認できたこと
- mobile: 横スクロールのチップ列は撤去され、`SlidersHorizontal` アイコン + 「絞り込み」+ 件数バッジ(2) + クリア× の集約トリガーに置換。
- mobile シート: グラバー + クローズ× + 「絞り込み」見出し、タグ(折り返しチップ)、期間(プリセット3列グリッド+範囲入力+期間クリア)、公開状態(fieldset ラジオ群+スウォッチ色)、内部リンク参照(ノートを選択ゴースト)、全クリアリンク。暗転背景の下端ボトムシート見えも確認。
- desktop 1100px: 既存のインラインチップ列が変化なく表示（集約トリガーは display:none）。
- desktop 390px: インラインチップ列が隠れ、集約トリガーへ切替。

## スクリーンショット
- mobile-home-390.png / mobile-home-full.png — mobile モック全体
- mobile-sheet-context.png — シート（暗転背景込み）
- desktop-1100.png — desktop 幅（チップ列・不変）
- desktop-mock-390.png — desktop モックの mobile 幅（集約トリガー）
