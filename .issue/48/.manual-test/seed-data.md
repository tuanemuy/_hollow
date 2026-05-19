# シードデータ — Issue #48 マニュアルテスト

**作成日:** 2026-05-20
**対象 dev server:** http://localhost:3000/
**DB:** ローカル D1 (`tanstack-start-template-d1`)
**全パスワード共通:** `Password123!`

---

## 投入方針

`pnpm seed` のような seed script はリポジトリに存在しない。
Issue #42 と同様に **`wrangler d1 execute --local --file` で直接 SQL INSERT** している。

- ID はすべて UUID v7 (`IdGenerator.validate` 通過のため必須)
- パスワードハッシュは `D1CredentialStore.hashPassword` と同じ
  PBKDF2-SHA256 / 600,000 iter / 16B salt / 32B key を Node `crypto.pbkdf2Sync` で再現
- `users.email_verified = 1` 直挿しで email-verification を skip
- 既存ユーザー（`testuser`, `tc-*`, `mt42-*` 等）は触っていない。`mt48-` プレフィックス分離

生成スクリプト: [`./seed.cjs`](./seed.cjs)
発行 SQL: [`./seed.sql`](./seed.sql)

再生成:

```bash
NODE_PATH=/Users/hikaru/github.com/tuanemuy/hollow2/node_modules \
  node .issue/48/.manual-test/seed.cjs > .issue/48/.manual-test/seed.sql

pnpm exec wrangler d1 execute tanstack-start-template-d1 --local \
  --file=.issue/48/.manual-test/seed.sql
```

> 注意: `seed.cjs` を再実行すると UUID v7 の timestamp 部が変わるため、
> 既存 `seed.sql` の ID と一致しなくなる。**現在の DB に投入済みなのは
> このドキュメントに記録された ID** であり、ID 値そのものを参照するテストで
> 再生成する場合はこのドキュメントも更新すること。

---

## 投入ユーザー

| 項目 | 値 |
|---|---|
| email | `mt48-eve@example.com` |
| password | `Password123!` |
| username | `mt48-eve` |
| displayName | `mt48-eve` |
| user.id | `019e4148-21de-7357-a1dc-57a758b777b5` |
| role | `member` |
| status | active (`email_verified=1`, `banned=0`, `deleted_at=NULL`) |

ログイン手順:
1. ブラウザで `http://localhost:3000/login` を開く
2. email / password を入力して送信
3. リダイレクトされれば成功

---

## ディレクトリ構成

| name | id | depth |
|---|---|---|
| (root) | `019e4148-21df-71fc-9636-8794f85a28eb` | 0 |
| Inbox  | `019e4148-21df-71fc-9636-899e8131566f` | 1 |

全 12 ノートは Inbox 配下に配置。`directory_path = "Inbox"`。

---

## 投入ノート一覧（12 件 / 全件キーワード `uniquekw` を含む）

| # | id (末尾 12) | title | slug | visibility | updatedAt (UTC) |
|---|---|---|---|---|---|
| N1 | …8ee38606377c | [private] uniquekw note 1 (2026-05-20) | mt48-1-private | **private** | 2026-05-20T09:00:00Z |
| N2 | …90a279730c19 | [public] uniquekw note 2 (2026-05-19) | mt48-2-public | **public** | 2026-05-19T10:00:00Z |
| N3 | …95860d21a621 | [unlisted] uniquekw note 3 (2026-05-18) | mt48-3-unlisted | **unlisted** | 2026-05-18T11:00:00Z |
| N4 | …9bc911402b5a | [private] uniquekw note 4 (2026-05-15) | mt48-4-private | private | 2026-05-15T08:00:00Z |
| N5 | …9cc2d6d89f90 | [public] uniquekw note 5 (2026-05-13) | mt48-5-public | public | 2026-05-13T14:00:00Z |
| N6 | …a29a80911b82 | [unlisted] uniquekw note 6 (2026-05-10) | mt48-6-unlisted | unlisted | 2026-05-10T16:30:00Z |
| N7 | …a6dd3fa7e7b0 | [private] uniquekw note 7 (2026-05-05) | mt48-7-private | private | 2026-05-05T07:15:00Z |
| N8 | …aa26145d109a | [public] uniquekw note 8 (2026-04-28) | mt48-8-public | public | 2026-04-28T12:00:00Z |
| N9 | …ac49273f55aa | [unlisted] uniquekw note 9 (2026-04-20) | mt48-9-unlisted | unlisted | 2026-04-20T18:00:00Z |
| N10 | …b2a59d1efb70 | [private] uniquekw note 10 (2026-04-10) | mt48-10-private | private | 2026-04-10T09:30:00Z |
| N11 | …b49488dca5f5 | [public] uniquekw note 11 (2026-03-15) | mt48-11-public | public | 2026-03-15T11:00:00Z |
| N12 | …b95f5a679a3c | [private] uniquekw note 12 (2026-02-20) | mt48-12-private | private | 2026-02-20T15:45:00Z |

