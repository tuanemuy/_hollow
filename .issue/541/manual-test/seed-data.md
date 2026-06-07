# シードデータ — Issue #541 ブラウザ検証

## ログイン方法（cookie 注入）
- セッション cookie: `__Host-session` = `dev-admin-session-token`（Secure 必須 → CDP 経由で注入）
- 注入コマンド:
  ```
  agent-browser cookies set "__Host-session" "dev-admin-session-token" --url http://localhost:8787 --path / --secure --sameSite Lax
  ```
- ユーザー: `dev-admin@example.com` / role=admin / id=`01950000-0000-7000-8000-000000000001`

## 投入データ
- users: 1（dev-admin、`pnpm seed:dev-admin`）
- sessions: 1（token=dev-admin-session-token、長期有効）
- notes: テスト用 1 件
  - **single export 用ノート ID: `01950000-0000-7000-8000-000000000010`**
  - single export URL: `/notes/01950000-0000-7000-8000-000000000010/export`

## テストファイル（/tmp/hollow541/）
- `archive.zip`（31B）— 未対応形式 → `.alert-error`
- `large.md`（53,000,000B ≈ 50.5MB）— サイズ超過（上限 52,428,800）→ `.alert-warning`（形式は対応 .md）
- `note.md`（14B）— 対応形式・サイズ内 → 正常アップロード確認用

## 注意
- `embedMedia` 既定 `true` のため `/export`（bulk）初期表示で `.alert-info` が出る（意図的）。非発火確認時は OFF にする。
- フォーム送信 click が agent-browser で発火しないことがある（docs/test.md）。本検証はクライアント検証バナーが主目的で実サーバー送信は不要。
