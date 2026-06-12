# TC-E3 ピッカーを開いたままのフィルタクリア整合（エッジ）

結果: PASS

セッション: verify-tc-003 / URL: http://localhost:3001/ / dev-admin

## 実行ログ

| # | 操作 | 期待結果 | 実際 | 判定 |
|---|---|---|---|---|
| 1 | タグ複数選択状態（tagNames=["test-tag-02","test-tag-01"]）でピッカーを開き Escape | 閉じる | Escape 前 listbox 存在（true）→ Escape 後 listbox 消失（false） | PASS |
| 2 | 「フィルタをすべてクリア」をクリック | フィルタ解除、一覧が全件に戻る | URL クエリ空（`""`）、一覧 14 件、`aria-pressed="true"` のチップ 0 個 | PASS |
| 3 | 再度「タグで絞り込み」を開き option の aria-selected を確認 | 全 option が `aria-selected="false"` | option 14 件、selected=true は 0 件、`allFalse: true` | PASS |

## 備考

- TC-4 で確認したとおり選択操作のたびにパネルは閉じるため、本ケースの前提「ピッカーを開いたまま複数選択」は「複数選択済み状態でピッカーを開き直して Escape」で代替した。クリア整合自体は問題なし。
