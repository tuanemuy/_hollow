# ブラウザ検証レポート — Issue #817

**実行日時**: 2026-07-10
**テストソース**: `.issue/817/testing.md`
**サーバー**: http://localhost:3100（`pnpm dev --port 3100` / Cloudflare runtime = workerd, Intl 既定 TZ は UTC）
**認証**: dev-admin（`pnpm seed:dev-admin`）。`__Host-session` cookie を agent-browser の CDP cookie 注入で付与（localhost は secure context のため Secure cookie が有効に働く）

## 結果

| TC | 内容 | 結果 |
|----|------|------|
| TC-001 | `/admin/users` の hydration mismatch warning が消えている | PASS |
| TC-002 | `/admin/jobs` の hydration mismatch warning が消えている | PASS |
| TC-003 | 整形関数の TZ 決定論（修正前後の対比） | PASS |

**合計 3 件 / PASS 3 / FAIL 0**

## 検証方法と根拠

hydration mismatch は「SSR が描画したテキスト」と「クライアントが hydration 時に描画するテキスト」の差分が原因のため、次の 2 系統で確実に判定した。

1. **実ブラウザ console 捕捉（agent-browser）**
   - `/admin/users`・`/admin/jobs` を dev-admin 認証済みで開き、hydration 完了（`networkidle`）まで待機して `console` ログを取得。
   - どちらも `Hydration failed` / `didn't match` / `regenerated on the client` / `SectionErrorBoundary` の警告・エラーは検出されず。
   - 出力された唯一の warning は tanstack-router のコード分割助言（`AppErrorFallback`、`_app/route.tsx`）で、本 Issue と無関係の既存事項。

2. **SSR HTML（cookie 付き curl）＋ 整形関数の決定論チェック**
   - workerd（SSR, UTC）が返す HTML を直接取得し、errorComponent の fallback 文言（「…を読み込めませんでした」）が 0 件で、登録日・ジョブ日時が JST（`YYYY/MM/DD`）で描画されることを確認。
   - `formatDate`/`formatDateTime` の整形ロジックを `TZ=UTC`（SSR 相当）と `TZ=Asia/Tokyo`・`TZ=America/New_York`（クライアント相当）で実行。
     - 修正前は SSR(UTC) と JST クライアントで出力が食い違い（`2024/03/15` vs `2024/03/16`）mismatch が起きうることを再現。
     - 修正後は全 TZ で `2024/03/16` に固定され、サーバー／クライアントが常に一致することを実証。

## 受け入れ基準の充足

- **AC-1**（/admin/users で mismatch warning が出ない）: TC-001 で PASS。
- **AC-2**（/admin/jobs で同型の mismatch が出ない）: TC-002 で PASS。
- **AC-3**（表示が JST 基準で決定論的に読める）: TC-001/002/003 で PASS。

## 起票した Issue

なし（全 PASS）。

## 環境メモ

- agent-browser 0.31.0。今回は localhost + CDP cookie 注入で `/admin/*` の認証描画に成功した。過去メモ（agent-browser が Secure cookie を document ナビに載せない）に該当せず、実ブラウザ console まで到達できた。
- 検証後、agent-browser セッションと dev サーバー（PID/ポート）は停止済み。
