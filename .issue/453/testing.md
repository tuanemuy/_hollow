# 動作確認計画 — Issue #453: ローカル dev 用の認証シードスクリプト

**Issue:** #453
**作成日:** 2026-06-04

---

## 確認環境

このIssueの変更を確認するために必要な手順のみ記載。

### 事前準備（テーブルの存在）

ローカル D1 にスキーマが適用済みであること。未適用なら:

```bash
pnpm db:migrate   # = wrangler d1 migrations apply hollow-local-d1 --local
```

### seed の実行（本Issueの対象コマンド）

```bash
pnpm seed:dev-admin   # = node scripts/seed-dev-admin.mjs
```

### 検証環境の起動

```bash
pnpm dev   # = vite dev --config vite.config.cloudflare.ts
```

`pnpm dev`（vite dev / miniflare）は `db:execute:local` と同一のローカル D1 を使うため、
seed で投入した行がそのまま見える。

### デプロイ方法

なし（ローカル dev 専用。検証環境のみで確認できる）。

## 確認項目

### 1. seed 実行でトークンと使い方が表示される

- **目的:** `pnpm seed:dev-admin` が決定論的な admin ユーザー＋セッションを投入し、
  トークンと使い方を標準出力に表示することを確認する。
- **手順:**
  1. `pnpm seed:dev-admin` を実行する。
  2. 標準出力を確認する。
- **期待結果:** エラーなく完了し、セッショントークン（固定値）と、cookie 注入コマンド例
  および `/admin` へのアクセス手順が表示される。
- **確認ポイント:** トークン文字列・cookie 名 `__Host-session`・対象 URL が案内に含まれること。

### 2. 投入した admin で `/admin` にアクセスできる

- **目的:** seed したセッショントークンを cookie 注入すれば、認証済みで `/admin` 系
  ルートにアクセスできることを確認する（受け入れ基準）。
- **手順:**
  1. `pnpm seed:dev-admin` 実行後、`pnpm dev` を起動する。
  2. 表示されたトークンを `__Host-session` cookie として CDP 経由で注入する
     （例: `agent-browser cookies set "__Host-session" "<token>" --url http://localhost:<port> --path / --secure --sameSite Lax`）。
  3. ブラウザで `/admin` にアクセスする。
- **期待結果:** ログイン画面にリダイレクトされず、管理ダッシュボード（「管理者モード」
  ヘッダー）が表示される。
- **確認ポイント:** `/admin/users` を開いてもエラーにならない（user 行の rehydrate が
  UUIDv7 検証を通る）こと。

### 3. 冪等性（再実行で失敗・重複しない）

- **目的:** 受け入れ基準「再実行しても失敗・重複しない（冪等）」を確認する。
- **手順:**
  1. `pnpm seed:dev-admin` を2回連続で実行する。
- **期待結果:** 2回目もエラーなく完了する。UNIQUE 制約（email / username / token）違反が
  出ない。
- **確認ポイント:** 2回目実行後も `/admin` に同じトークンでアクセスできる。

## エッジケース・異常系

### 1. テーブル未作成のまま実行

- **目的:** マイグレーション前に実行した場合の振る舞いを確認する。
- **手順:**
  1. クリーンな状態（migrations 未適用）で `pnpm seed:dev-admin` を実行する。
- **期待結果:** wrangler が `no such table` 系エラーを返す。docs に
  「先に `pnpm db:migrate` が必要」と案内されている。

## 既存機能への影響確認

- 既存の signup フロー（`docs/test.md` 既述の「signup → email_verified UPDATE」）に
  影響しないこと。seed は独立したスクリプト追加であり、アプリのランタイムコードは変更しない。

## 確認チェックリスト

- [ ] `pnpm seed:dev-admin` がトークンと使い方を stdout 表示する
- [ ] 投入したトークンの cookie 注入で `/admin` に認証済みアクセスできる
- [ ] `/admin/users` がエラーなく表示される
- [ ] 2回連続実行しても失敗・重複しない（冪等）
- [ ] docs/test.md を読めば暗黙知なしで上記を再現できる
