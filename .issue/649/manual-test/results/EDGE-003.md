# EDGE-003: 長いビュー名の見出し折り返し

**結果: PASS**

## 実行ログ

| # | 手順 | 結果 |
| --- | --- | --- |
| 1 | 49 文字・空白なし英数字の保存ビュー `TestLongViewName649AAAAABBBBBCCCCCDDDDDEEEEE12345`（seed 済み）を `/?display=list&viewId=...649003` で適用 | OK |
| 2 | viewport を 375×667（iPhone SE）に設定 | OK |
| 3 | 折り返し確認 | 見出しトリガーの computed `overflow-wrap: anywhere`。名前は 3 行に折り返し（トリガー高 83px）、`document.scrollWidth > innerWidth` = false（横はみ出しなし） |
| 4 | chevron 縦中央揃え | chevron 中心とトリガー中心の差 0px |
| 5 | タッチ床 | トリガー `min-height: 44px` |
| 6 | スクリーンショット /tmp/edge-003.png で目視確認（フィルタ「アイデア」適用・1 件表示も正常） | OK |
