# TC-edge2: オーバーフローメニューの dismiss
**結果**: PASS
## 実行ログ
| # | 操作 | 期待結果 | 実際の結果 | 判定 |
|---|------|---------|-----------|------|
| 1a | ⋯ トリガー(e26)をクリックしメニューを開く | メニューが開く | role=menu が open | PASS |
| 1b | Escape を押す | メニューが閉じ、⋯ トリガーへフォーカス復帰 | menu=closed、activeElement=「その他の書式」、trigger expanded=false | PASS |
| 2a | 再度 ⋯ を開く | メニューが開く | role=menu が open | PASS |
| 2b | メニュー外（タイトル入力 e13）をクリック | メニューが閉じる | menu=closed、trigger expanded=false | PASS |

## 備考
- Escape / 外側クリックのいずれでもメニューが確実に dismiss され、Escape 時はトリガーへフォーカスが復帰することを確認（WAI-ARIA Menu パターン準拠）。
