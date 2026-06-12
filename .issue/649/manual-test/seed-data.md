# シードデータ — Issue #649 ブラウザ検証（P10 ツールバー / ViewSwitcher）

作成日: 2026-06-12

## 実行した準備

1. `pnpm seed:dev-admin` — dev-admin ユーザー + 固定セッショントークンを upsert（冪等、既存データ非破壊）
2. `node scripts/seed-dev-login.mjs` — パスワードログイン可能な dev-login ユーザーを upsert（冪等）
3. `.issue/649/manual-test/seed.sql` を `pnpm db:execute:local .issue/649/manual-test/seed.sql` で投入 — dev-admin 所有の保存ビュー 3 件（冪等: 固定 ID を delete→insert）
4. マイグレーションは適用済みだったため `pnpm db:migrate` 不要（schema 確認済み）
5. `pnpm dev --port 5183` で起動し SSR HTML を curl 検証後、サーバーは停止済み

## 投入データ概要

dev-admin（`01950000-0000-7000-8000-000000000001`）の既存データ:

- アクティブノート 11 件（既存。タグ付きノートあり: design ×1 / 日記 ×1 / アイデア ×1 / wikilinks ×2）
- タグ 5 件（design, 日記, アイデア, essay, wikilinks）

今回追加した保存ビュー（kind=personal, is_default=0）:

| ID | 名前 | フィルタ | display_mode |
| --- | --- | --- | --- |
| `01970000-0000-7000-8000-000000649001` | テスト用ビュー design | tag: design | list |
| `01970000-0000-7000-8000-000000649002` | テスト用タイル日記 | tag: 日記 | tile |
| `01970000-0000-7000-8000-000000649003` | TestLongViewName649AAAAABBBBBCCCCCDDDDDEEEEE12345 | tag: アイデア | list |

3 件目は空白なし英数字 49 文字 — エッジケース「長いビュー名の見出し折り返し」用（上限 60 文字以内）。

「保存ビュー 0 件」エッジケースは、上記 3 件を UI から削除するか
`DELETE FROM saved_views WHERE owner_id='01950000-0000-7000-8000-000000000001';`
を `wrangler d1 execute hollow-local-d1 --local --command` で実行して再現する（検証後は seed.sql を再投入して復元）。

「存在しない viewId」エッジケースは `/?viewId=01970000-0000-7000-8000-00000064dead` 等を直接開く。

## テストアカウント

| 用途 | email | 認証方法 |
| --- | --- | --- |
| メイン（推奨） | dev-admin@example.com | セッション Cookie 注入（token: `dev-admin-session-token`） |
| フォーム経由ログイン | dev-login@example.com | パスワード `DevPassw0rd!2024` を `/login` で入力 |

注意: dev-login ユーザーにはノート・保存ビューのシードがない。P10 検証は dev-admin を使うこと。

## ログイン手順（agent-browser）

Cookie 名 `__Host-session` は Secure 属性必須のため `document.cookie` では設定不可。CDP 経由で注入する:

```bash
agent-browser cookies set "__Host-session" "dev-admin-session-token" \
  --url http://localhost:<port> --path / --secure --sameSite Lax
```

その後 `http://localhost:<port>/` を開くと dev-admin としてホーム（P10）が表示される。

代替（フォームログイン）: `/login` を開き email `dev-login@example.com` / password `DevPassw0rd!2024` を入力して送信。

## 検証結果

- Cookie なし `/`: 200（公開ランディング。ログイン導線あり）
- Cookie あり `/`: 200。SSR HTML に「すべてのノート」と保存ビュー 3 件すべての名前を確認
- `/?viewId=01970000-0000-7000-8000-000000649001`: 307 リダイレクト — #219 の URL 正規化（display パラメータ正規化）によるもので想定どおり。ブラウザでは追従されて表示される

## 問題と対処

- 特になし。マイグレーション・seed スクリプトとも既存のものをそのまま利用。既存ユーザー 30 件・ノート等は非破壊（seed は固定 ID の upsert / delete→insert のみ）。
- 検証用 dev サーバー（port 5183）は停止済み。残存プロセスなし。
