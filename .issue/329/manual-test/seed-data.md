# シードデータ — Issue #329 ブラウザ検証

dev D1 (`.wrangler/state/v3/d1/miniflare-D1DatabaseObject/9ba2...sqlite`) に直接投入。

## admin ユーザー
- id: `01938f00-0000-7000-8000-000000000329`
- email: `tc329-admin@example.com`（email_verified=1）
- role: `admin`

## セッション
- token: `tc329-admin-session-token`（cookie `__Host-session` に CDP 注入）
- expires_at: 2027-06-03（未来）

検証後に両行を削除して dev DB を汚さない。

## 検証スコープの注記
- mutation（バックフィル実行ボタン → server-function POST）は cross-origin 403 でブラウザ検証不可（メモリ browser-verify-authed-routes）。実行・冪等性は integration テスト `backfillAllOwnersInternalLinkResolution.integration.test.ts`（3件PASS）で担保。
- ブラウザ検証は (TC-1) admin で新セクション描画、(TC-2) 未認証で拒否 に絞る。
