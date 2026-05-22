# Seed Data — Issue #101 manual-test

ローカル D1（`.wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite`）に
Issue #101（LLM providers: OpenAI / Gemini 追加）のブラウザテスト用環境を整備した記録。

## 適用した migration

`pnpm db:migrate`（= `wrangler d1 migrations apply tanstack-start-template-d1 --local`）を実行。
新規に適用されたものは 1 件。

- `app/core/adapters/d1/migrations/0010_add_llm_base_url.sql`
  - `instance_settings` テーブルに `llm_base_url TEXT` カラム追加（NULL 許容）
  - Issue #101 の OpenAI 互換 endpoint 設定で利用

適用後の `d1_migrations` テーブル状態:

```
0000_initial.sql
0001_hollow_schema.sql
0002_publication_occ.sql
0003_ingestion_occ.sql
0004_export_job_occ.sql
0005_drop_todos.sql
0006_admin_job_listing_indexes.sql
0007_notes_slug_partial_unique.sql
0008_search_documents_fts_trigram.sql
0009_drop_legacy_instance_settings.sql
0010_add_llm_base_url.sql   ← 今回追加
```

スキーマ確認:

```bash
pnpm wrangler d1 execute tanstack-start-template-d1 --local \
  --command "SELECT sql FROM sqlite_master WHERE type='table' AND name='instance_settings';"
# → llm_base_url TEXT カラムが追加済み
```

## 投入した admin user

既存の seed 仕組み（`.manual-test/2026-05-17/seed.sql` および `reseed.sh`）に
admin ロール × email/password 認証の admin user が既に投入されている。
今回はそれを流用する（再投入は不要、`reseed.sh` で復元可能）。

| 項目 | 値 |
|---|---|
| label | admin-user |
| user.id | `01938f00-0000-7000-8000-0000000000c1` |
| username | `admin-user` |
| email | `admin@example.com` |
| password | `Password123!` |
| role | `admin` |
| email_verified | `1` |
| banned | `0` |
| 認証経路 | Email + Password（Better Auth credential provider） |
| password hash | PBKDF2-HMAC-SHA256 / 600,000 iter / 16-byte salt / 32-byte derived key（`app/core/adapters/d1/repositories/credentialStore.ts` 準拠） |

### DB row 確認方法

```bash
# admin user 本体
pnpm wrangler d1 execute tanstack-start-template-d1 --local \
  --command "SELECT id, username, email, role, email_verified, banned \
             FROM users WHERE id = '01938f00-0000-7000-8000-0000000000c1';"

# credential アカウント（pbkdf2 hash の prefix だけ確認）
pnpm wrangler d1 execute tanstack-start-template-d1 --local \
  --command "SELECT user_id, provider_id, account_id, substr(password,1,30) AS pwd_prefix \
             FROM accounts WHERE user_id = '01938f00-0000-7000-8000-0000000000c1';"
# → provider_id = 'credential', pwd_prefix = 'pbkdf2-sha256-v1$600000$...'
```

### 再投入（破壊的 TC 後）

```bash
./.manual-test/2026-05-17/reseed.sh
# baseline 3 件 + throwaway 9 件を DELETE → seed.sql で復元
```

Issue #101 のテストは admin user の改名/削除を含まないので、
原則 reseed 不要。`/admin/llm` で `instance_settings` を直接書き換えるだけ。

### instance_settings の初期状態

```bash
pnpm wrangler d1 execute tanstack-start-template-d1 --local \
  --command "SELECT id, llm_provider, llm_model, llm_api_key_source, llm_base_url \
             FROM instance_settings;"
# → 空（行なし）。アプリ起動後、/admin/llm の初回保存または
#   `instanceSettingsRepository` の `ensureSingleton` 経路で materialize される
```

Issue #101 のテストでは `/admin/llm` フォームから provider / model / apiKey / baseURL
を保存することで singleton 行を作成する流れ。初期投入は不要。

## 環境変数

ローカル `.dev.vars`（git-ignored）に以下を設定済み。実値は dev 用プレースホルダ。

| key | 値（マスク） | 用途 |
|---|---|---|
| `BETTER_AUTH_SECRET` | `WaZkdVj…COFk=`（base64-32B、既存値） | Better Auth session/CSRF 署名 |
| `GOOGLE_CLIENT_ID` | `…apps.googleusercontent.com`（既存値） | Google OAuth（Issue #101 では未使用） |
| `GOOGLE_CLIENT_SECRET` | `GOCSPX-…VHZ`（既存値） | Google OAuth（同上） |
| `ADMIN_SETUP_TOKEN` | `""`（空） | admin sign-up gate。admin は seed 済みなので不要 |
| `SECRET_BOX_MASTER_KEY` | `ZGV2…MS0=`（example の placeholder, base64-32B） | TC10（DB key 経路、`secretBox.decrypt`）に必須 |
| `ADMIN_LLM_API_KEY` | `""`（空） | TC4-9 は `/admin/llm` の DB 経路で apiKey を保存するので env override は空のままで OK。TC12（Anthropic regression）を実行する時のみ Anthropic key を set |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | すべて `""`（空） | Issue #101 は R2 を使わない（StubObjectStorage 縮退で OK） |

