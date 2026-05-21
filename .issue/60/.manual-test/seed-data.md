# Seed Data — Issue #60 動作確認用

**作成日:** 2026-05-21
**ブランチ:** `issue/60/instance-settings-rehydrate-fix`
**マイグレーション:** `0000_initial.sql` ～ `0009_drop_legacy_instance_settings.sql` まで適用済み

---

## 実行したコマンド

クリーンなローカル D1 を構築する手順:

```bash
# 1. wrangler のローカル状態を完全削除
rm -rf .wrangler/state

# 2. 全マイグレーションを適用（0009_drop_legacy_instance_settings.sql 含む）
pnpm db:apply:local

# 3. ベース seed 投入（admin ユーザー含む)
pnpm db:execute:local .manual-test/2026-05-17/seed.sql
```

ベース seed は **`instance_settings` 行を投入しない**ため、適用後の `instance_settings` テーブルは空 (`count = 0`) のままになる。これは Issue #60 の動作確認で重要な前提となる（汚染行 / 正規行は各テストケースで個別に投入する）。

---

## 適用結果

### マイグレーション

全 10 マイグレーションが `✅` で適用された。`0009_drop_legacy_instance_settings.sql` も成功。

### users テーブル（合計 12 件）

```bash
pnpm exec wrangler d1 execute tanstack-start-template-d1 --local --command "SELECT id, email, role, email_verified, banned, deleted_at FROM users WHERE email = 'admin@example.com';"
```

```json
[
  {
    "id": "01938f00-0000-7000-8000-0000000000c1",
    "email": "admin@example.com",
    "role": "admin",
    "email_verified": 1,
    "banned": 0,
    "deleted_at": null
  }
]
```

その他、`member@example.com` / `editor@example.com` / `viewer@example.com` などのロール別ユーザーと、`tc-email-a/b@example.com` 等のテストケース向けユーザーを含む計 12 件。

### instance_settings テーブル

```bash
pnpm exec wrangler d1 execute tanstack-start-template-d1 --local --command "SELECT COUNT(*) AS cnt FROM instance_settings;"
```

```json
[ { "cnt": 0 } ]
```

**空。** ベース seed には `instance_settings` 行が含まれないため、`/admin/llm` 等の挙動は「未保存状態のフォールバック」フローに従う（Issue #60 の修正対象であるリハイドレート経路は、汚染行を別途投入してから確認する）。

---

## テスト用アカウント

| Role  | Email                  | Password       | 用途                              |
| ----- | ---------------------- | -------------- | --------------------------------- |
| admin | `admin@example.com`    | `Password123!` | `/admin/*` 全般、本Issueの主対象 |

その他ロール (member / editor / viewer 等) も同パスワード `Password123!` で利用可能（base seed 由来）。

---

## 再投入（reseed）について

ベース seed は副作用なしに何度でも再投入可能 (`INSERT OR REPLACE` および `DELETE` を含む)。Issue #60 の `reseed.sh` (`.issue/60/reseed.sh`) でも下記と同等の手順を踏める想定:

```bash
rm -rf .wrangler/state
pnpm db:apply:local
pnpm db:execute:local .manual-test/2026-05-17/seed.sql
```

ベース seed の中身は legacy shape (`limits_json` / `design_tokens_json` の旧形式 `instance_settings`) を**含まない**ことを確認済みのため、再投入で汚染が混入する心配はない。Issue #60 のテストケース 1〜3 における「汚染行投入」は `.issue/60/testing.md` の手順（手動 INSERT または `.issue/{1,8,29,30}/.../seed.sql`）に従う。

---

## 次のステップ

`.issue/60/testing.md` の確認項目 1〜N を順に実行する。各テスト開始時に、必要に応じて上記 reseed 手順でクリーンな状態に戻すこと。
