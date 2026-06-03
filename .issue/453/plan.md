# 実装計画 — Issue #453: ローカル dev 用の認証シードスクリプト（admin ユーザー＋セッション投入）を追加

**Issue:** #453
**作成日:** 2026-06-04
**複雑度:** 小規模

---

## 目的

ローカル dev（`pnpm dev`）で認証必須ルート（特に `/admin/*`）をブラウザ検証する際、
毎回 ad-hoc な手書き SQL で users / sessions を直挿ししていた暗黙知を解消する。
`pnpm seed:dev-admin` 一発で、決定論的な管理者ユーザー＋有効なセッションをローカル
D1 に投入し、ブラウザ検証に使えるセッショントークンと使い方を標準出力に表示する。

## スコープ

### 含まれるもの

- `users` ＋ `sessions` を投入する seed スクリプト（決定論的な id / email / token）。
  `email_verified=1`・`role=admin` で active 状態。
- 冪等性（再実行で重複・失敗しない）。
- 実行後にセッショントークンと使い方（cookie 注入手順）を標準出力に表示。
- `package.json` に `seed:dev-admin` を追加。
- `docs/test.md` に dev で認証必須ルートを手動/ブラウザ検証する手順を追記。

### 含まれないもの

- 一般ユーザーや多様な状態（suspended / pending 等）の網羅的 fixture。
- staging / production への適用（ローカル dev 専用）。
- root directory やノート等、admin 検証に不要なリソースの投入
  （admin ルートは users + sessions のみで成立することを #446 で確認済み）。
- seed を消す後始末スクリプト（任意項目。冪等な再実行で十分なため見送り。
  必要なら `DELETE FROM users WHERE email='dev-admin@example.com'` で対応可能と docs に記載）。

## 確認済みのメカニクス（#446 検証時 + 本計画時に再確認）

- **セッションは生トークン比較**: `sessionService.resolve(token)` は
  `sessions.token == token` を生比較。`users` ＋ `sessions`（`token` 任意文字列・
  `expires_at` 未来）を直接 INSERT すれば任意ユーザーのログイン状態を作れる。
  （`app/core/adapters/d1/repositories/sessionService.ts:77`）
- **admin は active 必須**: status 派生は `deleted_at→deleted` / `banned=1→suspended` /
  `email_verified=0→pending` / else `active`。admin ルートに通すには
  `email_verified=1`・`banned=0`・`deleted_at=NULL`・`role='admin'`。
  （`app/core/adapters/d1/repositories/userRepository.ts:59`）
- **id は UUIDv7 形式必須**: `UuidV7Generator.validate` が
  `^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$` を要求。
  `/admin/users` 等で user 行が rehydrate される際にこの検証を通らないと
  `SystemError(DataIntegrityError)` で落ちる。よって seed する `users.id` は
  この形式の固定値にする（例 `01950000-0000-7000-8000-000000000001`）。
  （`app/core/application/ports/idGenerator.ts`）
- **dev D1 への書き込み口**: `pnpm db:execute:local --file <sql>`
  （= `wrangler d1 execute hollow-local-d1 --local --file`）が `pnpm dev` の D1 に届く。
- **cookie 名**: `__Host-session`。`__Host-` は Secure 必須のため `document.cookie`
  では注入できず、CDP 経由（agent-browser cookies set ... --secure）で注入する。

## 実装ステップ

### 1. seed スクリプト本体を追加

