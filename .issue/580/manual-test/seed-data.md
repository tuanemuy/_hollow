# Issue #580 ブラウザ検証用シードデータ

タグ統合の非同期化＋進捗バナー（P18 / `/app/tags`）のブラウザ検証用シード。
ローカル D1（`hollow-local-d1` / `.wrangler/state/v3/d1`、`pnpm dev` と同一）に投入済み。

投入日: 2026-06-26

## 1. 認証ユーザー（dev-admin）

`pnpm seed:dev-admin` で投入（冪等。再実行可）。

| 項目 | 値 |
|---|---|
| email | `dev-admin@example.com` |
| username | `dev-admin` |
| role | `admin`（active / email_verified=1） |
| **user id (owner_id)** | `01950000-0000-7000-8000-000000000001` |
| session id | `01950000-0000-7000-8000-000000000002` |
| **session token（`__Host-session` の値）** | `dev-admin-session-token` |

ブラウザ cookie 注入（`__Host-session` は Secure 必須のため CDP 経由）:

```bash
agent-browser cookies set "__Host-session" "dev-admin-session-token" \
  --url http://localhost:3000 --path / --secure --sameSite Lax
```

注意: dev-admin は `role=admin` だが、本Issueの検証対象はユーザー領域 `/app/tags`。
admin ユーザーでもユーザー領域は利用可能。

## 2. タグ + ノート

`/tmp/seed-580.sql` を `pnpm db:execute:local /tmp/seed-580.sql` で投入（INSERT OR IGNORE で冪等。INSERT のみ・既存行は不変更）。

### タグ（owner = dev-admin）

| 役割 | tag id | name | name_normalized |
|---|---|---|---|
| **source（統合元）** | `01950580-0000-7000-8000-00000000a001` | `source-tag-ab` | `source-tag-ab` |
| **target（統合先）** | `01950580-0000-7000-8000-00000000a002` | `target-tag-cd` | `target-tag-cd` |

`name_normalized` = NFKC 正規化後 `toLowerCase()`（`tagRepository.ts` の `normalizeName`）。ASCII 名はそのまま。

### ノート（owner = dev-admin、directory = dev-admin ルート `019e9546-cb23-73c9-849c-120384e56377`）

| note id 末尾 | slug | 付与タグ |
|---|---|---|
| `...b001`〜`...b005` | `issue-580-source-note-01`〜`05` | source のみ |
| `...b006` | `issue-580-source-note-06-dup` | **source + target 両方**（統合時の重複付与 no-op を検証） |
| `...c001`, `...c002` | `issue-580-target-note-01`, `02` | target のみ（統合先にもともとあるノート） |

### 件数（検証済み）

| 指標 | 値 |
|---|---|
| source タグを持つノート（= 進捗バーの total） | **6** |
| target タグを持つノート | 3（専用2 + 共有 b006） |
| 投入ノート総数（`id LIKE '01950580-%'`） | 8 |

source=6 なので進捗バーの分母 total > 1 を満たす。
（中間進捗の幅変化を観測したい場合は inline dev のバッチサイズ 500 を意識し、ノート件数を大幅に増やす必要がある。少件数では pending→completed に飛ぶ場合がある — testing.md 確認項目2の注意参照。）

統合後の期待: source タグ消滅、b001〜b006 が target へ付け替え、b006 は既に target を持つため no-op で重複しない。

## 使用テーブル / カラム（後続テスト・確認 SQL 用）

- `tags(id, owner_id, name, name_normalized, version, created_at, updated_at)` — unique: `(owner_id, name_normalized)`
- `notes(id, owner_id, directory_id, slug, title, content_html, front_matter_json, status, trashed_at, created_at, updated_at, version, ...)` — `directory_id` NOT NULL（FK restrict）, partial unique `(owner_id, slug) WHERE status='active'`
- `note_tags(note_id, tag_id)` — PK `(note_id, tag_id)`、FK は両方 cascade
- `tag_merge_jobs(id, owner_id, source_tag_id, target_tag_id, status, progress_processed, progress_total, affected_note_ids_json, error_code, error_reason, version, created_at, updated_at, completed_at)` — 統合ジョブ（検証中に生成される）。status は `pending|processing|completed|failed`

id 形式は UUIDv7（`^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`）。
本シードは `01950580-...`（580 = Issue 番号）プレフィックスで識別可能にしてある。

## 確認 SQL 例

```sql
-- source タグを持つノート件数（= 進捗 total）
SELECT COUNT(*) FROM note_tags WHERE tag_id='01950580-0000-7000-8000-00000000a001';
-- 統合ジョブの進捗
SELECT id, owner_id, status, progress_processed, progress_total, error_reason FROM tag_merge_jobs ORDER BY created_at DESC;
-- 統合後: source タグが消えたか
SELECT * FROM tags WHERE id='01950580-0000-7000-8000-00000000a001';
-- 統合後: target タグを持つノート（付け替え確認）
SELECT note_id FROM note_tags WHERE tag_id='01950580-0000-7000-8000-00000000a002';
```
