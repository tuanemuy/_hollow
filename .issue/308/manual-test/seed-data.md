# Seed Data — Issue #308

実行日: 2026-05-29
対象ブランチ: `issue/308/button-form-domain-actions`
DB: ローカル D1 `hollow-local-d1` (`.wrangler/state/v3/d1/miniflare-D1DatabaseObject/`)

---

## セットアップ手順の要約 (CLAUDE.md / README.md より)

- ローカル開発は `pnpm dev` (vite dev + workerd via `@cloudflare/vite-plugin`)。
- D1 binding は miniflare がローカル sqlite ファイルにマッピング。
- スキーマ反映は `pnpm db:migrate` (`wrangler d1 migrations apply hollow-local-d1 --local`)。
- 認証は Better Auth (credential provider)。パスワードは PBKDF2-SHA256 / 600,000 iter (`app/core/adapters/d1/repositories/credentialStore.ts`)。
- `.dev.vars` は `.dev.vars.example` からコピーで OK (`BETTER_AUTH_SECRET` / `SECRET_BOX_MASTER_KEY` のデフォルト値あり)。
- 既存マニュアルテスト用シード `.manual-test/2026-05-17/seed.sql` が 12 アカウントを提供。本 Issue は既にこれが適用済みの DB に対して差分を追加するだけ。

---

## 実施した準備作業

| # | 内容 | コマンド / ファイル |
|---|---|---|
| 1 | `.dev.vars` の存在確認 | `.dev.vars` は既に存在 (内容は変更なし) |
| 2 | ベースライン seed が既に適用済みであることを確認 | `wrangler d1 execute hollow-local-d1 --local --command "SELECT ..."` |
| 3 | Issue #308 用差分 seed の作成 | `.issue/308/manual-test/seed.sql` |
| 4 | 差分 seed の投入 | `pnpm wrangler d1 execute hollow-local-d1 --local --file .issue/308/manual-test/seed.sql` |
| 5 | 投入結果の確認 | tags 3 件 (existing-user 所有) / users 1 件追加 を確認 |

### 投入したシードデータ

| テーブル | 件数 | 内容 |
|---|---|---|
| `tags` | +2 | existing-user 所有の追加タグ `issue308-tag-a`, `issue308-tag-b`（既存の `232` と合わせ 3 件で merge 候補 ≥2 を満たす） |
| `users` | +1 | `test-issue308-delete` (member / verified / unbanned) |
| `accounts` | +1 | 上記 user の credential 行 (PBKDF2-SHA256, password=`Password123!`) |
| `directories` | +1 | 上記 user の root directory (signUp 経由を bypass しているため手動付与) |

> ID は `01999308-0000-7000-8000-*` 帯 (issue 番号 308 が読み取れる prefix) に統一。
> 既存 baseline (`01938f00-*` / `01938f01-*`) とは衝突しない。

---

## テストで使用するアカウント

### TC-1 (TagActions) — 通常ユーザーでログイン

| 用途 | username | email | password | role | 備考 |
|---|---|---|---|---|---|
| メイン | `existing-user` | `existing@example.com` | `Password123!` | `member` | baseline 既存。タグ 3 件保有 (`232`, `issue308-tag-a`, `issue308-tag-b`) で rename/merge/delete をすべて検証可能 |

### TC-2 (AccountDeleteForm) — 使い捨て削除用 member

| 用途 | username | email | password | role | 備考 |
|---|---|---|---|---|---|
| 削除対象 | `test-issue308-delete` | `test-issue308-delete@example.com` | `Password123!` | `member` | Issue #308 専用に追加。**TC-2 を実行すると消えるため、再実行前に `seed.sql` を再投入すること** |

### TC-3 (UsersTable) — admin 視点

