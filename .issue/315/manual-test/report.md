# ブラウザ検証レポート — Issue #315: admin UsersTable の自己操作禁止ガード

**実行日時**: 2026-05-30
**テストソース**: `.issue/315/testing.md`
**サーバー**: http://localhost:3000（`pnpm dev`、検証後停止）
**ブランチ**: `issue/315/forbid-admin-self-demote-suspend`
**ツール**: agent-browser 0.27.0

## 結果サマリー（全 PASS / FAIL なし）

| TC | 名前 | 種別 | 結果 |
|----|------|------|------|
| TC-001 | ログイン（admin-user） | 前提 | PASS |
| TC-002 | ユーザー管理画面の表示 | 前提 | PASS |
| TC-003 | 自分の行に suspend/demote が出ない【主眼】 | 正常系 | PASS |
| TC-004 | 他 admin（admin309）の行にはボタンが出る | 非退行 | PASS |
| TC-005 | member / suspended 行のボタン（非退行） | 非退行 | PASS |

**合計**: 5 件（PASS: 5 / FAIL: 0）

## 主眼（TC-003）の機械的根拠

DOM 検査（行ごとのアクション列ボタンラベル抽出）:

- `@admin-user`（ログイン中・自分・admin）: `buttons: []` ← **自分の行のみ空**
- `@admin309`（他 admin・active）: `buttons: ["一時停止","管理者を解除"]`
- `@existing-user`（active member）: `buttons: ["一時停止","管理者に昇格"]`
- `@tc-suspended`（suspended）: `buttons: ["復帰","管理者に昇格"]`

自分の行だけがボタンを持たず、他行は従来どおりのボタンを持つ対比が確認できた。Issue #315 の UI ガードは意図どおり機能し、非退行もなし。

## スクリーンショット

- `screenshots/TC-001-login.png`
- `screenshots/TC-002-users-table.png`
- `screenshots/TC-003-self-row-admin-user.png`
- `screenshots/TC-004-admin309-row.png`
- `screenshots/TC-005-member-and-suspended-rows.png`

## 起票した Issue

なし（全 PASS）。

## 備考

- サーバー側ガード（usecase `assertNotSelf`）は結合テスト（`identity.integration.test.ts` の自己 demote/suspend 拒否 2 ケース）で担保済み。UI 検証は表示除外の確認に専念した。
- シードは新規投入なし（ローカル D1 に active admin 2 名が既存）。詳細は `seed-data.md`。