`wrangler.toml [vars]` 側の Issue #101 関連設定（gitに入っている、変更不要）:

```
ADMIN_LLM_PROVIDER  = "anthropic"            # デフォルト。`/admin/llm` で DB 上書き
ADMIN_LLM_MODEL     = "claude-3-5-sonnet-latest"
ADMIN_LLM_BASE_URL  = ""                     # OpenAI 互換 endpoint 切替用、デフォルトは空
```

`grep -rn "ADMIN_LLM_BASE_URL" wrangler.toml infra/` で **7 hit**（testing.md TC2 の確認項目）が期待される。

### TC11（NullSecretBox fallback）を実行する場合

`.dev.vars` の `SECRET_BOX_MASTER_KEY` 行を一時的にコメントアウト or 空文字 ←→ 実値 で
切り替えてから `pnpm dev` を再起動する。確認後は必ず実値に戻すこと。

### TC12（Anthropic regression）を実行する場合

`.dev.vars` の `ADMIN_LLM_API_KEY` に有効な Anthropic key を一時設定:

```
ADMIN_LLM_API_KEY="sk-ant-…"
```

`/admin/llm` で provider = anthropic, model = claude-3-5-sonnet-latest を保存し直して
ingestion を流す。確認後、不要なら空に戻す。

## ポート状況

| port | 状態 | 用途 |
|---|---|---|
| 3000 | 空き | `pnpm dev`（vite dev、`vite.config.cloudflare.ts` の `server.port = 3000`） |
| 8787 | 空き | `pnpm start`（wrangler dev、`wrangler.toml` の `APP_URL = http://localhost:8787` と一致） |

`lsof -iTCP -sTCP:LISTEN -P | grep -E ":(3000|8787)"` → 何も hit せず、両方空き状態を確認。

### 起動方法

```bash
# 推奨（Issue #101 のテストはこれで実施）:
pnpm dev
# → http://localhost:3000 で TanStack Start アプリ（vite + workerd via @cloudflare/vite-plugin）

# wrangler dev（built artifact ベース）で挙動を見たい場合:
pnpm build && pnpm start
# → http://localhost:8787
```

vite dev の場合、admin UI の routing は `localhost:3000` でアクセスする。
ただし `wrangler.toml [vars].APP_URL` は `http://localhost:8787` のまま（変更不要、
better-auth の callback URL 等に使われるが Issue #101 のテストは email+password ログインなので影響なし）。

## 認証フロー（ブラウザテスト用）

1. **アプリ起動**:
   ```bash
   pnpm dev
   ```
2. **ログイン画面に遷移**: `http://localhost:3000/login`
3. **admin credential で sign-in**:
   - email: `admin@example.com`
   - password: `Password123!`
   - 「ログイン」ボタンを押下
4. **admin ページに到達**: `http://localhost:3000/admin/llm`
   - サイドナビ「LLM 設定」リンクからでも遷移可
   - admin role を持たないユーザーは admin route guard で reject される

到達確認のスクリーンショット保存先: `.issue/101/manual-test/screenshots/`（適宜作成）

## 懸念事項

- **`wrangler.toml [vars].APP_URL` と vite dev port の不一致**: APP_URL は `http://localhost:8787` を指しているが `pnpm dev` は port 3000 で立つ。Issue #101 のテスト（email+password ログイン + `/admin/llm` フォーム操作 + ingestion job）には影響しないが、Google OAuth の callback などを試す場合は `pnpm start`（wrangler dev、8787）側を使う必要がある。
- **Google OAuth の credentials は既存値（実値）**: `.dev.vars` に commit 済みの値ではなく、開発者が以前個別に設定したもの。Issue #101 のテストには関係ないが、もし機能テストで OAuth login を試した結果リダイレクトがズレた場合は wrangler dev (8787) で実施するか、callback URL を Google Cloud Console 側で `localhost:3000` 用に追加する必要がある。
- **TC11 と TC10 の env 切替**: `SECRET_BOX_MASTER_KEY` の値を変えるごとに `pnpm dev` の再起動が必要（wrangler `[vars]` / `.dev.vars` は dev サーバ起動時に injected）。テスト実行者が手順を意識すること。
- **`instance_settings` singleton row のライフサイクル**: Issue #101 のテストで一度 `/admin/llm` から保存すると、`provider = openai/gemini/anthropic` に切り替わるたびに `llm_api_key_ciphertext` / `llm_base_url` が DB に残る。TC を跨いで状態が引き継がれるので、必要に応じて手動 DELETE で初期化:
  ```bash
  pnpm wrangler d1 execute tanstack-start-template-d1 --local \
    --command "DELETE FROM instance_settings WHERE id = 'singleton';"
  ```
- **`ADMIN_LLM_API_KEY` を env で set すると DB 経路の検証が masked される**: TC10（DB resolution）を見たい時は必ず env を空にすること。逆に TC12（Anthropic regression）では env path を見たいので set する。`seed-data.md` の「環境変数」セクションの注記参照。
- **PBKDF2 600,000 iter のローカル ログインは数百 ms 程度かかる**: 初回ログインで体感できる遅延あり、ただし本番挙動と同じ。タイムアウト系のテストで誤判定しないよう注意。
