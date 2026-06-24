# Issue #615 (P22 セッション一覧の表示リッチ化) — ブラウザ検証用シードデータ

作成日: 2026-06-25
対象 D1: `hollow-local-d1`（`--local`）。本番データには一切触れていない。

## 概要

P22 セッション一覧は「同一ユーザーの複数アクティブセッション」を互いに異なる userAgent で
表示し、device-parser のラベル差・アイコン差・最終アクセス相対時刻を見せる機能。
agent-browser は単一 UA でしかログインできないため、

1. ブラウザのサインアップ相当（scrypt で直接 INSERT）でテストユーザーを 1 名用意し
2. そのユーザーでブラウザから実ログインして「このセッション」になる本物の cookie 付きセッションを作り
3. 異なる userAgent / ipAddress / updatedAt を持つアクティブセッションを 4 行 D1 に直接 INSERT した。

## 実行した準備作業

1. `.issue/615/testing.md` を読み、検証に「同一ユーザー × 異なる UA の複数アクティブセッション」が
   必要であることを確認。
2. 認証・セッション実装を調査:
   - 認証フロー: `app/core/application/identity/{logIn,signUp}.ts`、画面は `/login`・`/signup`。
   - ログインはメール+パスワード。`logIn` はパスワード検証後に user `status` を見て、
     `pending`（email_verified=0）だと `unverified` で弾くため、テストユーザーは
     `email_verified=1` 必須。
   - パスワードは scrypt（`app/core/adapters/security/scrypt.ts`、OWASP 2nd tier、
     エンコード `$scrypt$ln=16,r=8,p=1$<salt-b64>$<hash-b64>`）。`accounts` テーブルの
     `provider_id='credential'` 行の `password` 列に格納。
   - セッショントークンは **平文保存**（ハッシュなし）。`D1SessionService.resolve` は raw token を
     一致比較（`app/core/adapters/d1/repositories/sessionService.ts`）。
   - cookie 名は `__Host-session`（`app/core/presentation/authMiddleware.ts`）。
   - `listForUser` は `expires_at > now`（ISO 文字列比較）で絞り `created_at DESC` で並べる。
3. テストユーザー作成スクリプトを用意（`scripts/seed-dev-login.mjs` の scrypt ロジックを踏襲）:
   `.issue/615/manual-test/seed-user.mjs` を実行し `test-615@example.com` を投入。
4. agent-browser で `/login` から実ログイン → `/` にリダイレクト成功。本物のセッション 1 行が
   生成された（`__Host-session` cookie 付き、「このセッション」になる行）。
5. 異なる UA/IP/updatedAt のセッション 4 行を `.issue/615/manual-test/seed-sessions.sql` で INSERT。
6. `SELECT` で 5 行（実ログイン 1 + 注入 4）を確認。`/settings/security` をブラウザで開き、
   device ラベル（Safari / Chrome / iOS / macOS / Windows）・curl フォールバック・
   相対時刻（たった今 / N分前 / N時間前 / N日前）・「このセッション」バッジ・IP 素出しが
   描画されることを確認した。

## 作成したテストユーザー（ログイン情報）

| 項目 | 値 |
|------|-----|
| email（ログインID） | `test-615@example.com` |
| password | `Test615Passw0rd!` |
| username | `test-615` |
| user_id | `01951615-0000-7000-8000-000000000001` |
| role | member（active: email_verified=1 / banned=0 / deleted_at=NULL） |

再投入: `node .issue/615/manual-test/seed-user.mjs`（冪等）。

## ログイン手順

1. http://localhost:3000/login を開く。
2. `input[name="email"]` に `test-615@example.com`、`input[name="password"]` に `Test615Passw0rd!`。
3. 送信ボタン（`button[type="submit"]`）でログイン → `/` にリダイレクト。
4. http://localhost:3000/settings/security を開きセッション一覧を確認。

注: 実ログインで作られる「このセッション」行は `ip_address=null`（`LoginForm/action.ts` が
`ipAddress: null` を渡すため）、UA は使用ブラウザの値（agent-browser だと HeadlessChrome）。
これによりエッジケース2「IP が null のとき IP 行省略」も同時に確認できる。

## 投入したセッション行

