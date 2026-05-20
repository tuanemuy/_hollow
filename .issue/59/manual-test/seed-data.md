# Issue #59 — manual-test seed data

**Date:** 2026-05-20
**Database:** local D1 (`.wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite`)
**Binding:** `tanstack-start-template-d1`

## 概要

Issue #59（`/admin` Dashboard / `/admin/metrics` の 500 解消）の動作確認に必要な
admin / 非admin アカウントを `.manual-test/2026-05-17/seed.sql`（baseline seed）
の投入で確保した。Issue #59 固有の追加データは不要。

## 実行コマンド

```bash
# マイグレーション（既適用 — "No migrations to apply!"）
pnpm db:apply:local

# baseline seed 投入
pnpm wrangler d1 execute tanstack-start-template-d1 --local \
  --file=.manual-test/2026-05-17/seed.sql
```

実行結果: すべてのバッチが `"success": true` で完了。`users` テーブルに 13 件
（baseline 12 + 既存 `test-user-001` 1）が存在。

## テストで使うアカウント

testing.md で参照されているアカウント。`Password123!` 共通。

| 用途 | username | email | password | role | 状態 |
|---|---|---|---|---|---|
| admin（テスト主役） | `admin-user` | `admin@example.com` | `Password123!` | `admin` | verified / not banned |
| 非 admin（拒否確認用） | `mailowner` | `existing-new@example.com` | `Password123!` | `member` | verified / not banned |
| 非 admin 代替 | `existing-user` | `existing@example.com` | `Password123!` | `member` | verified / not banned |

> 注: testing.md の本文には `mailowner@example.com` と書かれているが、baseline
> seed の `mailowner` ラベルアカウントの実メールは `existing-new@example.com`。
> 非 admin での 403／リダイレクト挙動を見るだけなので、`existing@example.com`
> もしくは下記スローアウェイ任意のアカウントで代替可能。

## 投入済み全アカウント（baseline 12 件 + 既存 1 件）

### ベースライン

| label | username | email | role |
|---|---|---|---|
| existing-user | `existing-user` | `existing@example.com` | `member` |
| mailowner | `mailowner` | `existing-new@example.com` | `member` |
| admin-user | `admin-user` | `admin@example.com` | `admin` |

### スローアウェイ（破壊的 TC 用、本 Issue では未使用）

| label | username | email |
|---|---|---|
| tc-rename-a | `tc-rename-a` | `tc-rename-a@example.com` |
| tc-rename-b | `tc-rename-b` | `tc-rename-b@example.com` |
| tc-rename-c | `tc-rename-c` | `tc-rename-c@example.com` |
| tc-delete-a | `tc-delete-a` | `tc-delete-a@example.com` |
| tc-email-a | `tc-email-a` | `tc-email-a@example.com` |
| tc-email-b | `tc-email-b` | `tc-email-b@example.com` |
| tc-password-a | `tc-password-a` | `tc-password-a@example.com` |

### 事前状態

| label | username | email | 状態 |
|---|---|---|---|
| tc-unverified | `tc-unverified` | `tc-unverified@example.com` | `email_verified=0` |
| tc-suspended | `tc-suspended` | `tc-suspended@example.com` | `banned=1` |

### その他既存

| username | email | role |
|---|---|---|
| `test-user-001` | `test-user-001@example.com` | `member` |

## 確認結果

- `admin@example.com` (role=admin) の存在を `SELECT` で確認 — OK
- `existing-new@example.com` / `existing@example.com` (role=member) の存在を `SELECT` で確認 — OK
- `SELECT COUNT(*) FROM users` = 13 件
- マイグレーション適用済み（`pnpm db:apply:local` が "No migrations to apply!"）

## 既知の前提

- `instance_settings` は未投入。本 Issue の `/admin/metrics` は `loadInstanceSettings`
  経由で「インスタンス上限」セクションの値を表示するが、当該リポジトリが空でも
  ページ自体は描画されることが想定されている（testing.md の確認項目 2 参照）。
  もし空状態で何かしらの不具合が出るようなら別途投入が必要。
- 全アカウントの password は `Password123!`、role は `member`（admin-user を除く）、
  `email_verified=1` / `banned=0`（事前状態アカウントを除く）。
