# TC-2: `/u/existing-user` 公開ユーザーページ初期遷移の URL 確認

**結果**: PASS

## 観察
- アクセス URL: `http://localhost:3001/u/existing-user`
- 遷移後 URL: `http://localhost:3001/u/existing-user`
- ページタイトル: "@existing-user — TanStack Start Template"
- クエリ文字列: なし

シードデータ未投入だがページタイトルが表示され、URL にデフォルトクエリが付与されないことを確認。

## スクリーンショット
`screenshots/tc2-userpublic-initial.png`
