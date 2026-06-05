# Issue #487 — manual-test seed data

**Date:** 2026-06-05
**Database:** local D1 (`hollow-local-d1`, `--local`)

## 概要

Issue #487（設定画面ナビゲーション）の動作確認は認証済みユーザーが必要。確立済みの
`pnpm seed:dev-admin` レシピで dev-admin（active / verified）ユーザー＋固定セッションを投入した。
設定画面は認証済みなら誰でもアクセスできるため、admin である必要はないが、決定論的な
dev-admin で十分。Issue #487 固有の追加データは不要。

## 実行コマンド

```bash
pnpm db:migrate      # "No migrations to apply!"（既適用）
pnpm seed:dev-admin  # idempotent
```

## テストで使うアカウント / ログイン方法

| username | email | role | token |
|---|---|---|---|
| `dev-admin` | `dev-admin@example.com` | admin (active) | `dev-admin-session-token` |

セッションクッキー `__Host-session`（Secure-only）を agent-browser の CDP 経由で注入してログインする:

```bash
agent-browser cookies set "__Host-session" "dev-admin-session-token" \
  --url http://localhost:<port> --path / --secure --sameSite Lax
```
