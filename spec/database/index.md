# DB設計

データストア: Cloudflare D1（SQLite 互換）。

UUID v7 はテキスト 26 字（base32 表現）または 36 字（標準 hex with dash）で扱う。本設計では `TEXT` 36 字標準形式で統一。Instant は ISO 8601 UTC 文字列を `TEXT` で保存。

すべてのテーブルに `created_at`, `updated_at` を持たせる（一部 `created_at` のみ）。

## アプリ層補助制約

- `notes.content_html` のサイズ上限（1 MiB）と `notes.front_matter_json` のサイズ上限（64 KiB）は DB 制約では強制せず、ContentHtml / FrontMatter の値オブジェクト構築時に検証する
- `notes` を `tagIds` で AND 検索する用途は `note_tags` join では非効率なため、Search ドメインの `search_documents_fts` 経由で行う
- `media_assets` の物理削除前に `note_media_refs` の対象行が存在しないことを `MediaService.purge` が確認する（FK RESTRICT で誤削除は防止される）
- `outbox_events` は dispatch 済みの行が増え続けるため、定期的にパージするワーカ（pruner）が必要。具体は `app/worker/cloudflare/pruner.ts`

## 命名規則

- テーブル名は複数形 snake_case（例: `users`）
- カラム名は snake_case
- 外部キーは `<対象テーブル単数>_id`
- インデックス命名: `idx_<table>_<columns>`
- 一意インデックス: `uniq_<table>_<columns>`

---

## Identity

### users

| カラム | 型 | 制約 |
|---|---|---|
| id | TEXT | PRIMARY KEY |
| username | TEXT | NOT NULL, UNIQUE |
| email | TEXT | NOT NULL, UNIQUE |
| display_name | TEXT | NULL |
| bio | TEXT | NULL |
| avatar_media_id | TEXT | NULL, REFERENCES media_assets(id) ON DELETE SET NULL |
| password_hash | TEXT | NOT NULL — MVP は Email+Password のみのため必須。将来 Magic Link 等を追加する場合は NULLABLE 化を別 ADR で議論 |
| status | TEXT | NOT NULL, CHECK (status IN ('pending','active','suspended','deleted')) |
| role | TEXT | NOT NULL, CHECK (role IN ('member','admin')) DEFAULT 'member' |
| created_at | TEXT | NOT NULL |
| updated_at | TEXT | NOT NULL |
| last_username_changed_at | TEXT | NULL |

インデックス:
- `uniq_users_username` UNIQUE (username)
- `uniq_users_email` UNIQUE (email)
- `idx_users_status_role` (status, role)

### sessions

| カラム | 型 | 制約 |
|---|---|---|
| id | TEXT | PRIMARY KEY |
| user_id | TEXT | NOT NULL, REFERENCES users(id) ON DELETE CASCADE |
| token_hash | TEXT | NOT NULL, UNIQUE |
| user_agent | TEXT | NULL |
| ip_address | TEXT | NULL |
| created_at | TEXT | NOT NULL |
| expires_at | TEXT | NOT NULL |
| revoked_at | TEXT | NULL |

インデックス:
- `uniq_sessions_token_hash` UNIQUE (token_hash)
- `idx_sessions_user_id` (user_id)
- `idx_sessions_expires_at` (expires_at)

### email_verification_tokens

| カラム | 型 | 制約 |
|---|---|---|
| id | TEXT | PRIMARY KEY |
| user_id | TEXT | NOT NULL, REFERENCES users(id) ON DELETE CASCADE |
| purpose | TEXT | NOT NULL, CHECK (purpose IN ('signup','email_change')) |
| target_email | TEXT | NOT NULL |
| token_hash | TEXT | NOT NULL, UNIQUE |
| created_at | TEXT | NOT NULL |
| expires_at | TEXT | NOT NULL |
| consumed_at | TEXT | NULL |

インデックス:
- `uniq_evt_token_hash` UNIQUE (token_hash)
- `idx_evt_user_id` (user_id)
- `idx_evt_expires_at` (expires_at)

### password_reset_tokens

