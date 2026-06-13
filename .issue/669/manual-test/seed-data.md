# Issue #669 マニュアルテスト — シードデータ記録

**作成日:** 2026-06-13

## 実行した作業

- `pnpm db:migrate`（wrangler d1 migrations list で確認）→ **適用済み・未適用マイグレーションなし**（"No migrations to apply!"）
- シードスクリプトの再実行は **不要と判断**。ローカル D1（`hollow-local-d1`、`.wrangler/state/v3/d1`）に必要データがすべて存在することを SQL で確認済み。
- 新規データ投入なし（既存データを破壊しない原則に従う）。

## ログイン情報

### 管理ユーザー（セッション注入方式・推奨）

- スクリプト: `pnpm seed:dev-admin`（投入済み）
- email: `dev-admin@example.com` / username: `dev-admin` / role: admin / status: active
- user_id: `01950000-0000-7000-8000-000000000001`
- セッショントークン: `dev-admin-session-token`（有効期限 2999 年）
- Cookie 名は `__Host-session`（Secure-only のため document.cookie 不可、CDP で注入）:

  ```bash
  agent-browser cookies set "__Host-session" "dev-admin-session-token" \
    --url http://localhost:3000
  ```

### パスワードログイン可能ユーザー（`/login` フォーム経由）

- スクリプト: `scripts/seed-dev-login.mjs`（投入済み、users に存在確認済み）
- email: `dev-login@example.com` / password: `DevPassw0rd!2024` / role: member

## データ概要（確認済みカウント）

| 項目 | 全体 | dev-admin 所有 |
|---|---|---|
| notes (active) | 66 | 19 |
| directories | 35 | 2 |
| tags | 53 | — |

### dev-admin の代表ノート（編集画面 P12 用 `/notes/:id/edit` 等）

- `019e9549-a511-7654-8299-90e50bd33b05` — slug `a-2`, title「検証ノートA改 (コピー)」
- `01950000-0000-7000-8000-000000000214` — slug `test-note-14`, title「Test Note 14」
- slug `a` — title「検証ノートA改」

### dev-admin のディレクトリ

- `019e9548-661c-714c-bc97-58d659254a98` — 「検証ディレクトリ」
- `019e9546-cb23-73c9-849c-120384e56377` — （名前空のディレクトリあり）

## テスト前提条件の充足状況

- [x] ログイン可能な管理ユーザー（dev-admin セッション + dev-login パスワード）
- [x] ノート1件以上（dev-admin 所有 19 件）
- [x] ディレクトリ1件以上（dev-admin 所有 2 件）
- [x] タグ付け可能（tags テーブル稼働、53 件既存。エディターのタグ行はカンマ区切り入力）

## 補足

- サーバー起動: `pnpm dev`（http://localhost:3000、ローカル D1 を共有）
- 追加データが必要な場合は UI（`/notes/new`）から作成可能。SQL 投入は `pnpm db:execute:local <file.sql>`。
- テスト用に新規作成するデータは `test-` / 「検証」プレフィックスを使うこと。