- **対象ファイル:** `scripts/seed-dev-admin.mjs`（新規）
- **変更内容:**
  - 決定論的な定数を定義:
    - `USER_ID = "01950000-0000-7000-8000-000000000001"`（UUIDv7 形式）
    - `SESSION_ID = "01950000-0000-7000-8000-000000000002"`
    - `EMAIL = "dev-admin@example.com"` / `USERNAME = "dev-admin"` / `NAME = "Dev Admin"`
    - `TOKEN = "dev-admin-session-token"`（固定文字列。生比較なので任意で可）
    - `created_at` / `updated_at` は固定の過去 ISO（例 `2024-01-01T00:00:00.000Z`）、
      `expires_at` は十分先の固定 ISO（例 `2999-12-31T23:59:59.000Z`）。
      これにより `Date.now()` を使わず完全決定論的にする。
  - 冪等な SQL を生成（順序が重要）:
    1. `DELETE FROM sessions WHERE token = '<TOKEN>' OR user_id = '<USER_ID>';`
       （固定トークンが別ユーザーに紐づくケースも掃除）
    2. `DELETE FROM users WHERE id = '<USER_ID>' OR email = '<EMAIL>' OR username = '<USERNAME>';`
       （FK cascade で残存 sessions も除去）
    3. `INSERT INTO users (...) VALUES (...);`（email_verified=1, banned=0, role='admin',
       deleted_at=NULL）
    4. `INSERT INTO sessions (...) VALUES (...);`
  - SQL を一時ファイルに書き出し、`pnpm db:execute:local <tmpfile>` を
    `execFileSync` で実行（既存の正規コマンドを再利用 = DB 名・--local の重複定義を避ける）。
    実行後に一時ファイルを削除。
  - 実行後、標準出力に「投入したトークン」「cookie 注入コマンド例（agent-browser）」
    「直接アクセスする URL」を表示。
- **理由:** 要件 #3（トークンと使い方を stdout 表示）と冪等性をコードで保証するため、
  静的 SQL 単体ではなく Node ラッパーにする（ADR-001 参照）。

### 2. package.json にスクリプト追加

- **対象ファイル:** `package.json`
- **変更内容:** `scripts` に `"seed:dev-admin": "node scripts/seed-dev-admin.mjs"` を追加
  （`db:execute:local` の近くに配置）。
- **理由:** 要件 #4。

### 3. docs/test.md に手順追記

- **対象ファイル:** `docs/test.md`
- **変更内容:** 「Manual / browser verification」セクションに、認証必須ルート
  （特に `/admin`）を検証する手順として `pnpm seed:dev-admin` を案内する数行を追記。
  既存の「signup → email_verified UPDATE」手順との関係（こちらは admin を即用意できる
  ショートカット）を一言添える。cookie 注入コマンド例も記載。
- **理由:** 要件 #5・受け入れ基準「暗黙知なしで再現できる」。

## 設計判断

- **静的 SQL ではなく Node スクリプトで実装**（ADR-001）。要件 #3 のトークン/使い方の
  stdout 表示と冪等ロジックをコードで一元管理し、`db:execute:local` を再利用する。

## リスクと注意点

- **email 衝突による cascade 削除**: もし開発者が `dev-admin@example.com` で実際に
  signup していた場合、冪等 DELETE がそのユーザーと関連データ（cascade）を消す。
  予約済み example アドレスなので実害は小さいが、docs に「この email は seed 専用」と明記。
- **wrangler 未ログイン/未マイグレーション**: `--local` なので wrangler ログインは不要。
  ただし先に `pnpm db:migrate`（= migrations apply --local）でテーブルが存在している必要が
  ある。スクリプト/docs にその前提を明記。
- **`pnpm dev`（vite dev）と `pnpm start`（wrangler dev）の D1 共有**: どちらも
  `.wrangler/state` のローカル D1 を使い `db:execute:local` の書き込み先と同一
  （docs/test.md 既述）。seed → `pnpm dev` で反映される。
- **node 実行と pnpm の連携**: スクリプトは `pnpm db:execute:local` を子プロセスで呼ぶ。
  `pnpm` が PATH にある前提（リポジトリの全スクリプトが pnpm 前提なので妥当）。

## テスト方針

- 自動テスト対象外（dev 専用ツーリング、CI で D1 を起動しないため）。
- ブラウザ検証（manual-test）: クリーンなローカル D1 に対し `pnpm seed:dev-admin` →
  トークンを cookie 注入 → `/admin` にアクセスし管理ダッシュボードが表示されることを確認。
- 冪等性: 2 回連続実行してエラー・重複が出ないことを確認。
