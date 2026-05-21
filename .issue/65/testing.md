# 動作確認計画 — Issue #65: メール検証リンクの URL が "/auth/verify" だが実フロントエンドは "/verify-email"

**Issue:** #65
**作成日:** 2026-05-21

---

## 確認環境

このIssueの変更を確認するために必要な手順のみ記載。

### 検証環境の起動

```bash
pnpm dev
```

ローカル開発サーバー（vite + Cloudflare Workers）が起動する。dev では `ConsoleEmailSender` がメール本文の代わりにリンク URL を `logger.info("email.verification", { to, link, locale })` でログ出力するため、メール内のリンク URL はサーバーログから確認できる。

### デプロイ方法

検証環境のみで確認可能。ステージング・本番へのデプロイは不要。

## 確認項目

### 1. サインアップ → 検証メールリンクが `/verify-email?token=...` を指す

- **目的:** メール本文に含まれるリンク URL が `/verify-email` を指し、クリックして 404 にならないことを確認する。
- **手順:**
  1. ブラウザで `/signup` を開く
  2. 新規ユーザーを登録（任意のユーザー名・有効なメールアドレス・パスワード・利用規約同意）
  3. `pnpm dev` のサーバーログから `email.verification` のログ行を探し、`link` フィールドの URL を取得
  4. その URL のパス部分が `/verify-email?token=...` であることを確認
  5. 同じ URL をブラウザで開く
- **期待結果:**
  - ログに出力された URL のパスが `/verify-email`（`/auth/verify` ではない）。
  - URL をブラウザで開くと 404 ではなく、検証画面（または成功メッセージ）が表示される。
  - ユーザーが検証済み状態になり、ログインできる。
- **確認ポイント:** クエリパラメータ `token` が保持されたままページに渡されていること。

### 2. 再送（ResendVerification）でも同じ URL になる

- **目的:** `buildVerificationLink` を共用している ResendVerification フローでも URL が正しいことを確認する。
- **手順:**
  1. 1. で登録した未検証ユーザー（または別の pending ユーザー）に対して、再送機能の動線（フロントエンドに UI があればそこから、なければ ResendVerification を直接呼ぶ手段）でメール再送を実行
  2. サーバーログから新しい `email.verification` 行を探し、`link` の URL を確認
- **期待結果:** リンクのパスが `/verify-email?token=...`。

## エッジケース・異常系

### 1. 無効/期限切れトークンを `/verify-email?token=...` に渡す

- **目的:** リンクが有効な経路に到達した後の振る舞いがエラーで止まらないこと。
- **手順:**
  1. 適当な文字列を `token` に入れて `/verify-email?token=invalid` を開く
- **期待結果:** 404 ではなく、検証エラー（無効/期限切れトークン）に対応する画面が表示される。

## 既存機能への影響確認

- **メールアドレス変更フロー**: `/account/verify-email-change` を使用しており本Issueの変更対象外。サインアップ系の修正後も既存の挙動が変わらないことを確認する（該当する画面遷移を1回試す）。
- **既存の integration test**: `pnpm test:integration` を実行し、identity 系テストがリグレッションなくパスすることを確認する。

## 確認チェックリスト

- [ ] サインアップで送信される検証メールリンクのパスが `/verify-email?token=...`
- [ ] そのリンクをブラウザで開くと 404 にならず検証フローが完遂する
- [ ] 再送フローでも同じ URL が生成される
- [ ] 無効トークンを渡しても 404 ではなくエラー表示で扱われる
- [ ] メールアドレス変更フロー (`/account/verify-email-change`) は従前通り動作する
- [ ] `pnpm typecheck && pnpm lint:fix && pnpm format` が成功する
- [ ] `pnpm test:integration` の identity 系テストがパスする
