# TC-5: clear-all 導線（AC-5）

**結果: PASS**

## 手順と実行ログ

| ステップ | コマンド | 結果 |
| --- | --- | --- |
| 1 | `/?directoryId=...742` を表示 | OK |
| 2 | ツールバーに `button "フィルタをすべてクリア"` (@e31) が存在することを snapshot で確認 | OK |
| 3 | @e31 をクリック → wait networkidle → get url | `http://localhost:3000/` |

## 判定根拠

- ディレクトリ選択時、ツールバーに「フィルタをすべてクリア」ボタンが表示されている。
- クリックすると directoryId を含む全フィルタが解除され `/` に戻る。

## 補足

`find text "フィルタをすべてクリア"` と CSS セレクタ `button:has-text(...)` は当環境の agent-browser で not found となったため、snapshot の a11y ref (@e31) を用いてクリックした（動作確認には影響なし）。
