# Issue #50 — manual-test 用シードデータ

Issue #50（search index の CJK FTS トークナイズ対応: `unicode61` → `trigram`）の
ブラウザ動作確認用に、ローカル D1 を初期化・migration 適用・seed 投入した記録。

---

## ソース

Issue #29 (`.issue/29/.manual-test/seed.sql`) のシードを **そのまま流用** している。
本 Issue は FTS トークナイザ切替の検証が主眼で、ノート/タグ/visibility 分布は Issue #29 と
同等で十分なため、新規 seed を作成していない。

`.issue/29/.manual-test/seed.sql`（22.1K）を `pnpm exec wrangler d1 execute ... --file` で
そのまま流し込んでいる。

---

## テストアカウント

| 項目        | 値                              |
|-------------|---------------------------------|
| email       | `test-user-001@example.com`     |
| password    | `TestPassword123!`              |
| user_id     | `00000000-0000-0000-0000-000000000001` |

---

## セットアップ手順（実行ログ）

### 1. 既存ローカル D1 を削除

```bash
rm -r /Users/hikaru/github.com/tuanemuy/hollow2/.wrangler/state/v3/d1
```

→ `miniflare-D1DatabaseObject/` を含む既存状態を削除して、クリーンな state から開始。

### 2. migration 適用

```bash
cd /Users/hikaru/github.com/tuanemuy/hollow2 && pnpm db:apply:local
```

適用結果（全 9 件 OK）:

| 順 | migration                                | 結果 |
|----|------------------------------------------|------|
| 1  | `0000_initial.sql`                       | ✅    |
| 2  | `0001_hollow_schema.sql`                 | ✅    |
| 3  | `0002_publication_occ.sql`               | ✅    |
| 4  | `0003_ingestion_occ.sql`                 | ✅    |
| 5  | `0004_export_job_occ.sql`                | ✅    |
| 6  | `0005_drop_todos.sql`                    | ✅    |
| 7  | `0006_admin_job_listing_indexes.sql`     | ✅    |
| 8  | `0007_notes_slug_partial_unique.sql`     | ✅    |
| 9  | `0008_search_documents_fts_trigram.sql`  | ✅    |

### 3. seed 投入

```bash
cd /Users/hikaru/github.com/tuanemuy/hollow2 && \
  pnpm exec wrangler d1 execute tanstack-start-template-d1 --local \
    --file .issue/29/.manual-test/seed.sql
```

→ 全ステートメント `success: true`。

---

## 検証クエリと結果

### A. トークナイザ確認

```bash
pnpm exec wrangler d1 execute tanstack-start-template-d1 --local \
  --command "SELECT sql FROM sqlite_master WHERE name='search_documents_fts'"
```

結果:

```sql
CREATE VIRTUAL TABLE `search_documents_fts` USING fts5(
        `title`,
        `body_plain`,
        `tag_names_json`,
        content='search_documents',
        content_rowid='rowid',
        tokenize='trigram'
)
```

→ **`tokenize='trigram'` を確認**（旧 `unicode61` から正しく切り替わっている）。

### B. CJK 検索（`デザイン`）

```bash
pnpm exec wrangler d1 execute tanstack-start-template-d1 --local \
  --command "SELECT COUNT(*) AS hits FROM search_documents_fts WHERE search_documents_fts MATCH 'デザイン'"
```

結果: `hits = 2`（unicode61 時代は 0 件）

内訳:

| rowid | title                       |
|-------|-----------------------------|
| 4     | `Project A デザインメモ`     |
| 9     | `公開デザインガイド`         |

→ **想定通りの 2 件ヒット**。FTS5 trigram トークナイザによる CJK 検索が機能している。

### C. ASCII リグレッション確認（`design`）

```bash
pnpm exec wrangler d1 execute tanstack-start-template-d1 --local \
  --command "SELECT COUNT(*) AS hits FROM search_documents_fts WHERE search_documents_fts MATCH 'design'"
```

結果: `hits = 3`

→ ASCII 検索もヒットあり。trigram への切替でリグレッションなし。

### D. 件数サマリ

```bash
pnpm exec wrangler d1 execute tanstack-start-template-d1 --local \
  --command "SELECT 'users' AS t, COUNT(*) FROM users UNION ALL SELECT 'notes', COUNT(*) FROM notes UNION ALL SELECT 'search_documents', COUNT(*) FROM search_documents"
```

| table              | count |
|--------------------|-------|
| `users`            | 1     |
| `notes`            | 10    |
| `search_documents` | 10    |
| `directories`      | 6     |

→ 期待値（1 user / 6 directories / 10 notes / 10 search_documents）と一致。

---

## まとめ

- ローカル D1 をクリーンアップ → migration 9 件適用 → seed 投入 まで一連の手順を完了。
- `search_documents_fts` のトークナイザは **`trigram`**（Issue #50 の修正どおり）。
- CJK クエリ `デザイン` が **2 件ヒット**（unicode61 時代は 0 件のリグレッション解消を確認）。
- ASCII クエリ `design` は **3 件ヒット**（リグレッションなし）。
- データ件数（users/notes/search_documents/directories）も期待通り。

ブラウザ動作確認に進める状態。
