# Issue #571 ブラウザ検証用シードデータ

`pnpm db:migrate` + `pnpm seed:dev-admin` + 追加 UPDATE でローカル D1 に投入。

## ログインユーザー
- email: dev-admin@example.com / role: admin / active / email_verified
- username: `dev-admin` / display_name: `Dev Admin`
- bio: 「開発環境テスト用のダミーアカウントです。設定画面の動作確認に使っています。」（37文字 → カウンタ `37 / 500`）
- avatar_media_id: NULL（イニシャル fallback 確認用）
- last_username_changed_at: `2026-06-01T09:00:00.000Z`（+30日=2026-07-01 → 「次に変更できる日付」表示用）
- updated_at: `2026-06-05T14:30:00.000Z`（=lastSavedAt → 「最終保存」JST 2026年6月5日 23:30）
- session token (`__Host-session`): `dev-admin-session-token`

## 追加 UPDATE（/tmp/mt571-seed.sql）
```sql
UPDATE users SET
  bio = '開発環境テスト用のダミーアカウントです。設定画面の動作確認に使っています。',
  last_username_changed_at = '2026-06-01T09:00:00.000Z',
  updated_at = '2026-06-05T14:30:00.000Z',
  avatar_media_id = NULL
WHERE id = '01950000-0000-7000-8000-000000000001';
```

## EDGE-2 用の一時 UPDATE（検証後に元へ戻した）
```sql
UPDATE users SET last_username_changed_at = NULL WHERE id = '01950000-0000-7000-8000-000000000001';
```

## テスト用アバター画像（/tmp/mt571-assets/）
- avatar-valid.png（512×512 PNG）
- avatar-big.png（3000×3000, 46MB → サイズ reject 用）
- bad.gif（64×64 GIF → 形式 reject 用）

## cookie 注入
```
agent-browser --session <s> cookies set "__Host-session" "dev-admin-session-token" \
  --url http://localhost:<port> --path / --secure --sameSite Lax
```

## APP_URL
- `wrangler.toml [vars]` に `APP_URL = "http://localhost:8787"` → URL プレビューは `http://localhost:8787/u/dev-admin`
