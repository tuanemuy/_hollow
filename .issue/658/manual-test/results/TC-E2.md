# TC-E2（既知の制限）VISIBLE_TAG_LIMIT 超タグの選択

- 結果: **PASS**
- セッション: verify-tc-006 / URL: http://localhost:3001/ / viewport: 1280x800 / dev-admin
- 前提: タグ test-tag-01〜14、VISIBLE_TAG_LIMIT=12（13・14 は「もっと見る (+2)」に畳まれる）

## 実行ログ

| # | 操作 | 期待結果 | 実際 | 判定 |
|---|---|---|---|---|
| 1 | ピッカーを開き option「#test-tag-13」をクリック | 一覧が絞り込まれ URL に tagNames 反映 | URL = `/?tagNames=%5B%22test-tag-13%22%5D`、件数表示「1 件のノート」 | PASS |
| 2 | バーのチップ列を観察 | test-tag-13 のチップはバーに現れない | バーは test-tag-01〜12 + 「もっと見る (+2)」のまま。test-tag-13 チップは出現せず（既知の制限どおり） | PASS |
| 3 | 「もっと見る (+2)」を展開し選択中タグを確認 | tag-13 チップが aria-pressed="true" で見え、クリックで解除可能 | 展開後 `#test-tag-13` チップが `aria-pressed="true"` で表示。クリックで解除され URL が `/` に戻った | PASS |

## 備考

- ピッカー内 listbox には 14 タグすべてが option として列挙され、畳まれたタグも選択可能。
- 手順 1 で snapshot の ref 指定クリック（@e65）がページ更新で stale になりノート詳細へ誤遷移したため、テキストマッチによる option クリックでやり直して検証した（アプリ側の問題ではない）。
