# TC-TAG 検証結果（Issue #776 並び替え軸 segmented）

- 環境: http://localhost:3000 / アカウント dev-login@example.com
- セッション: verify-tc-tag（agent-browser）
- 実施日: 2026-06-26

## サマリー

| テストケース | 判定 |
| --- | --- |
| TC-TAG-1: 並び替え軸 segmented が radiogroup として動作（キーボード） | PASS（注意点1件あり: ナビゲーション再描画後にフォーカスが body に脱落） |
| TC-TAG-2: sort/order 選択と URL 反映（AC-3） | PASS |

## ARIA 契約 eval（生の結果 / 初期状態 sort=name）

```json
{
  "groupRole": "radiogroup",
  "ariaOrientation": "horizontal",
  "items": [
    {"role":"radio","ariaChecked":"true","tabindex":"0","text":"名前"},
    {"role":"radio","ariaChecked":"false","tabindex":"-1","text":"ノート数"},
    {"role":"radio","ariaChecked":"false","tabindex":"-1","text":"作成日時"},
    {"role":"radio","ariaChecked":"false","tabindex":"-1","text":"最終使用"}
  ],
  "hasTablist": false,
  "ariaSelectedAny": false
}
```

期待値（groupRole=radiogroup / aria-orientation=horizontal / 各 item role=radio + aria-checked / 選択 item のみ tabindex=0 他 -1 / hasTablist=false / ariaSelectedAny=false）と完全一致。tab パターンの誤用なし。

## TC-TAG-1 実行ログ

| 操作 | 期待 | 実際（eval） | 判定 |
| --- | --- | --- | --- |
| ARIA 契約 eval | radiogroup/horizontal/radio×4/roving tabindex/tablistなし | 上記JSONの通り完全一致 | PASS |
| 選択中 radio に focus（名前） | activeElement=名前 | focused:名前 | PASS |
| ArrowRight | 次item(ノート数)へ移動＆即選択, tab0移動, URL更新 | active=ノート数, checked=[ノート数], tab0=[ノート数], url=?sort=noteCount | PASS |
| ArrowLeft（ノート数→名前） | 前item即選択, URL更新 | active=名前, checked=[名前], tab0=[名前], url=?sort=name | PASS |
| ArrowLeft（先頭 名前で押下） | 末尾(最終使用)へラップ | active=最終使用, checked=[最終使用], tab0=[最終使用], url=?sort=lastUsedAt | PASS（先頭→末尾ラップ確認） |
| End | 末尾(最終使用)を選択 | active=最終使用, checked=[最終使用], url=?sort=lastUsedAt | PASS |
| ArrowRight（末尾 最終使用で押下） | 先頭(名前)へラップ | url=?sort=name（checkedはナビ再描画中で stale, URLで先頭ラップ確認） | PASS（末尾→先頭ラップ確認） |
| Home（作成日時→名前, クリーン再試行） | 先頭(名前)を選択 | active=名前, checked=[名前], tab0=[名前], url=?sort=name | PASS |
| URL直指定 ?sort=createdAt 読み込み | 作成日時が checked & tab0 | checked=[作成日時], tab0=[作成日時] | PASS（選択状態の URL 復元 & roving tabindex 追従） |

automatic activation（矢印移動で即選択）・両端ラップ・Home/End すべて確認。

### 注意点（フォーカス脱落）

選択が URL ナビゲーション（再描画）を伴うため、矢印キー1回で選択・URL更新は成功するが、その後の非同期再描画でフォーカスが `<body>` に脱落することを確認。再フォーカスせずに連続して矢印キーを押すと2回目以降が無視される（active=BODY のまま変化なし）。

- ArrowRight #1: active=ノート数（直後はフォーカス保持）
- ArrowRight #2（再フォーカスなし）: active=BODY, 変化なし
- ArrowRight #3（再フォーカスなし）: active=BODY, 変化なし

各キーのハンドラ自体は、押下時にフォーカスが radio 上にあれば正しく動作する（上表は各操作前に tabindex=0 の radio へ再フォーカスして検証）。連続キーボード操作時のフォーカス保持（roving tabindex のフォーカス復元）に改善余地あり。

## TC-TAG-2 実行ログ（sort/order と URL 反映）

| 操作 | 期待 | 実際 | 判定 |
| --- | --- | --- | --- |
| radio「ノート数」をクリック | url=?sort=noteCount, checked移動 | url=?sort=noteCount, checked=[ノート数] | PASS |
| 矢印キーで選択 | URL クエリ更新 | 各方向で ?sort=name/noteCount/createdAt/lastUsedAt に更新 | PASS |
| 昇順/降順トグルをクリック | order クエリ付与 | url=?sort=noteCount&order=desc | PASS |
| 再度トグル | order=asc | url=?sort=noteCount&order=asc | PASS |
| 一覧の並び変化（desc） | ノート数多→少 | #work,#design(1件)→#ideas,#personal,#reference(0件) | PASS |
| 一覧の並び変化（asc） | ノート数少→多 | #ideas,#personal,#reference(0件)→#work,#design(1件) | PASS |

クリック・矢印キー双方で sort クエリが、トグルで order クエリが URL に反映され、一覧の並びも追従。AC-3 充足。

## 検証中に観察した環境上の問題（テスト対象外）

- agent-browser セッションで full page `open`（特にクエリ付き URL や再読み込み）後にログインセッションが脱落し /tags が / にリダイレクトされる事象が複数回発生。都度 /login で再ログインして継続。テスト対象の挙動ではなく、セッションCookieの永続性の問題と思われる。
