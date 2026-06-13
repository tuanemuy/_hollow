# シードデータ整備 — Issue #583

## 実行した準備
- `pnpm db:migrate` — マイグレーション適用（適用済みのため No migrations to apply）
- `pnpm seed:dev-admin` — dev-admin ユーザー + セッション投入（冪等）
- `pnpm db:execute:local .issue/544/manual-test/seed.sql` — 実行は success を返すが、現行 `notes` スキーマ（`id`/`directory_id`/`slug`/`content_html`、visibility は `publication_states` 側）と seed の列構成（`note_id`/`visibility`）が乖離しており #544 由来の note 0020/0021 は投入されなかった。ただし既存シードで admin 所有の active ノートが 22 件あるため検証には支障なし。

## 認証
- セッション cookie 名: `__Host-session`、値: `dev-admin-session-token`
- `__Host-` プレフィックスのため `document.cookie` では設定不可。agent-browser では CDP 経由で注入する:
  ```bash
  agent-browser --session {s} cookies set "__Host-session" "dev-admin-session-token" \
    --url http://localhost:3000 --path / --secure --sameSite Lax
  ```

## テストで使うアカウント / データ
- ユーザー: dev-admin（`owner_id = 01950000-0000-7000-8000-000000000001`）
- テスト対象ノート: `01950000-0000-7000-8000-000000000202`（title「Test Note 02」, status active）
  - 編集: `/notes/01950000-0000-7000-8000-000000000202/edit`
  - 詳細: `/notes/01950000-0000-7000-8000-000000000202`
- 別ノート（誤消去テスト用）: `01950000-0000-7000-8000-000000000203` 等、admin 所有の他 active ノート

## 環境変数
- `AGENT_BROWSER_DEFAULT_TIMEOUT=20000`
- `AGENT_BROWSER_IDLE_TIMEOUT_MS=120000`