| カラム | 型 | 制約 |
|---|---|---|
| id | TEXT | PRIMARY KEY |
| user_id | TEXT | NOT NULL, REFERENCES users(id) ON DELETE CASCADE |
| token_hash | TEXT | NOT NULL, UNIQUE |
| created_at | TEXT | NOT NULL |
| expires_at | TEXT | NOT NULL |
| consumed_at | TEXT | NULL |

インデックス:
- `uniq_prt_token_hash` UNIQUE (token_hash)
- `idx_prt_expires_at` (expires_at)

---

## Directory

### directories

| カラム | 型 | 制約 |
|---|---|---|
| id | TEXT | PRIMARY KEY |
| owner_id | TEXT | NOT NULL, REFERENCES users(id) ON DELETE CASCADE |
| parent_id | TEXT | NULL, REFERENCES directories(id) ON DELETE RESTRICT |
| name | TEXT | NOT NULL |
| slug | TEXT | NOT NULL |
| depth | INTEGER | NOT NULL CHECK (depth >= 0 AND depth <= 10) |
| created_at | TEXT | NOT NULL |
| updated_at | TEXT | NOT NULL |

インデックス:
- `uniq_directories_owner_parent_name` UNIQUE (owner_id, parent_id, LOWER(name))
- `idx_directories_owner_parent` (owner_id, parent_id)
- `idx_directories_owner_depth` (owner_id, depth)

ルートは `parent_id IS NULL` で 1 ユーザー 1 行。SQLite の部分 UNIQUE インデックスで強制する:

```sql
CREATE UNIQUE INDEX uniq_directories_owner_root
  ON directories(owner_id) WHERE parent_id IS NULL;
```

---

## Note

### notes

| カラム | 型 | 制約 |
|---|---|---|
| id | TEXT | PRIMARY KEY |
| owner_id | TEXT | NOT NULL, REFERENCES users(id) ON DELETE CASCADE |
| directory_id | TEXT | NOT NULL, REFERENCES directories(id) ON DELETE RESTRICT |
| slug | TEXT | NOT NULL |
| title | TEXT | NOT NULL |
| content_html | TEXT | NOT NULL |
| front_matter_json | TEXT | NOT NULL DEFAULT '{}' |
| status | TEXT | NOT NULL CHECK (status IN ('active','trashed')) DEFAULT 'active' |
| trashed_at | TEXT | NULL |
| created_at | TEXT | NOT NULL |
| updated_at | TEXT | NOT NULL |
| edit_lock_user_id | TEXT | NULL, REFERENCES users(id) ON DELETE SET NULL |
| edit_lock_acquired_at | TEXT | NULL |
| edit_lock_expires_at | TEXT | NULL |

インデックス:
- `uniq_notes_owner_slug` UNIQUE (owner_id, slug)
- `idx_notes_owner_status_updated` (owner_id, status, updated_at DESC)
- `idx_notes_directory_status` (directory_id, status, updated_at DESC)
- `idx_notes_trashed_at` (trashed_at) — 自動パージ用
- `idx_notes_edit_lock` (edit_lock_expires_at)

### note_tags

| カラム | 型 | 制約 |
|---|---|---|
| note_id | TEXT | NOT NULL, REFERENCES notes(id) ON DELETE CASCADE |
| tag_id | TEXT | NOT NULL, REFERENCES tags(id) ON DELETE CASCADE |
| PRIMARY KEY | (note_id, tag_id) | |

インデックス:
- `idx_note_tags_tag_id` (tag_id)

### note_internal_links

| カラム | 型 | 制約 |
|---|---|---|
| id | TEXT | PRIMARY KEY |
| from_note_id | TEXT | NOT NULL, REFERENCES notes(id) ON DELETE CASCADE |
| ref_kind | TEXT | NOT NULL CHECK (ref_kind IN ('id','title')) |
| ref_target | TEXT | NOT NULL CHECK (length(ref_target) >= 1 AND length(ref_target) <= 200) |
| display_text | TEXT | NULL |
| resolved_note_id | TEXT | NULL, REFERENCES notes(id) ON DELETE SET NULL |

インデックス:
- `idx_nil_from` (from_note_id)
- `idx_nil_resolved` (resolved_note_id)
- `idx_nil_target` (ref_kind, ref_target)

