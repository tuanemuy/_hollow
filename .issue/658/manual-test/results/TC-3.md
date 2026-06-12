# TC-3 タグピッカーパネルの表示内容（AC-4）

結果: PASS

セッション: verify-tc-003 / URL: http://localhost:3001/ / dev-admin

## 実行ログ

| # | 操作 | 期待結果 | 実際 | 判定 |
|---|---|---|---|---|
| 1 | 「タグで絞り込み」(aria-label) ボタンをクリック | パネルが開く | `aria-expanded="true"`、`role="listbox"` が出現 | PASS |
| 2 | eval で listbox を検査 | `aria-multiselectable="true"`、全14タグが option で `#test-tag-XX` + 件数バッジ付き | `aria-multiselectable="true"`、option 数 14。各 option テキストは `#test-tag-01`〜`#test-tag-14` + 件数（tag-02/03 は 2、他は 1）。バーで「もっと見る」に畳まれている tag-13/14 もピッカーには表示 | PASS |
| 3 | 各 option の aria-selected | 未適用タグは `aria-selected="false"` | 14 option すべて `aria-selected="false"` | PASS |

## 備考

- eval 結果: `{"multi":"true","count":14,"opts":[{"t":"#test-tag-011","sel":"false"}, ... 14件すべて sel:"false"]}`
