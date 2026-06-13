# テスト実行サマリー — Issue #688

**実行日:** 2026-06-13
**テストソース:** .issue/688/testing.md
**サーバー:** http://localhost:3000
**ブラウザ:** agent-browser 0.27.1（innerWidth=1600 で外枠上限を検証）
**テストデータ:** ノート `幅検証ノート`（本文3段落、過去版1件）を UI 作成

| TC | テスト名 | 対応AC | 結果 | 要点（実測 px） |
|----|---------|--------|------|----------------|
| TC-1 | 一覧→詳細→編集で外枠/タイトル幅が揃う | AC-1,2,3 | PASS | 詳細タイトル=編集タイトル=1232（左右端完全一致） |
| TC-2 | 詳細・編集の本文プローズ幅 760px | AC-4 | PASS | 詳細本文=760 / 編集本文(inline)=760（左端一致） |
| TC-3 | 履歴一覧・過去版詳細 760px | AC-6 | PASS | 履歴 article=760 / 過去版 content=760 |
| TC-4 | 保存ビュー外枠 1280px | AC-1,5 | PASS | main=1280（padding 据え置き確認） |
| EC-1 | 狭ビューポート(390px)で横スクロール無し | — | PASS | home/detail/edit/history/revision/savedviews すべて scrollWidth==390 |

**合計:** 5 件（PASS: 5 / FAIL: 0）

## 核心の数値（innerWidth=1600）

- 詳細タイトル幅: 1232px（h1, left=314 right=1546）
- 編集タイトル幅: 1232px（titleInput, left=314 right=1546）→ **詳細と完全一致・ガタつき解消（本Issueの核心クリア）**
- 詳細本文幅: 760px（.note-detail-content, left=314）
- 編集本文幅: 760px（.note-detail-content inline, left=314）→ 左端一致
- 一覧メイン幅: 1280px（left=290 right=1570）
- 保存ビューメイン幅: 1280px（left=290 right=1570）
- 詳細 main=1280 / article=1232（760px 撤廃を確認、ヘッダー/タイトルが外枠まで広がる）