### note_media_refs

| カラム | 型 | 制約 |
|---|---|---|
| note_id | TEXT | NOT NULL, REFERENCES notes(id) ON DELETE CASCADE |
| media_id | TEXT | NOT NULL, REFERENCES media_assets(id) ON DELETE RESTRICT |
| PRIMARY KEY | (note_id, media_id) | |

インデックス:
- `idx_nmr_media` (media_id)

---

## Tag

### tags

| カラム | 型 | 制約 |
|---|---|---|
| id | TEXT | PRIMARY KEY |
| owner_id | TEXT | NOT NULL, REFERENCES users(id) ON DELETE CASCADE |
| name | TEXT | NOT NULL |
| name_normalized | TEXT | NOT NULL — NFKC 正規化済み小文字 |
| note_count | INTEGER | NOT NULL DEFAULT 0 CHECK (note_count >= 0) |
| created_at | TEXT | NOT NULL |
| updated_at | TEXT | NOT NULL |

インデックス:
- `uniq_tags_owner_name_normalized` UNIQUE (owner_id, name_normalized)
- `idx_tags_owner_note_count` (owner_id, note_count DESC)

### tag_blacklist

| カラム | 型 | 制約 |
|---|---|---|
| owner_id | TEXT | NOT NULL, REFERENCES users(id) ON DELETE CASCADE |
| name_normalized | TEXT | NOT NULL |
| added_at | TEXT | NOT NULL |
| PRIMARY KEY | (owner_id, name_normalized) | |

---

## Publication

### publication_states

| カラム | 型 | 制約 |
|---|---|---|
| note_id | TEXT | PRIMARY KEY, REFERENCES notes(id) ON DELETE CASCADE |
| owner_id | TEXT | NOT NULL, REFERENCES users(id) ON DELETE CASCADE |
| visibility | TEXT | NOT NULL CHECK (visibility IN ('private','unlisted','public')) DEFAULT 'private' |
| published_at | TEXT | NULL |
| updated_at | TEXT | NOT NULL |

インデックス:
- `idx_pubs_visibility_owner` (visibility, owner_id)
- `idx_pubs_public_published_at` (published_at) — 公開タイムラインで利用

### share_links

| カラム | 型 | 制約 |
|---|---|---|
| id | TEXT | PRIMARY KEY |
| note_id | TEXT | NOT NULL, REFERENCES notes(id) ON DELETE CASCADE |
| owner_id | TEXT | NOT NULL, REFERENCES users(id) ON DELETE CASCADE |
| token_hash | TEXT | NOT NULL UNIQUE |
| password_hash | TEXT | NULL |
| status | TEXT | NOT NULL CHECK (status IN ('active','revoked')) DEFAULT 'active' |
| failed_attempts | INTEGER | NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0) |
| locked_until | TEXT | NULL |
| created_at | TEXT | NOT NULL |
| revoked_at | TEXT | NULL |
| last_accessed_at | TEXT | NULL |

インデックス:
- `uniq_share_links_token_hash` UNIQUE (token_hash)
- `idx_share_links_note_status` (note_id, status)
- `idx_share_links_locked_until` (locked_until) — 一時ロック判定の高速化

---

## Ingestion

### ingestion_jobs

| カラム | 型 | 制約 |
|---|---|---|
| id | TEXT | PRIMARY KEY |
| owner_id | TEXT | NOT NULL, REFERENCES users(id) ON DELETE CASCADE |
| original_file_name | TEXT | NOT NULL |
| mime_type | TEXT | NOT NULL |
| byte_size | INTEGER | NOT NULL CHECK (byte_size > 0) |
| kind | TEXT | NOT NULL |
| status | TEXT | NOT NULL CHECK (status IN ('pending','processing','previewing','saved','failed','discarded')) |
| temp_storage_key | TEXT | NULL |
| preview_json | TEXT | NULL — IngestionPreview を JSON シリアライズ |
| error_code | TEXT | NULL |
| error_reason | TEXT | NULL |
| regeneration_count | INTEGER | NOT NULL DEFAULT 0 |
| saved_as_note_id | TEXT | NULL, REFERENCES notes(id) ON DELETE SET NULL |
| created_at | TEXT | NOT NULL |
| updated_at | TEXT | NOT NULL |

