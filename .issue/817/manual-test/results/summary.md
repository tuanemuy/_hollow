# テスト実行サマリー — Issue #817

**実行日時**: 2026-07-10
**テストソース**: .issue/817/testing.md
**サーバー**: http://localhost:3100（`pnpm dev --port 3100`, Cloudflare runtime / workerd）
**認証**: dev-admin（`pnpm seed:dev-admin`）の `__Host-session` を agent-browser の CDP cookie 注入で付与（localhost は secure context のため Secure cookie が有効）

| TC | テスト名 | 種別 | 結果 | 失敗ステップ |
|----|---------|------|------|-------------|
| TC-001 | /admin/users で hydration mismatch warning が出ない | 正常系 | PASS | - |
| TC-002 | /admin/jobs で hydration mismatch warning が出ない | 正常系 | PASS | - |
| TC-003 | フォーマッターの TZ 決定論（修正前後の対比） | 補強 | PASS | - |

**合計**: 3 件（PASS: 3 / FAIL: 0）

## 補足: 決定論チェック（TC-003）

`formatDate` / `formatDateTime` の整形ロジックを、SSR 相当（`TZ=UTC`）と各クライアント相当（`TZ=Asia/Tokyo` / `TZ=America/New_York`）で実行し、修正前後を対比した。UTC/JST をまたぐ時刻 `2024-03-15T20:30:00.000Z` を使用。

| 環境 | 修正前 formatDate | 修正後 formatDate |
|------|------------------|-------------------|
| TZ=UTC（SSR相当） | 2024/03/15 | 2024/03/16 |
| TZ=Asia/Tokyo（JSTクライアント） | 2024/03/16 | 2024/03/16 |
| TZ=America/New_York | 2024/03/15 | 2024/03/16 |

- **修正前**: SSR(UTC) と JST クライアントで出力が食い違う（`2024/03/15` ≠ `2024/03/16`）→ hydration mismatch が発生しうる（バグ再現）。
- **修正後**: どの TZ でも `2024/03/16` に固定 → サーバー／クライアントが常に一致し、mismatch が原理的に発生しない。