| 用途 | username | email | password | role | 備考 |
|---|---|---|---|---|---|
| admin ログイン | `admin-user` | `admin@example.com` | `Password123!` | `admin` | baseline 既存。`/admin/users` にアクセス |
| アクティブ member | `existing-user` | `existing@example.com` | — | `member`, banned=0 | 「一時停止」「管理者に昇格」アクションを試す対象行 |
| アクティブ member (予備) | `tc-rename-a` 等 | `tc-rename-*@example.com` | — | `member`, banned=0 | 必要に応じて 2 件目以降 |
| 既存 admin | `admin-user` 自身 | — | — | `admin`, banned=0 | 自身は除外される想定。別 admin が無いので「管理者を解除」は `admin-user` 自身に対しては検証できない。必要なら一時的に member を admin 昇格 → 解除で確認する |
| 一時停止ユーザー | `tc-suspended` | `tc-suspended@example.com` | — | `member`, banned=1 | 「復帰」アクションの対象 |
| 削除済みユーザー | — | — | — | — | 現状 DB に該当行なし。アクションボタン非表示の確認は TC-2 実行後の `test-issue308-delete` 行 (deleted_at が立つ) で代替可能 |

> 「管理者を解除」アクションは、`existing-user` を一度「管理者に昇格」で admin にしてから解除する逆順手順で検証する想定。

---

## 設定した環境変数

`.dev.vars` (既存、変更なし) に以下キーが存在。

- `BETTER_AUTH_SECRET`
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (credential ログインのみ使うので未使用可)
- `ADMIN_SETUP_TOKEN`
- `SECRET_BOX_MASTER_KEY`
- `ADMIN_LLM_API_KEY`
- `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`

新規追加・変更したキーは **なし**。

---

## 既存資産との関係

- ベースライン: `.manual-test/2026-05-17/seed.sql` の 12 アカウントが既に local D1 に常駐 (admin-user, existing-user, mailowner, tc-* 9 件)。本 Issue では破壊操作の対象が `test-issue308-delete` (本シードで追加) のみなので、既存 baseline reseed は不要。
- baseline reseed が必要になった場合: `./.manual-test/2026-05-17/reseed.sh` を実行 (本シードで追加したタグ / ユーザーは別 ID 帯のため、baseline reseed では消えない)。

## 再投入手順 (TC-2 実行後)

```bash
# test-issue308-delete を再生成 + 追加タグを idempotent に確認
pnpm wrangler d1 execute hollow-local-d1 --local --file .issue/308/manual-test/seed.sql
```

> `INSERT OR IGNORE` のため、既に残っているタグ行と衝突しない。`test-issue308-delete` は user.deleted_at 経由で論理削除される想定だが、もし完全削除されている場合は再投入で復活する。`deleted_at` が立った状態のままで残っている場合は手動で `DELETE FROM users WHERE id='01999308-0000-7000-8000-0000000000d1'` してから再投入すること。

---

## 起動確認用コマンド

```bash
pnpm dev
# → http://localhost:3000 (vite + workerd)
```

`pnpm dev` の前に `wrangler types` が `predev` で走るので、初回は数秒待つ。

---

## 既知の注意点

1. **TC-3 で「管理者を解除」を試したい場合**: 現在 admin は `admin-user` のみで、自分自身は UsersTable から除外される。`existing-user` 等を一度「管理者に昇格」で admin 化してから「管理者を解除」を試す逆順手順を使う (テスト後に元に戻すか baseline reseed で復旧)。
2. **`R2_*` 系が空**: R2 を介する機能（メディアエクスポート等）は使えないが、本 Issue のテスト範囲には影響しない。
3. **`ADMIN_LLM_API_KEY` が空**: LLM 機能はスタブになるが、本 Issue のテスト範囲には影響しない。

---

## 問題・中断判断

なし。既存シードの仕組み (`.manual-test/2026-05-17/seed.sql` + per-TC INSERT) を再利用でき、Issue #308 の確認に必要な差分（tags +2 / disposable member +1）も問題なく投入完了。`pnpm dev` の起動準備も完了している。
