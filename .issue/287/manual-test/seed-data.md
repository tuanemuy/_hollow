# シードデータ整備記録 — Issue #287

**実行日:** 2026-07-11

## 実行した準備作業

1. `pnpm build:local` — dev エントリ選択のローカルビルド（R2 dev プロキシ入り）
2. `pnpm db:migrate` — 適用済み（No migrations to apply）
3. `pnpm seed:dev-admin` — 管理ユーザー＋セッションを冪等投入

## テストで使用するアカウント情報

- セッショントークン: `dev-admin-session-token`
- cookie 注入コマンド:

```bash
agent-browser --session {s} cookies set "__Host-session" "dev-admin-session-token" \
  --url http://localhost:8787 --path / --secure --sameSite Lax
```

## テスト用ファイル

- 画像: `/private/tmp/claude-501/-Users-hikaru-github-com-tuanemuy-hollow/9503cebc-4347-4593-8fcf-7d2677dc4eb5/scratchpad/test-image.png`（8x8 PNG）

## 備考

- テスト用ノートは各テストケース内で UI から作成する（testing.md 前提データ参照）
- ブラウザは必ず `http://localhost:8787`（`127.0.0.1` 不可 — presign オリジン不一致）
