# TC-1: ツールバー圧縮とオーバーフローメニュー（AC-1/AC-3）モバイル390px
**結果**: PASS
## 実行ログ
| # | 操作 | 期待結果 | 実際の結果 | 判定 |
|---|------|---------|-----------|------|
| 1 | 390px で /notes/new を開き toolbar "書式" を snapshot | 主要6ボタン（太字/斜体/箇条書き/番号付きリスト/リンク/画像）+「その他の書式」(⋯) が並び、取り消し線/見出し2/見出し3/引用/インラインコードは直接見えない | 主要6ボタン + 「その他の書式」[expanded=false] が並ぶ。低頻度書式5種は toolbar 直下に非表示 | PASS |
| 1b | toolbar の scrollWidth/clientWidth を eval で測定 | 横スクロールなし | scrollWidth=358, clientWidth=358（overflowX=false） | PASS |
| 2 | 「その他の書式」(e25) をクリックしメニューを開く | 低頻度書式が menu/menuitem として並ぶ | menu "その他の書式" 内に menuitem: 取り消し線 / 見出し2 / 見出し3 / 引用 / インラインコード の5項目 | PASS |
| 3 | menuitem「見出し2」(e27) をクリック | 書式が適用され、メニューが閉じる | editor innerHTML が `<p>` → `<h2>` に変化。トリガー expanded=false（メニュー閉）| PASS |
| 4 | トリガーの aria-expanded 切替を確認 | 開いたら true、閉じたら false | 初期 false → クリックで true → 適用後 false → 再クリックで true → Esc で false。正しくトグル | PASS |
| 補 | roving tabindex（WAI-ARIA Menu） | 先頭項目 tabindex=0、残り tabindex=-1 | 先頭「取り消し線」tabindex=0、他は tabindex=-1。準拠を確認 | PASS |
| 補 | Esc でメニュー閉 + フォーカス復帰（AC-3 確認ポイント） | 閉じてトリガーへフォーカス復帰 | Esc でメニュー消失、document.activeElement が「その他の書式」トリガー | PASS |

## 備考
- testing.md step6（適用中書式のメニュー再オープン時チェック表示）は本 TC 必須（1〜4）の範囲外。参考確認では menuitem に aria-checked/aria-pressed/data-active は付与されておらず、選択位置依存のため本セッションでは決定的に確認できなかった（副次項目のため PASS 判定には含めない）。
