# Manual-test baseline seed (2026-05-17)

`spec/manual-tests/` のテスト群が共通利用するアカウントをローカル D1
（`.wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite`）に投入する。

## 投入元

- SQL: `.manual-test/2026-05-17/seed.sql`（12 アカウント）
- ハッシュ生成スクリプト: `.manual-test/2026-05-17/hashPassword.mjs`
- 一括再投入スクリプト: `.manual-test/2026-05-17/reseed.sh`（DELETE → seed.sql）

### 初回投入

```bash
pnpm wrangler d1 execute hollow-local-d1 --local --file .manual-test/2026-05-17/seed.sql
```

### 再投入（D4 プロトコル）

```bash
./.manual-test/2026-05-17/reseed.sh           # --local（デフォルト）
./.manual-test/2026-05-17/reseed.sh --remote  # --remote
```

破壊的 TC（改名・削除・メアド変更・パスワード変更）を含むカテゴリの実行後は
必ずこのスクリプトを回して初期状態へ戻すこと（D4: per-category reseed protocol）。

## アカウント構成（12 件）

### ベースライン — どの TC でも変更しない

ログインと衝突対象としてのみ使用する。改名・削除・メアド変更などの破壊的
操作を行ってはならない。

| label | username | email | password | role | user.id |
|---|---|---|---|---|---|
| existing-user | `existing-user` | `existing@example.com` | `Password123!` | `member` | `01938f00-0000-7000-8000-0000000000a1` |
| mailowner | `mailowner` | `existing-new@example.com` | `Password123!` | `member` | `01938f00-0000-7000-8000-0000000000b1` |
| admin-user | `admin-user` | `admin@example.com` | `Password123!` | `admin` | `01938f00-0000-7000-8000-0000000000c1` |

### スローアウェイ — 各 1 TC で使い切る

破壊的 TC ごとに専用に用意。複数 TC で共有しないこと（順序依存になるため）。

| label | username | email | 用途 |
|---|---|---|---|
| tc-rename-a | `tc-rename-a` | `tc-rename-a@example.com` | TC-A4-02 で `tc-rename-a-renamed` に改名 |
| tc-rename-b | `tc-rename-b` | `tc-rename-b@example.com` | TC-A4-03（衝突）でログイン。改名先 `existing-user` は変更されない |
| tc-rename-c | `tc-rename-c` | `tc-rename-c@example.com` | TC-A4-05（レート制限）で 2 回改名 |
| tc-delete-a | `tc-delete-a` | `tc-delete-a@example.com` | TC-A5-01 で削除 |
| tc-email-a | `tc-email-a` | `tc-email-a@example.com` | TC-A6-01 で `tc-email-a-new@example.com` に変更 |
| tc-email-b | `tc-email-b` | `tc-email-b@example.com` | TC-A6-04（レート制限）で複数回メアド変更 |
| tc-password-a | `tc-password-a` | `tc-password-a@example.com` | TC-A3-01 でパスワード変更 |

全アカウントの password は `Password123!`、role は `member`、`email_verified=1` /
`banned=0`。各オーナーに root directory（`parent_id IS NULL`）を 1 件付与。

### 事前状態アカウント

シードの時点で非アクティブ状態を持つ。

| label | username | email | 状態 | 用途 |
|---|---|---|---|---|
| tc-unverified | `tc-unverified` | `tc-unverified@example.com` | `email_verified=0` | TC-A2-03 |
| tc-suspended | `tc-suspended` | `tc-suspended@example.com` | `banned=1` | TC-A2-04 |

## パスワードハッシュ方式

`app/core/adapters/d1/repositories/credentialStore.ts` 準拠。

- アルゴリズム: PBKDF2-HMAC-SHA256（Web Crypto SubtleCrypto）
- イテレーション: 600,000
- ソルト: 16 byte（ランダム生成）
- 派生鍵長: 32 byte
- エンコード形式: `pbkdf2-sha256-v1$<iter>$<salt-b64>$<hash-b64>`

ハッシュは `hashPassword.mjs` を実行するたびにソルトが変わって新規生成される。
seed.sql 内に焼き付け済みの値は 2026-05-17 に生成したもの。

## ID 割り当て規約

- ベースライン: `01938f00-0000-7000-8000-0000000000{a|b|c}{1|2|3}`
  - 末尾 `a/b/c` がアカウント区分、`1/2/3` が user/account/directory
- スローアウェイ + 事前状態: `01938f01-0000-7000-8000-000000000{1..9}{1|2|3}`
  - 末尾 1桁目（1〜9）がアカウント番号、2桁目（1/2/3）が user/account/directory

reseed.sh はこの ID 一覧をハードコードして DELETE → INSERT する。新規アカウント
を追加する場合は seed.sql / reseed.sh / 本ドキュメントを同時更新すること。

## 既知の前提

- マイグレーション `0000_initial.sql` 〜 `0004_export_job_occ.sql` 適用済み
- `instance_settings` は未投入。サインアップフローで `registration_open` を見るが、
  本シードはサインアップを使わず INSERT で済ませているため不要。サインアップ系
  TC（account.md A1 系等）を実行する直前に必要に応じてテスト側で投入する
- 各 TC 固有のノート・タグ・メディア・追加ディレクトリはここでは投入しない。TC 内で作成すること
- 再実行安全性: 全 INSERT は `INSERT OR IGNORE`。reseed.sh は ID 一覧で DELETE してから INSERT するため、破壊的 TC 実行後でも初期状態へ戻せる

## D4: per-category reseed protocol

カテゴリ単位の独立性を担保するため、以下のフローで実行する:

```text
[A 開始] → reseed.sh → A 全 TC → reseed.sh
[B 開始] → reseed.sh → B 全 TC → reseed.sh
...
```

カテゴリ内の TC は D2（スローアウェイアカウント）によって相互独立なので、
TC 単位での reseed は不要。カテゴリ間は破壊的 TC の影響範囲が不明なので、
必ず reseed.sh を回す。
