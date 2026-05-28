# Seed Data — Issue #293

実行日: 2026-05-28

## 整備内容

既存の local D1 DB に baseline seed が投入済み（`.manual-test/2026-05-17/seed.sql`）。本 Issue では追加投入なし。

## 使用するアカウント

| 用途 | email | password |
|---|---|---|
| 主検証 | existing@example.com | Password123! |

## メモ

- ポート 5173 は他 worktree が使用中。`pnpm dev` は vite config の baked-in port で 3000 を採用。
- 検証 URL: http://localhost:3000/