インデックス:
- `idx_ij_owner_status` (owner_id, status, updated_at DESC)
- `idx_ij_status_updated` (status, updated_at) — stuck 検出

---

## Media

### media_assets

| カラム | 型 | 制約 |
|---|---|---|
| id | TEXT | PRIMARY KEY |
| owner_id | TEXT | NOT NULL, REFERENCES users(id) ON DELETE CASCADE |
| kind | TEXT | NOT NULL CHECK (kind IN ('image','video','avatar')) |
| mime_type | TEXT | NOT NULL |
| byte_size | INTEGER | NOT NULL |
| backend | TEXT | NOT NULL DEFAULT 'r2' |
| storage_key | TEXT | NOT NULL UNIQUE |
| original_file_name | TEXT | NULL |
| width | INTEGER | NULL |
| height | INTEGER | NULL |
| duration_ms | INTEGER | NULL |
| ref_count | INTEGER | NOT NULL DEFAULT 0 CHECK (ref_count >= 0) |
| status | TEXT | NOT NULL CHECK (status IN ('pending','attached','orphan','deleting')) DEFAULT 'pending' |
| created_at | TEXT | NOT NULL |
| updated_at | TEXT | NOT NULL |

インデックス:
- `uniq_media_storage_key` UNIQUE (storage_key)
- `idx_media_owner` (owner_id, created_at DESC)
- `idx_media_status_updated` (status, updated_at) — 孤児クリーンアップ用

---

## Export

### export_jobs

| カラム | 型 | 制約 |
|---|---|---|
| id | TEXT | PRIMARY KEY |
| owner_id | TEXT | NOT NULL, REFERENCES users(id) ON DELETE CASCADE |
| format | TEXT | NOT NULL CHECK (format IN ('html','markdown','pdf')) |
| scope | TEXT | NOT NULL CHECK (scope IN ('single','multiple','view')) |
| target_note_ids_json | TEXT | NOT NULL DEFAULT '[]' |
| view_query_json | TEXT | NULL |
| options_json | TEXT | NOT NULL |
| status | TEXT | NOT NULL CHECK (status IN ('pending','processing','completed','failed','cancelled','expired')) |
| artifact_key | TEXT | NULL |
| artifact_size | INTEGER | NULL |
| error_code | TEXT | NULL |
| error_reason | TEXT | NULL |
| progress_processed | INTEGER | NOT NULL DEFAULT 0 |
| progress_total | INTEGER | NOT NULL DEFAULT 0 |
| failed_note_ids_json | TEXT | NOT NULL DEFAULT '[]' |
| created_at | TEXT | NOT NULL |
| updated_at | TEXT | NOT NULL |
| completed_at | TEXT | NULL |
| expires_at | TEXT | NULL |

インデックス:
- `idx_export_jobs_owner_status` (owner_id, status, updated_at DESC)
- `idx_export_jobs_expires_at` (expires_at)

---

## Search

### search_documents

D1 上に物理テーブルを置き、SQLite の FTS5 仮想テーブル（`search_documents_fts`）を併用する。

| カラム | 型 | 制約 |
|---|---|---|
| note_id | TEXT | PRIMARY KEY, REFERENCES notes(id) ON DELETE CASCADE |
| owner_id | TEXT | NOT NULL, REFERENCES users(id) ON DELETE CASCADE |
| visibility | TEXT | NOT NULL CHECK (visibility IN ('private','unlisted','public')) |
| title | TEXT | NOT NULL |
| body_plain | TEXT | NOT NULL |
| tag_names_json | TEXT | NOT NULL DEFAULT '[]' |
| directory_path | TEXT | NOT NULL DEFAULT '' |
| date_for_calendar | TEXT | NOT NULL |
| updated_at | TEXT | NOT NULL |
| indexed_at | TEXT | NOT NULL |

インデックス:
- `idx_sd_visibility_owner` (visibility, owner_id, date_for_calendar DESC)

### search_documents_fts

FTS5 仮想テーブル。`title`, `body_plain`, `tag_names_json` をトークナイズして全文検索を提供。`content` テーブルとして `search_documents` を参照（contentless ではなく external content モード）。

