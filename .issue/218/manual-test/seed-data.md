# Seed data for Issue #218 manual test

**Issue:** #218 — 管理画面：プロンプト・デザイントークンを「デフォルト上書き」モデルにしてリセット可能にする
**作成日:** 2026-05-28
**サーバ:** `http://localhost:3000/` (`pnpm dev` 起動済み)
**DB:** ローカル D1 (`.wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite`) — マイグレーション適用済み

---

## サマリ

`testing.md` のテストに必要なロールは以下の 2 つ。

- **admin ロール** — `/admin/prompts` `/admin/design` の編集／リセット動作確認
- **非 admin (member) ロール** — エッジケース「非 admin ユーザーのアクセス拒否」確認

ローカル D1 にはすでに baseline seed (`.manual-test/2026-05-17/seed.sql`) 由来のアカウントが
投入済みのため、新規作成は **不要**。既存アカウントを流用する。

`ADMIN_SETUP_TOKEN` は `.dev.vars` で空文字 (`""`) になっており、`/setup` ルートは 404 を
返す（運用設計どおり）。本テストは setup フローを必要としない。Google OAuth も使わない。

---

## 使用アカウント

### 1. admin（テスト主役）

| 項目 | 値 |
|---|---|
| label | admin-user |
| username | `admin-user` |
| email | `admin@example.com` |
| password | `Password123!` |
| role | `admin` |
| user.id | `01938f00-0000-7000-8000-0000000000c1` |
| email_verified | 1 |
| banned | 0 |

用途: 確認項目 1〜6（プロンプト編集／リセット、デザイントークン編集／リセット）すべて。

### 2. 非 admin（アクセス拒否確認用）

| 項目 | 値 |
|---|---|
| label | existing-user |
| username | `existing-user` |
| email | `existing@example.com` |
| password | `Password123!` |
| role | `member` |
| user.id | `01938f00-0000-7000-8000-0000000000a1` |
| email_verified | 1 |
| banned | 0 |

用途: エッジケース「1. 非 admin ユーザーのアクセス拒否」(`/admin/prompts` / `/admin/design`
へ URL 直叩きでの応答確認)。

### 3. P23 整合性確認用（オプション）

エッジケース「3. UserPromptOverride 画面 (P23) の整合性」で `/settings/prompts` 相当を
開くため、上記 `existing-user` をそのまま流用可能。別アカウントを要する手順は無し。

---

## 投入元 / 再投入

baseline seed は以下で再投入できる（破壊的操作を行った後に初期状態へ戻す場合のみ）。
本 Issue #218 のテストは admin 設定の書き換えのみで `users` 行を破壊しないので、
通常は再投入不要。

```bash
./.manual-test/2026-05-17/reseed.sh           # --local
```

ただし `instance_settings` テーブル（プロンプト上書き／デザイントークン上書きを格納）
は baseline seed が触らないため、各 TC 完了後に admin 画面の「全リセット」を実行する
ことで初期状態に戻すこと。SQL で直接戻す場合は:

```bash
pnpm wrangler d1 execute tanstack-start-template-d1 --local \
  --command "DELETE FROM instance_settings WHERE key IN ('prompts.overrides', 'design.tokenOverrides');"
```

（キー名は実装で確認のこと。Issue #218 のリハイドレート正規化テストにも有用。）

---

## 既存 admin の確認結果

ローカル D1 に対し以下を確認済み（2026-05-28）:

```sql
SELECT id, username, email, role, email_verified, banned FROM users
 WHERE email IN ('admin@example.com','existing@example.com');
```

結果:

```
01938f00-0000-7000-8000-0000000000a1|existing-user|existing@example.com|member|1|0
01938f00-0000-7000-8000-0000000000c1|admin-user|admin@example.com|admin|1|0
```

`accounts` テーブルにも対応する `credential` プロバイダ行が存在し、`password` が
PBKDF2 ハッシュとして格納済み（`pbkdf2-sha256-v1$600000$...`）。

---

## 認証フロー

- ログイン URL: `http://localhost:3000/login`
- フォーム: `app/components/auth/LoginForm/`（email + password でサインイン）
- email + password で投稿 → `/?page=1&limit=20` などホームへリダイレクト
- ログイン後、admin は `/admin/prompts` / `/admin/design` にアクセス可
- 非 admin はガード / 404 / 認可エラー応答（testing.md の挙動を確認する）

---

## 問題点 / 補足

- `ADMIN_SETUP_TOKEN` が空のため `/setup` 経由の新規 admin 作成は不可だが、すでに
  baseline seed で admin が存在するため問題なし。
- Google OAuth (`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`) は `.dev.vars` に設定
  済みだが、本テストは credential プロバイダのみで完結するため使用しない。
- パスワード `Password123!` は `.manual-test/2026-05-17/seed.sql` 内の PBKDF2 ハッシュ
  と対応する平文。`.issue/59` `.issue/60` のテスト実績でログイン動作確認済み。
