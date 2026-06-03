# テスト実行サマリー — Issue #453

**実行日時**: 2026-06-04
**テストソース**: .issue/453/testing.md
**サーバー**: http://localhost:3005（`pnpm dev`）

| TC | テスト名 | 種別 | 結果 | 失敗ステップ |
|----|---------|------|------|-------------|
| TC-001 | seed 実行でトークンと使い方が表示される | 正常系 | PASS | - |
| TC-002 | 投入した admin で /admin にアクセスできる | 正常系 | PASS | - |
| TC-003 | 冪等性（再実行で失敗・重複しない） | 正常系 | PASS | - |

**合計**: 3 件（PASS: 3 / FAIL: 0）

## 詳細

### TC-001
`pnpm seed:dev-admin` 実行 → 4 statements すべて success。標準出力にトークン
`dev-admin-session-token`・cookie 名 `__Host-session`・agent-browser 注入コマンド例・
`/admin` アクセス手順が表示された。

### TC-002
`agent-browser cookies set "__Host-session" "dev-admin-session-token" ... --secure` で
cookie 注入後、`/admin` を開くと「管理ダッシュボード」が表示（ログインへのリダイレクトや
「アクセスできません」は出ず）。`/admin/users` もエラーなく描画され、seed した
`dev-admin@example.com` が「管理者」「アクティブ」として一覧に表示。UUIDv7 形式の id が
rehydration（`UuidV7Generator.validate`）を通ることを実機で確認。
- screenshots/tc-002/step-01-admin-dashboard.png
- screenshots/tc-002/step-02-admin-users.png

### TC-003
`pnpm seed:dev-admin` を2回連続実行。2回目も `✅ Seeded` で完了し、UNIQUE 制約
（email / username / token）違反は発生せず。投入行は1組のまま（DB クエリで確認）。

## 備考
- ダッシュボードの一部メトリクス（R2 / DO / LLM 利用状況）は「取得失敗」表示だが、
  これは実バインディング・データ未整備によるもので、認証・本Issueのスコープとは無関係。
