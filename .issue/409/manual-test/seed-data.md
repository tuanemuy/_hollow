# Seed Data — Issue #409 ブラウザ検証

## 作成アカウント

- username: `test409user`
- email: `test-409@example.com`
- password: `Password1234!`
- displayName: `Test 409`
- email_verified: 1（SQL で手動 verify）

signup はUIフォーム（`/signup`）から実行。送信は **password 欄で Enter** で発火（プログラムによるボタン click では React の form action が発火しなかったため）。
verify は以下で実施:

```bash
pnpm wrangler d1 execute hollow-local-d1 --local --command "UPDATE users SET email_verified=1 WHERE email='test-409@example.com'"
```

login も同様に `/login` で email/password を fill し password 欄 Enter で送信 → `/` にリダイレクト（認証成功）。

## 作成ノート

UIからのノート作成は「作成」ボタンの click で server-fn POST が発火しなかったため（button-driven mutation はこの自動化環境でブロックされる既知制約）、SQL で直接シードした。

- note id: `11111111-1111-7111-8111-111111111111`
- title: `履歴テストノート`
- slug: `rireki-test-note`
- owner_id: `019e8437-ba6b-7681-9e98-86387d418b58`
- directory_id: `019e8437-bb3c-728c-839d-794118e2c301`（root directory）
- revision 1: `22222222-2222-7222-8222-222222222221`（初版）
- revision 2: `22222222-2222-7222-8222-222222222222`（第2版）

シードSQL: `/tmp/seed-409.sql`（notes 1件 + note_revisions 2件）。

## 認証メモ

server-fn フォーム送信（signup / login）は **テキスト欄で Enter** を押すと同一オリジン POST が発火し成功する。
プログラムによる submit ボタンの click では React の form action / mutation が発火しなかった。
