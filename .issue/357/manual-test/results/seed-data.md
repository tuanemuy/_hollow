# Seed Data — Issue #357 マニュアルテスト

## アカウント

| 項目 | 値 |
| --- | --- |
| ユーザー名 | `manualtest357` |
| メール | `manualtest357@example.com` |
| パスワード | `Password123!` |
| 表示名 | `Manual Test 357` |
| user id | `019e7cef-1be0-777a-9eeb-234e6938ef47` |

## 作成したディレクトリ

| 名前 | id |
| --- | --- |
| フォルダA | `019e7cf0-a1a9-716f-b375-6b85adf9805b` |
| フォルダB | （ルート直下、フォルダAの次に作成） |

両ディレクトリともルート直下に作成。

## ログイン方法 / 手順上の注意（ブロッカー込み）

1. `http://localhost:3000/signup` でフォーム入力。
   - フォーム送信は「アカウントを作成」ボタンの**クリックでは server function が発火しなかった**（network request 0 件）。パスワード入力欄で **Enter キー押下**すると POST `_serverFn/...signUpFn...` が 200 で発火し成功した。agent-browser の synthetic click と React 19 form action の相性問題と思われる（アプリ不具合とは断定しない）。
   - 利用規約チェックボックスは `click` では入らず、`check` コマンドで checked=true にする必要があった。
2. **メール確認が必須（ブロッカー）**。signup 直後は「確認メールを送信しました」画面になり、`/login` でログインしようとすると「メールアドレスの確認が未完了です」で拒否される。dev 環境では実メールが届かないため、ローカル D1 sqlite の `verifications` テーブルから確認トークンを取得して回避した。
   - DB: `.wrangler/state/v3/d1/miniflare-D1DatabaseObject/9ba2b04bf514d9facfd57ed57d849e77241a7adc99d1c1545d06688b43d84248.sqlite`
   - 最新トークン `nZGIhQa0j9tgWrs-DDnTflnohJtLY08hcGpgNZ4U32M` を使い `http://localhost:3000/verify-email?token=...` を開いて確認完了。
   - 確認後はセッションが確立され、`/` でサイドバー付きの個人領域に到達できた（`/login` を開くと既ログインのため `/` にリダイレクトされる）。

## 結論

新規ユーザー作成 → メール確認（DB経由）→ 個人領域到達まで完了。全テストケースを実行可能な状態を確保した。メール確認必須という認証フロー上の制約はあったが、本Issue（フロント表示）の検証には影響なし。
