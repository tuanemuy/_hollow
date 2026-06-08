# シードデータ概要 — Issue #568（P30 / P31 / P32 検証用）

ローカル D1（`hollow-local-d1 --local`）に投入したブラウザテスト用シードの記録。

## 投入手順

```
pnpm db:migrate          # スキーマ適用（既適用なら no-op）
pnpm seed:dev-admin      # dev 管理ユーザー（土台。今回の検証では未使用でも可）
pnpm db:execute:local /tmp/seed-568.sql   # 本シード（冪等・INSERT OR IGNORE）
```

`/tmp/seed-568.sql` は全 id を `01968000-...` 名前空間の固定 UUIDv7 リテラルにし、
すべて `INSERT OR IGNORE` で投入。既存データは一切 DELETE / 上書きしない。再実行しても重複しない。

## テストアカウント

| 項目 | 値 |
|------|-----|
| username | `seeduser` |
| user id | `01968000-0000-7000-8000-000000000001` |
| email | `seeduser@example.com` |
| status | active（email_verified=1 / banned=0 / deleted_at=NULL） |
| role | member |

公開トップ URL: `/u/seeduser`

> 管理画面が要る場合は `pnpm seed:dev-admin`（username `dev-admin`, token `dev-admin-session-token`）を併用。

## 投入レコード（seeduser 分）

| テーブル | 件数 | 備考 |
|----------|------|------|
| users | 1 | seeduser |
| directories | 1 | ルート（depth=0, name/slug 空） |
| tags | 5 | travel / cooking / tech / reading / common |
| notes | 8 | 公開 7 + 非公開 1 |
| note_tags | 11 | common は複数ノートに付与（chip / suggest 用） |
| publication_states | 8 | public 7 + private 1（C） |
| note_internal_links | 2 | B への参照（A 公開 + C 非公開） |
| search_documents | 7 | 公開ノートのみ（FTS は trigger で自動同期） |

## 公開ノート一覧

| ノート | id 末尾 | slug | タグ | published_at | 期間ファセット位置（基準 2026-06-09） |
|--------|---------|------|------|--------------|----------------------------------------|
| A（公開参照元） | `...0010` | seed-note-a | common, tech | 2026-06-05 | 過去 7 日内 |
| B（被参照） | `...0011` | seed-note-b | common, reading | 2025-09-01 | 過去 1 年内 |
| 旅行 | `...0012` | seed-note-travel | travel, common | 2026-05-20 | 過去 30 日内 |
| 料理 | `...0013` | seed-note-cooking | cooking | 2026-02-01 | 過去 1 年内 |
| 技術 | `...0014` | seed-note-tech | tech | 2025-09-15 | 過去 1 年内 |
| 読書 | `...0015` | seed-note-reading | reading | 2024-06-01 | 1 年より前（all のみ） |
| 雑記 | `...0016` | seed-note-misc | tech, reading | 2026-06-01 | 過去 30 日内 |

非公開ノート C: `...0020`（slug `seed-note-c-private`, visibility=private）。

完全な id 例:
- B = `01968000-0000-7000-8000-000000000011`
- A = `01968000-0000-7000-8000-000000000010`
- C（非公開）= `01968000-0000-7000-8000-000000000020`

## 公開ノート間リンク構造（P31 バックリンク）

`note_internal_links`（ref_kind=`id`, resolved_note_id でバックリンク解決）:

- A（公開, `...0010`） → B（`...0011`） … 公開参照元 → バックリンクに**表示される**
- C（非公開, `...0020`） → B（`...0011`） … 非公開参照元 → バックリンクから**除外される**

B のバックリンクセクションには A のみが並ぶことを確認する（`listPublicBacklinks` の
public 参照元フィルタ）。リンク本文は `<a data-note-id="...0011">` 形式で埋め込み済み。

## 検証 URL

P30 公開トップ:
- `/u/seeduser` … chip（5 タグ）/ segmented（list / tile / calendar）/ sort
- 空状態確認は公開ノート 0 件の既存ユーザー（例 `/u/admin-user`）で

P31 公開ノート詳細:
- `/notes/public/01968000-0000-7000-8000-000000000011` … B。バックリンク（A のみ）+ 関連ノート（同著者の他公開ノート最大 4 枚、B 除外）
- `/notes/public/01968000-0000-7000-8000-000000000010` … A。関連ノートに B 等が並ぶ
- 非公開ゲート確認: `/notes/public/01968000-0000-7000-8000-000000000020` → NotFound 期待

P32 公開検索:
- `/search?q=テストキーワード` … 5 件ヒット（A / B / 旅行 / 料理 / 読書）
- フィルタードロワー: タグ combobox に `com` / `tra` 等、ユーザー combobox に `seed` を入力 → サジェスト
- 期間 radio（7 日 / 30 日 / 1 年 / すべて）+ footer 件数 + active-chip
- サジェスト無し確認: 公開ノートに無いプレフィックス（例 `zzz`）で空 listbox

## 確認済みの整合性（SELECT 検証）

- 公開ノート 7 / 非公開 1
- FTS `MATCH 'テストキーワード'` → 5 ヒット（trigger 同期 OK）
- B への参照リンク 2 件（A=public, C=private）→ 公開参照元フィルタの素材成立
- タグ suggest（公開ノート紐付け・LIKE 'com%'）→ `common` 1 件
