# ブラウザ検証レポート — Issue #582: ブランドアイコン(Vesica)を各ページの可視ロゴへ反映

**実行日:** 2026-06-08
**ブランチ:** issue/582/brand-logo-in-app
**テストソース:** `.issue/582/testing.md`
**サーバー:** `http://localhost:3001`（`pnpm dev` / vite Cloudflare runtime）
**agent-browser:** 0.27.1 / session `verify-582`

## サマリー

確認項目数: **10** / **PASS: 10** / FAIL: 0

全ロゴが `<svg role="img" aria-label="hollow" viewBox="0 0 473.84 84.48">`（`circle`×2 + `path`×1 のロックアップ）として表示され、リテラル「Hollow」テキストではないことを DOM 検査で確認した。

| # | 確認項目 | 結果 | スクショ |
|---|---------|------|---------|
| 1 | ランディング ヘッダーロゴ（未ログイン） | PASS | `screenshots/01-landing-header.png` |
| 2 | ランディング フッターロゴ | PASS | `screenshots/02-landing-footer.png` |
| 3 | 認証ヘッダーロゴ（/login） | PASS | `screenshots/03-login-header.png` |
| 4 | アプリヘッダーロゴ（ログイン後ホーム） | PASS | `screenshots/04-app-header.png` |
| 5 | アプリヘッダー max-sm 挙動（375px でロゴ非表示） | PASS | `screenshots/05-app-header-narrow.png` |
| 6 | 管理ヘッダーロゴ（/admin） | PASS | `screenshots/06-admin-header.png` |
| 7 | 公開ヘッダーロゴ（/search） | PASS | `screenshots/07-public-header.png` |
| 8 | 公開フッターロゴ（/search） | PASS | `screenshots/08-public-footer.png` |
| 9 | アクセシビリティ（accessible name "hollow" を1度だけ／aria 重複なし） | PASS | — |
| 10 | テーマ追従（currentColor） | PASS | `screenshots/09-landing-dark.png` |

## 詳細所見

- **ランディング:** ヘッダー + 最下部フッターに各1ロックアップ。ロゴリンクは `href="/"`・テキスト空。文章中・コピーライト「© 2026 Hollow.」のテキストは未変更（コピー文維持）。
- **認証/アプリ/管理/公開ヘッダー:** いずれもロックアップ1つ、右側リンク・検索ボックス・アクション・管理者モード pill 等とのレイアウト崩れなし。
- **max-sm 挙動:** viewport 375px でアプリヘッダーのロゴリンクが computed `display:none`（`max-sm:hidden` 維持）。
- **アクセシビリティ:** ツリーは `link "hollow"` > `image "hollow"`。リンク自身に `aria-label` は無く、accessible name は子 SVG から1度だけ計算され重複なし。
- **テーマ追従:** SVG の computed `color` と `<path>` の `fill` がともに `rgb(29,29,31)`（= `--ink`/`text-ink`）。stroke も fill も `currentColor` を継承し、テーマ色追従が正しく機能。

## 環境注記（本 Issue と無関係）

- ログインはセッションクッキー方式（`__Host-session` = `dev-admin-session-token`）を CDP 注入して dev-admin で認証。
- /admin メトリクスカードの「取得失敗」はローカル dev に analytics バインディングが無いため。ロゴ検証には影響なし。

## FAIL

なし。

## クリーンアップ

- `agent-browser close --all` 実行・「No active sessions」確認済み。
- dev サーバー停止済み（`curl http://localhost:3001/` → 接続拒否）。
