# TC-Edge: 未認証直アクセスで / へ redirect

**結果**: PASS
**セッション**: verify-502-noauth（cookie なし）

| # | 操作 | 期待結果 | 実際の結果 | 判定 |
|---|------|---------|-----------|------|
| 1 | 未認証で /export に直アクセス | / へ redirect（/login ではない） | URL=http://localhost:3001/ | PASS |
| 2 | 未認証で /notes/$noteId/export に直アクセス | / へ redirect | URL=http://localhost:3001/ | PASS |

`beforeLoad: requireAuthenticatedRoute`（/login redirect）削除 → `_app` ゲート（/ + HOME_SEARCH）へ統一されたことを確認（#293 ADR-006 通りの意図的変更）。
スクリーンショット: `screenshots/tc-edge/unauth-redirect.png`