「now」基準は注入時のサーバ時刻 約 `2026-06-24T16:35Z`（= JST 2026-06-25 早朝）。
全行 `expires_at` は十分未来（`2026-09-01T00:00:00.000Z`、実ログイン行のみ 30 日後）なので
`listForUser` の有効判定を通る。token は全行ユニーク。タイムスタンプは既存行に合わせ ISO 8601
（ミリ秒 + `Z`）。

| id 末尾 | 狙い | user_agent | ip_address | updated_at | 期待表示 |
|--------|------|-----------|-----------|-----------|---------|
| (実ログイン) | 「このセッション」現行行 | HeadlessChrome (Mac) | null | 注入時刻（たった今相当） | このセッション pill / IP 行省略 |
| `…00a3` | iPhone Safari / mobile | `Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 …Mobile/15E148 Safari/604.1` | `203.0.113.77` | `2026-06-24T16:30:00.000Z`（約5分前） | Safari on iOS / スマホ glyph / N分前 |
| `…00a4` | 判別不能（非ブラウザ）+ IP null | `curl/8.0.1` | null | `2026-06-24T14:35:00.000Z`（約2時間前） | 不明な端末（UA 素出し）/ 汎用 glyph / IP 行省略 |
| `…00a1` | macOS Safari / desktop | `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) …Version/17.0 Safari/605.1.15` | `203.0.113.10` | `2026-06-24T13:35:00.000Z`（約3時間前） | Safari on macOS / ラップトップ glyph / N時間前 |
| `…00a2` | Windows Chrome / desktop | `Mozilla/5.0 (Windows NT 10.0; Win64; x64) …Chrome/124.0.0.0 Safari/537.36` | `198.51.100.42` | `2026-06-21T16:35:00.000Z`（約3日前） | Chrome on Windows / desktop glyph / N日前 |

token 先頭（確認用、平文保存）:
- 実ログイン行: `_B4YNofN…`（毎回ランダム）
- iPhone: `test615-session-iphone-safari-…`
- curl: `test615-session-unknown-curl-…`
- macOS: `test615-session-macos-safari-…`
- Windows: `test615-session-windows-chrome-…`

再投入: `pnpm wrangler d1 execute hollow-local-d1 --local --file .issue/615/manual-test/seed-sessions.sql`（冪等。
注入 4 行のみ DELETE→INSERT。実ログイン行は触らない）。

## sessions テーブル実スキーマ（要点）

`app/core/adapters/d1/schema.ts`（`sessions`）:

| 列 | 型 | 制約 | 備考 |
|----|----|------|------|
| `id` | text | PK | UUIDv7 形式必須（rehydration） |
| `user_id` | text | NOT NULL, FK users(id) ON DELETE CASCADE | |
| `token` | text | NOT NULL, UNIQUE | **平文保存**（ハッシュなし）。base64url |
| `expires_at` | text | NOT NULL | ISO 8601 文字列。`> now` で有効判定 |
| `created_at` | text | NOT NULL | ISO 8601 文字列。一覧は DESC ソート |
| `updated_at` | text | NOT NULL | ISO 8601 文字列。`recordActivity` が `toISOString()` で更新。「最終アクセス」相対時刻のソース |
| `ip_address` | text | nullable | null なら meta の IP 行省略 |
| `user_agent` | text | nullable | device-parser の入力 |
| `impersonated_by` | text | nullable, FK users(id) ON DELETE SET NULL | 本検証では NULL |

参考: `users` は `email_verified`/`banned`（0/1 integer）、`role`（member/admin）、各時刻列は
ISO 8601 文字列。パスワードは `accounts.password`（scrypt）。

## 問題・対処

- サインアップ画面（`/signup`）はメール確認リンクが必要で、ローカルでは確認メールが届かないため
  そのままではログインできない（status=pending で弾かれる）。対処として、`scripts/seed-dev-login.mjs`
  と同じ scrypt 方式で `email_verified=1` のユーザーを直接投入する `seed-user.mjs` を用意し、
  ブラウザからは「実ログインのみ」を行った（パスワードハッシュは実装準拠なのでログイン成功）。
- 実ログイン行の `ip_address` は実装上 null 固定（`LoginForm/action.ts`）。これは仕様であり、
  エッジケース2（IP null → 行省略）の確認対象として活用できる。問題なし。
