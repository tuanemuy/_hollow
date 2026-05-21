# Issue #96 — manual-test seed data

**Date:** 2026-05-20
**Database:** local D1 (`.wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite`)
**Binding:** `tanstack-start-template-d1`

## 概要

Issue #96（`createRequestContainer` の `as unknown as RequestContainer` キャスト撤廃 /
未配線ポートのコンパイル時検出）の動作確認に必要な admin / 非 admin アカウントを、
baseline seed（`.manual-test/2026-05-17/seed.sql`）の流用と Issue #96 用の追加 1 件で確保した。

testing.md は本文中で `admin@example.com` / `mailowner@example.com`（いずれも `Password123!`）
を参照するため、baseline に存在しない `mailowner@example.com` を補助シードで追加投入している。
admin (`admin@example.com`) は baseline に既存。

## 実行した準備作業

```bash
# 1. マイグレーション適用（既適用 — "No migrations to apply!"）
pnpm db:apply:local

# 2. baseline seed は既投入済み（前回 Issue #59 manual-test で適用済み）
#    再投入が必要なら:
#    pnpm wrangler d1 execute tanstack-start-template-d1 --local \
#      --file=.manual-test/2026-05-17/seed.sql

# 3. Issue #96 用の補助シード（mailowner@example.com を追加）
pnpm wrangler d1 execute tanstack-start-template-d1 --local \
  --file=.issue/96/manual-test/issue96-supplement.sql
```

すべての DML が `"success": true` で完了。

## 投入したシードデータの概要

| テーブル | 投入後レコード数 | 備考 |
|---|---|---|
| `users` | 14 | baseline 13 + Issue #96 補助 1 |
| `accounts` | 14 | credential プロバイダ |
| `directories` | 19 | 各ユーザーの root directory（`parent_id IS NULL`） |
| `instance_settings` | 0（未投入） | `/admin/metrics` は空でも描画可（testing.md 確認項目 3 の前提） |

補助シード（`.issue/96/manual-test/issue96-supplement.sql`）の内訳:

- `users` 1 行（`mailowner@example.com`、role=`member`、`email_verified=1`、`banned=0`）
- `accounts` 1 行（provider=`credential`、password=`Password123!` の PBKDF2 ハッシュ）
- `directories` 1 行（root directory）

ID プレフィックスは `01938f96-*` を使用し、baseline (`01938f00-*` / `01938f01-*`) と衝突しないように分離。

## テストで使用するアカウント

testing.md で参照されているアカウント。`Password123!` 共通。

| 用途 | username | email | password | role | 出典 |
|---|---|---|---|---|---|
| admin（テスト主役） | `admin-user` | `admin@example.com` | `Password123!` | `admin` | baseline seed |
| 非 admin（一般動線・非 admin 拒否確認用） | `mailowner-issue96` | `mailowner@example.com` | `Password123!` | `member` | Issue #96 補助 seed |

### 代替（baseline に既存、testing.md の literal とは別 email）

| username | email | password | role | 備考 |
|---|---|---|---|---|
| `mailowner` | `existing-new@example.com` | `Password123!` | `member` | baseline、非 admin として代替可 |
| `existing-user` | `existing@example.com` | `Password123!` | `member` | baseline、非 admin として代替可 |

## 設定した環境変数

testing.md の確認項目 4（`SecretBoxError(KeyUnavailable)` が描画時に出ないこと）を満たすため、
本 Issue で optional 化された以下のキーは `.dev.vars` に **追加しない**。

| キー | 状態 | 理由 |
|---|---|---|
| `SECRET_BOX_MASTER_KEY` | 未設定 | `NullSecretBox` fallback の挙動を検証する |
| `ADMIN_LLM_API_KEY` | 未設定 | optional 化を検証する |

既存の `.dev.vars` に設定されているキー（値はマスク）:

| キー | 値 |
|---|---|
| `BETTER_AUTH_SECRET` | `<masked>` |
| `GOOGLE_CLIENT_ID` | `<masked>` |
| `GOOGLE_CLIENT_SECRET` | `<masked>` |

`wrangler.toml` は変更していない。

## 確認結果

- `admin@example.com` (role=`admin`) — OK（baseline）
- `mailowner@example.com` (role=`member`) — OK（補助シード投入後）
- `pnpm db:apply:local` — "No migrations to apply!"（既適用）
- `users` 件数: 13 → 14（補助シード 1 件追加で整合）

## 既知の前提・備考

- 補助シードで使用したパスワードハッシュは baseline `mailowner` 行のものを流用した
  encoded 文字列（`pbkdf2-sha256-v1$600000$<salt>$<hash>`）。salt は文字列に含まれており、
  検証時は埋め込まれた salt を使って PBKDF2 を回すため、別 user で再利用しても
  `Password123!` で認証成功する（`app/core/adapters/d1/repositories/credentialStore.ts` 準拠）。
- `instance_settings` 未投入。`/admin/metrics` は空でも描画される想定（前回 Issue #59 検証で確認済）。
- D4 再投入プロトコルが必要な破壊的 TC は Issue #96 testing.md には無いので reseed.sh は不要。
- もし baseline seed をやり直す場合は `.manual-test/2026-05-17/reseed.sh` 実行後に
  必ず `.issue/96/manual-test/issue96-supplement.sql` を再適用すること
  （reseed.sh は baseline ID のみを DELETE/INSERT する想定だが、本補助シードは別 ID 帯なので
  reseed 後も残るが、消えた場合に備えての記載）。

## 問題と対処

- **問題:** testing.md は `mailowner@example.com` を literal で参照するが、baseline seed の
  同 username (`mailowner`) は別 email (`existing-new@example.com`) を保有していたため、
  testing.md 通りのログインができなかった。
- **対処:** `.issue/96/manual-test/issue96-supplement.sql` で `mailowner@example.com` を持つ
  member ユーザー 1 件を別 ID で追加投入し、testing.md の literal と一致させた。
  既存 baseline ユーザーには変更を加えていない。
