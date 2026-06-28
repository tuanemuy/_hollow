# TC-1: WYSIWYG ツールバーに「画像」ボタンが表示される（AC-1, AC-7）
**結果**: PASS
**セッション**: verify-tc-798
## 実行ログ
| # | 操作 | 期待結果 | 実際の結果 | 判定 |
|---|------|---------|-----------|------|
| 1 | ログイン → `/notes/new` を開く | 編集画面表示 | 表示成功（既定で WYSIWYG モード） | PASS |
| 2 | 書式ツールバー（role=toolbar, aria-label="書式"）を確認 | ツールバー存在 | 存在（11ボタン） | PASS |
| 3 | `aria-label="画像"` のボタン有無を確認 | 画像ボタンが1つ存在 | 存在（aria-label="画像", title="画像"） | PASS |
| 4 | ツールバー末尾・リンクの直後に並ぶか確認 | リンクボタン直後・末尾 | isLast=true, 直前要素=「リンク」 | PASS |
| 5 | `aria-pressed` 属性を持たないことを確認 | aria-pressed なし | hasAttribute("aria-pressed")=false（値 null） | PASS |
| 6 | enabled か確認 | enabled | disabled=false / `is enabled`=true | PASS |

ツールバーのボタン配列: 太字, 斜体, 取り消し線, 見出し 2, 見出し 3, 箇条書き, 番号付きリスト, 引用, インラインコード, リンク, 画像

## 失敗詳細（FAILの場合）
なし