各ノートは 12 個の**異なる日付**で `updatedAt` を持つため、項目 (1) 実 `updatedAt`
表示と項目 (3) カレンダー表示の日付グルーピング検証に十分な日付ばらつきがある。
本文には `uniquekw` を `i` 回繰り返して挿入してあり、FTS5 BM25 score が
ノートごとに差を持つ（項目 E3 ページングの順序保持確認に使用可）。

完全な ID 一覧（フル UUID）は `seed.sql` 末尾のコメントブロックを参照。

### visibility 分布

| visibility | 件数 |
|---|---|
| private | 5 (N1, N4, N7, N10, N12) |
| public | 4 (N2, N5, N8, N11) |
| unlisted | 3 (N3, N6, N9) |

`publication_states` / `search_documents` ともに同一分布。

### FTS インデックス確認

```bash
pnpm exec wrangler d1 execute tanstack-start-template-d1 --local \
  --command "SELECT COUNT(*) AS hits FROM search_documents_fts WHERE search_documents_fts MATCH 'uniquekw';"
# -> hits: 12
```

---

## Issue #48 testing.md 検証用 URL

ベース: `http://localhost:3000`

| # | URL | 期待結果 |
|---|---|---|
| 1 | `/?q=uniquekw` | リスト表示 / 各行に実 `updatedAt` (2026 年の日付) / `1970` が現れない |
| 2 | `/?q=uniquekw` | 各行に visibility chip（5 private / 4 public / 3 unlisted） |
| 3 | `/?q=uniquekw&display=calendar` | 12 日付でグルーピング表示 / フォールバック文言が出ない |
| 4 | `/?q=uniquekw&display=tile` | タイル表示でも chip が出る |
| 5 | `/?q=uniquekw` → タイトル click | `/notes/<noteId>` の detail に遷移、404 にならない |
| 6 | `/` (クエリなし) | filter 経路 = 既存挙動を維持 |
| E1 | `/?q=nonexistentterm` | 空状態 UI |
| E3 | `/?q=uniquekw&limit=5` を 2 回ロード | 順序が安定 |

---

## 既存検証クエリ

```bash
# 12 ノート全件と visibility / updatedAt の確認
pnpm exec wrangler d1 execute tanstack-start-template-d1 --local --command \
  "SELECT n.slug, ps.visibility, n.updated_at FROM notes n
   JOIN publication_states ps ON ps.note_id=n.id
   WHERE n.owner_id = '019e4148-21de-7357-a1dc-57a758b777b5'
   ORDER BY n.updated_at DESC;"

# visibility 分布
pnpm exec wrangler d1 execute tanstack-start-template-d1 --local --command \
  "SELECT visibility, COUNT(*) FROM publication_states
   WHERE owner_id = '019e4148-21de-7357-a1dc-57a758b777b5' GROUP BY visibility;"

# FTS ヒット数
pnpm exec wrangler d1 execute tanstack-start-template-d1 --local --command \
  "SELECT COUNT(*) FROM search_documents_fts WHERE search_documents_fts MATCH 'uniquekw';"
```

---

## 詰まった点 / 注意事項

1. **UUID v7 必須**
   Issue #29 / #8 の旧 seed は `01938f00-...` という **UUID 風だが v0** の ID を使っており、
   `IdGenerator.validate` は v7 専用 (`UUID_V7_PATTERN = /^...-7[0-9a-f]{3}-[89ab]...$/`) なので
   現行コードでは `SystemError(DATA_INTEGRITY_ERROR)` でログイン or rehydration に失敗する。
   Issue #42 と同様に **本物の UUID v7 を `uuid` パッケージで生成** している。

2. **ID 再生成のたびに値が変わる**
   UUID v7 の先頭 48bit は timestamp。`seed.cjs` を再実行すると ID 全体が変わるため、
   現行 ID は `seed.sql` の末尾コメントブロックと本 md の表が SSOT。

3. **既存データ非干渉**
   `mt48-` プレフィックスで分離。削除は
   `DELETE FROM users WHERE username='mt48-eve';` で CASCADE。

4. **email verification skip**
   `users.email_verified = 1` を直書き。`logIn` usecase は `User.status` 判定で
   `email_verified=1` の場合 active 扱いとなり、ログインが通る。

5. **score 差は本文中の `uniquekw` 繰り返し回数**
   N1 から N12 にかけて 1 回 → 12 回と本文中の繰り返しを増やしてある。
   BM25 で score 順を作れるため E3 pagination 順序保持テストに使える。

---

## 次フェーズへの引き継ぎ

- dev server は `http://localhost:3000/` で稼働中（詳細は [server-info.md](./server-info.md)）
- ログインは `mt48-eve@example.com` / `Password123!`
- 検証 URL リストは上記表
- スクリーンショット保存先: `.issue/48/.manual-test/screenshots/`
- 結果レポート: `.issue/48/.manual-test/results/`
