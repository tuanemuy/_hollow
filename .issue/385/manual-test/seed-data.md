# Issue #385 manual-test seed data

**Issue:** #385（ノート詳細: 存在しない noteId で notFoundComponent ではなく汎用エラー境界が表示される）
**Test source:** `.issue/385/testing.md`
**Date:** 2026-06-02
**DB:** Cloudflare D1 ローカル (`hollow-local-d1` / `.wrangler/state/v3/d1/...`)

---

## サマリー

本 Issue の検証はログイン後に noteId の URL を直叩きするだけで、新規シード投入は不要だった。ローカル D1 に baseline seed（`.manual-test/2026-05-17/seed.sql`）由来の検証済みユーザーと既存ノートがそのまま残っているため、これを再利用する。

- マイグレーション: `pnpm db:apply:local` → "No migrations to apply!"（適用済み）

## 使用するアカウント

| label | email | password | role | email_verified | user.id |
|---|---|---|---|---|---|
| existing-user | `existing@example.com` | `Password123!` | member | 1 | `01938f00-0000-7000-8000-0000000000a1` |

ログインフォームは password 欄で Enter 送信する（同一オリジン送信。`docs/test.md` 参照）。

## 使用する既存データ

| 用途 | 値 |
|---|---|
| 正常系（実在ノート） | noteId `019e6e0f-c7f2-7415-8d86-5c57f0650aa2`（title: "Issue-233 テストノートXYZ", status: active, owner: existing-user） |
| 異常系（非存在 / UUID 形式） | `00000000-0000-0000-0000-000000000000` |
| 異常系（不正な形式） | `not-a-real-id` |

## 注意

- 本番データを破壊しないようローカル D1 にのみ参照アクセスする（本検証は SELECT のみ、INSERT/UPDATE なし）。