### index_jobs

| カラム | 型 | 制約 |
|---|---|---|
| id | TEXT | PRIMARY KEY |
| note_id | TEXT | NOT NULL |
| op | TEXT | NOT NULL CHECK (op IN ('upsert','delete')) |
| payload_json | TEXT | NULL — NoteSnapshot |
| attempts | INTEGER | NOT NULL DEFAULT 0 |
| last_error | TEXT | NULL |
| enqueued_at | TEXT | NOT NULL |
| processed_at | TEXT | NULL |

インデックス:
- `idx_index_jobs_enqueued` (processed_at, enqueued_at)

---

## View

### saved_views

| カラム | 型 | 制約 |
|---|---|---|
| id | TEXT | PRIMARY KEY |
| owner_id | TEXT | NOT NULL, REFERENCES users(id) ON DELETE CASCADE |
| name | TEXT | NOT NULL |
| kind | TEXT | NOT NULL CHECK (kind IN ('personal','public')) |
| query_json | TEXT | NOT NULL |
| display_mode | TEXT | NOT NULL CHECK (display_mode IN ('list','tile','calendar')) |
| calendar_date_key | TEXT | NOT NULL CHECK (calendar_date_key IN ('updated','created','frontMatterDate')) |
| sort_json | TEXT | NOT NULL |
| is_default | INTEGER | NOT NULL DEFAULT 0 CHECK (is_default IN (0,1)) |
| broken_conditions_json | TEXT | NOT NULL DEFAULT '[]' |
| created_at | TEXT | NOT NULL |
| updated_at | TEXT | NOT NULL |

インデックス:
- `uniq_saved_views_owner_kind_name` UNIQUE (owner_id, kind, name)
- 既定ビューの一意性は usecase レベルで担保（部分 UNIQUE は SQLite で書きづらい）

---

## AdminSettings

### instance_settings

シングルトン。`id` カラムは `'singleton'` 固定。

| カラム | 型 | 制約 |
|---|---|---|
| id | TEXT | PRIMARY KEY CHECK (id = 'singleton') |
| llm_provider | TEXT | NOT NULL DEFAULT 'anthropic' |
| llm_model | TEXT | NOT NULL |
| llm_api_key_source | TEXT | NOT NULL CHECK (llm_api_key_source IN ('env','db')) |
| llm_api_key_ciphertext | TEXT | NULL |
| prompts_json | TEXT | NOT NULL DEFAULT '{}' |
| design_tokens_json | TEXT | NOT NULL DEFAULT '{}' |
| registration_open | INTEGER | NOT NULL DEFAULT 1 CHECK (registration_open IN (0,1)) |
| registration_closed_reason | TEXT | NULL |
| limits_json | TEXT | NOT NULL |
| updated_at | TEXT | NOT NULL |

### user_prompt_overrides

| カラム | 型 | 制約 |
|---|---|---|
| owner_id | TEXT | PRIMARY KEY, REFERENCES users(id) ON DELETE CASCADE |
| prompts_json | TEXT | NOT NULL DEFAULT '{}' |
| updated_at | TEXT | NOT NULL |

---

## Outbox

### outbox_events

CLAUDE.md の outbox 規約に従う。

| カラム | 型 | 制約 |
|---|---|---|
| id | TEXT | PRIMARY KEY |
| event_type | TEXT | NOT NULL — 例 `note.saved` |
| aggregate_id | TEXT | NOT NULL |
| payload_json | TEXT | NOT NULL |
| created_at | TEXT | NOT NULL |
| dispatched_at | TEXT | NULL |
| lease_owner | TEXT | NULL |
| lease_expires_at | TEXT | NULL |
| attempts | INTEGER | NOT NULL DEFAULT 0 |
| last_error | TEXT | NULL |

インデックス:
- `idx_outbox_pending` (dispatched_at, lease_expires_at, created_at)
- `idx_outbox_aggregate` (aggregate_id, event_type)

リレー worker は `dispatched_at IS NULL AND (lease_expires_at IS NULL OR lease_expires_at <= now)` で取得し、`lease_owner` / `lease_expires_at` をロックとして使う。
