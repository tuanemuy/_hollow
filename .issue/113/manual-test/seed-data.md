# Seed Data

## DB migrations

- `pnpm db:apply:local` 実行済み (migration `0009_drop_legacy_instance_settings.sql` 適用)

## 環境変数 (TC-EDGE-1 / TC-EDGE-2 共通)

- `.dev.vars`:
  - `BETTER_AUTH_SECRET` (既存値を使用)
  - `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (既存値)
  - `ADMIN_SETUP_TOKEN="dev-setup-token-tc-edge-2026"` (テスト用に投入: `/setup` を有効化するため)
  - `SECRET_BOX_MASTER_KEY=ZGV2LW9ubHktZG8tbm90LXVzZS1pbi1wcm9kLWRvLTE=` (.dev.vars.example のローカル開発用 placeholder)
  - `ADMIN_LLM_API_KEY=""` (TC-EDGE-1) → `ADMIN_LLM_API_KEY="dummy-key-for-test"` (TC-EDGE-2)
  - `R2_*=""` (StubObjectStorage に倒れる)
- `wrangler.toml [vars]`:
  - `ADMIN_LLM_MODEL="claude-3-5-sonnet-latest"` (TC-EDGE-1 はそのまま、TC-EDGE-2 のときコメントアウト)

## テストアカウント

- `/setup` でブートストラップ作成する admin ユーザー:
  - email: `admin-tcedge@example.com`
  - password: `Admin#TC-Edge-2026!`
  - 役割: admin (setup フローで作成されたユーザーは admin role を持つ)
  - 設定トークン: `dev-setup-token-tc-edge-2026`

## Fixture

- `.issue/113/manual-test/fixtures/tiny.png` — 1x1 px PNG (69 bytes), `image/png`

## 重要事項

- 既存 DB の本番データは触れない (D1 local の `.wrangler/state/v3/d1`)
- テスト終了時に `.dev.vars` と `wrangler.toml` を backup から復元する
