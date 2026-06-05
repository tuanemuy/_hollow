# テスト実行サマリー — Issue #502

**実行日時**: 2026-06-06
**テストソース**: .issue/502/testing.md
**サーバー**: http://localhost:3001/（`pnpm dev`、PORT 無視で 3000→3001 に自動フォールバック）
**認証**: dev-admin（cookie `__Host-session` = `dev-admin-session-token` を CDP 注入）

| TC | テスト名 | 種別 | 結果 | 失敗ステップ |
|----|---------|------|------|-------------|
| TC-01 | `/export` に AppShell が付く | 正常系 | PASS | - |
| TC-02 | `/notes/$noteId/export` に AppShell が付く | 正常系 | PASS | - |
| TC-03 | NoteActions のエクスポートリンクで SPA 遷移 + AppShell 保持 | 正常系 | PASS | - |
| TC-Edge | 未認証直アクセスで `/` へ redirect（`/login` ではない） | 異常系 | PASS | - |
| TC-Reg | 公開ビュー `/notes/public/$noteId` が AppShell なしで従来通り | リグレッション | PASS | - |

**合計**: 5 件（PASS: 5 / FAIL: 0）

## 確認できたこと

- `/export`・`/notes/$noteId/export` の両方に `banner`(Header) + `complementary "サイドバー"`(Sidebar) が付与され、AppShell が継承される。URL は不変。
- NoteActions の `link "エクスポート"`（`to="/notes/$noteId/export"`、書き換えなし）から SPA 遷移でき、遷移後も AppShell が保持される。
- 未認証で両 URL に直アクセスすると `/`(ルート) へ redirect される（`requireAuthenticatedRoute` の `/login` ではなく `_app` ゲートの挙動 / #293 ADR-006 通り）。
- 公開ツリー `/notes/public/$noteId` は AppShell ではなく公開専用 chrome（searchbox「公開ノートを検索」・独自 errorComponent）で従来通りレンダリングされ、export 抜き出しの影響を受けない。

## 起票した Issue
- なし（全 PASS）
