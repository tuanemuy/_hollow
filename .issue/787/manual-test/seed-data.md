# Issue #787 ブラウザ検証用シードデータ

モバイル幅でのノート詳細アクションツールバー確認のため、ローカル開発環境（`hollow-local-d1`）に
ログイン可能なユーザーとノートを投入した記録。本番には一切触れていない。

## 実行した準備作業

| # | コマンド | 結果 |
|---|----------|------|
| 1 | `pnpm db:migrate`（= `wrangler d1 migrations apply hollow-local-d1 --local`） | `✅ No migrations to apply!`（スキーマ適用済み） |
| 2 | `node scripts/seed-dev-login.mjs` | ログイン可能ユーザー（email+password / scryptハッシュ credential）を投入。冪等。 |
| 3 | `pnpm db:execute:local <notes.sql>` | dev-login ユーザー向けにルートディレクトリ＋ノート2件＋publication_states を投入。`🚣 7 commands executed successfully.` |

備考:

- 既存の seed スクリプト（`scripts/seed-dev-login.mjs` / `seed-dev-admin.mjs` /
  `seed-public-user.mjs`）はいずれも `pnpm db:execute:local`（= `wrangler d1 execute hollow-local-d1 --local --file`）
  経由で投入する。
- `seed-dev-login.mjs` は **ユーザー + credential のみ** を投入しノートは作らない。
  そのため本検証ではノートを別途投入した。
- 投入手段は既存スクリプトと同じ `pnpm db:execute:local` の仕組みを踏襲し、一時 SQL ファイルを実行した。
  既存データは破壊せず、dev-login ユーザー所有分のみ delete-then-insert（冪等）。

## 投入したシードデータ

### ユーザー（`scripts/seed-dev-login.mjs` 由来）

- user_id: `01950000-0000-7000-8000-000000000010`
- email: `dev-login@example.com`
- username: `dev-login` / name: `Dev Login`
- role: `member`（active: email_verified=1 / banned=0 / deleted_at=NULL）
- 認証: `accounts` に scrypt ハッシュの credential 行あり → `/login` から email+password でサインイン可能

### ディレクトリ

- root directory id: `01950010-0000-7000-8000-000000000100`（parent_id=NULL, depth=0, name/slug 空）

### ノート（owner = dev-login ユーザー）

| ノートID | タイトル | status | visibility |
|----------|----------|--------|------------|
| `01950010-0000-7000-8000-000000000201` | モバイル検証用ノート（非公開） | active | private |
| `01950010-0000-7000-8000-000000000202` | モバイル検証用ノート（公開） | active | public |

公開・非公開の2状態を用意し、ツールバーの公開/共有まわりの表示差も確認できるようにした。

> 注: ノートID は dev-admin の seed が既に `...000000000201/202`（owner=dev-admin）を使っていたため、
> 衝突回避に第2グループを `01950010` にずらした別レンジを採用している（いずれも有効な UUIDv7）。

## ログイン情報

- URL: http://localhost:3000/login
- email: `dev-login@example.com`
- password: `DevPassw0rd!2024`

## ノート詳細ページへの到達手順

1. http://localhost:3000/login で上記 email + password でサインイン。
2. ログイン後、サイドバー/ノート一覧から該当ノートを開く、または下記 URL に直接アクセスする。

直接 URL（要ログイン。ルートは `/_app/notes/$noteId` で current user 所有のノートのみ表示）:

- 非公開ノート: http://localhost:3000/notes/01950010-0000-7000-8000-000000000201
- 公開ノート: http://localhost:3000/notes/01950010-0000-7000-8000-000000000202

モバイル幅で確認する場合は、ブラウザの DevTools デバイスツールバー等でビューポートを
モバイル幅（例: 375px）に設定してから上記ノート詳細を開く。

## 問題と対処

- ノートID 初回案 `...201/202`（第2グループ `01950000`）が dev-admin seed のノートと衝突し
  `UNIQUE constraint failed: notes.id` が発生。第2グループを `01950010` にずらした別レンジへ変更して解決。
- 上記以外の問題なし。シードは冪等で、再実行可能。
