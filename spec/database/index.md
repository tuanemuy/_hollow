# DB設計

データストア: Cloudflare D1（SQLite 互換）。

UUID v7 はテキスト 26 字（base32 表現）または 36 字（標準 hex with dash）で扱う。本設計では `TEXT` 36 字標準形式で統一。Instant は ISO 8601 UTC 文字列を `TEXT` で保存。

すべてのテーブルに `created_at`, `updated_at` を持たせる（一部 `created_at` のみ）。

## アプリ層補助制約

- `notes.content_html` のサイズ上限（1 MiB）と `notes.front_matter_json` のサイズ上限（64 KiB）は DB 制約では強制せず、ContentHtml / FrontMatter の値オブジェクト構築時に検証する
- `notes` を `tagIds` で AND 検索する用途は `note_tags` join では非効率なため、Search ドメインの `search_documents_fts` 経由で行う
- `media_assets` の物理削除前に `note_media_refs` の対象行が存在しないことを `MediaService.purge` が確認する（FK RESTRICT で誤削除は防止される）
- `outbox_events` は dispatch 済みの行が増え続けるため、定期的にパージするワーカ（pruner）が必要。具体は `app/worker/cloudflare/pruner.ts`
- `verifications` も期限切れ行が滞留するため、同じ pruner ワーカが `expires_at < now` の行を物理削除する (アダプタが consume 済み行を消す場合でも、TTL 超過の未使用行は残り得る)

## 命名規則

- テーブル名は複数形 snake_case（例: `users`）
- カラム名は snake_case
- 外部キーは `<対象テーブル単数>_id`
- インデックス命名: `idx_<table>_<columns>`
- 一意インデックス: `uniq_<table>_<columns>`

---

## Identity

Identity 配下の 4 テーブル (`users` / `accounts` / `sessions` / `verifications`) のうち、ドメイン集約に対応するのは `User → users` のみ。`accounts` は `CredentialStore` ポートの永続化先、`sessions` は `SessionService` ポートの永続化先、`verifications` は `VerificationChallenge` ポートの永続化先で、それぞれアダプタ実装の plumbing。

これら 4 表は **アダプタが better-auth を採用する都合で better-auth 規約のスキーマに揃える**。`@better-auth/cli generate` で Drizzle スキーマを自動生成でき、`username` plugin と `admin` plugin に対応する。ドメイン側は better-auth の存在を知らない (ポート抽象を介してのみアクセス)。

アプリ独自の拡張カラム (`bio`, `avatar_media_id`, `last_username_changed_at`, `deleted_at`) は `users` に追加する。生成スキーマと拡張カラムの両立方針は **[ADR 006](../adr/006-better-auth-schema-extension.md)** を参照 (`additionalFields` 設定で混ぜ込み、CLI 生成結果をコミット)。

### users

better-auth `user` テーブル規約 + `username` plugin + `admin` plugin + アプリ拡張。ドメインの `User` 集約はこの行から `id / username / email / displayName(=name) / bio / avatarMediaId / role / status / lastUsernameChangedAt / createdAt / updatedAt` を読み取る。`name` は必須で、SignUp 時に `displayName ?? username` で初期化される。

`status` は `email_verified` / `banned` / `deleted_at` の組み合わせからアダプタが集約構築時に派生させる。優先順位:

```
if deleted_at !== null      → 'deleted'
else if banned === 1        → 'suspended'
else if email_verified === 0 → 'pending'
else                         → 'active'
```

`markDeleted` は任意状態から呼べる (suspended → deleted、pending → deleted 等) ので `deleted_at` と `banned` が同時に立つ組み合わせは普通に発生する。その場合は上記優先順位に従い `deleted` を最優先とする。

`User.activate(now)` のアダプタ側書き込み方針:
- `email_verified = 1` をセットする (`status` は派生列なので、`email_verified` を立てることでアダプタ側の派生計算が `pending` → `active` に切り替わる)
- `banned` / `deleted_at` は触らない (`activate` は `pending` 専用遷移なので、これらは元から 0 / NULL の前提)

`User.suspend(now)` のアダプタ側書き込み方針:
- `banned = 1` をセットする
- `ban_reason` / `ban_expires` には **常に NULL を書き込む**。理由: ドメインの「明示的 `reinstate` で active 化」というライフサイクルと、better-auth admin plugin の `ban_expires` 経過時の自動 unban 挙動が衝突するため、自動 unban に依存しない。`User.suspend` の API 拡張 (理由 / 期限) は MVP スコープ外
- `reinstate` 時は `banned = 0` に戻す (ban_reason / ban_expires は元から NULL のため変更なし)

`User.markDeleted(now)` のアダプタ側書き込み方針:
- **better-auth の `deleteUser` API は使用しない**。better-auth は物理削除を行うため論理削除方針 (deleted_at 立て + username/email の永久ロック維持) と相容れない
- `userRepo.save(user)` 経由で `deleted_at = now` を書き込む論理削除のみで対応する
- `accounts` 行の物理削除は `CredentialStore.purgeAll(userId)` アダプタが担当する (`DeleteAccount` ユースケースが UoW 内で `userRepo.save` と `credentialStore.purgeAll` を順に呼ぶ)
- `sessions` 行の物理削除は `SessionService.revokeAllForUser(userId)` アダプタが担当する (`DeleteAccount` ユースケースが UoW commit 後に呼ぶ)
- いずれのクリーンアップも better-auth API を介さず DB を直接書く (アダプタ実装裁量)

論理削除済みの `users` 行が残ることで、username / email の UNIQUE 制約により再使用が永久に防止される (`assertUsernameAvailable` / `assertEmailAvailable` も `deleted_at` を無視して衝突判定する)。

| カラム | 型 | 制約 | 出所 |
|---|---|---|---|
| id | TEXT | PRIMARY KEY | better-auth core |
| name | TEXT | NOT NULL — `displayName` の格納先 (1..50 はアプリ層で検証)。SignUp 時に未指定なら `username` で初期化 | better-auth core |
| email | TEXT | NOT NULL UNIQUE | better-auth core |
| email_verified | INTEGER | NOT NULL DEFAULT 0 CHECK (email_verified IN (0,1)) | better-auth core |
| image | TEXT | NULL — 不使用 (avatar_media_id を使う) | better-auth core |
| created_at | TEXT | NOT NULL | better-auth core |
| updated_at | TEXT | NOT NULL | better-auth core |
| username | TEXT | NOT NULL UNIQUE | username plugin |
| display_username | TEXT | NULL — 表示用大文字小文字保持 (本 MVP では unused) | username plugin |
| role | TEXT | NOT NULL DEFAULT 'member' CHECK (role IN ('member','admin')) | admin plugin |
| banned | INTEGER | NOT NULL DEFAULT 0 CHECK (banned IN (0,1)) | admin plugin |
| ban_reason | TEXT | NULL | admin plugin |
| ban_expires | TEXT | NULL | admin plugin |
| bio | TEXT | NULL — 0..500 はアプリ層で検証 | 拡張 |
| avatar_media_id | TEXT | NULL REFERENCES media_assets(id) ON DELETE SET NULL | 拡張 |
| last_username_changed_at | TEXT | NULL — 30 日制限の判定に使用 | 拡張 |
| deleted_at | TEXT | NULL — 論理削除マーカー (better-auth は物理削除を使わない) | 拡張 |

インデックス:
- `uniq_users_email` UNIQUE (email)
- `uniq_users_username` UNIQUE (username)
- `idx_users_role_banned` (role, banned)
- `idx_users_deleted_at` (deleted_at) — アクティブユーザーフィルタ高速化

注: パスワードハッシュは `users` ではなく `accounts.password` (provider_id='credential' の行) に格納される。これはドメインの `User` 集約が credential を持たない (`CredentialStore` ポートが管理する) という設計と一致する。

### accounts

better-auth `account` テーブル規約。認証手段 (password / OAuth provider) を user に紐づける。**ドメイン集約には対応せず、`CredentialStore` ポートのアダプタが直接読み書きする plumbing**。SSO 追加時はここに新しい provider_id の行が追加される (テーブル変更不要)。

アダプタ実装の経路: 通常時 (`registerPassword` / `verifyPassword` / `changePassword` / `linkProvider` 等) は better-auth API 経由。論理削除時のみ `userRepo.save` が DB 直書きで関連 `accounts` 行を消す (better-auth の `deleteUser` は物理削除なので使わない)。

注 (`user_id` の `ON DELETE CASCADE`): 本アプリの `User` は論理削除 (`deleted_at` 立て) で `users` 行は残り続けるため、運用上この CASCADE は発火しない。`DeleteAccount` ユースケースは `CredentialStore.purgeAll(userId)` 経由で明示的に `accounts` 行を物理削除する。CASCADE 制約は将来 better-auth の物理削除 API を採用する場合や、データレストア時の整合性保険として残す。

| カラム | 型 | 制約 |
|---|---|---|
| id | TEXT | PRIMARY KEY |
| user_id | TEXT | NOT NULL REFERENCES users(id) ON DELETE CASCADE |
| account_id | TEXT | NOT NULL — provider 側 ID。credential 認証時は user.id、OAuth 時は IdP の `sub` |
| provider_id | TEXT | NOT NULL — `'credential'`, `'google'`, `'github'` 等 |
| password | TEXT | NULL — credential 用 Argon2id ハッシュ。better-auth が内部生成 |
| access_token | TEXT | NULL |
| refresh_token | TEXT | NULL |
| id_token | TEXT | NULL |
| access_token_expires_at | TEXT | NULL |
| refresh_token_expires_at | TEXT | NULL |
| scope | TEXT | NULL |
| created_at | TEXT | NOT NULL |
| updated_at | TEXT | NOT NULL |

インデックス:
- `uniq_accounts_provider_account` UNIQUE (provider_id, account_id)
- `idx_accounts_user` (user_id)

### sessions

better-auth `session` テーブル規約。**ドメイン集約には対応せず、`SessionService` ポートのアダプタが直接読み書きする plumbing**。

| カラム | 型 | 制約 |
|---|---|---|
| id | TEXT | PRIMARY KEY |
| user_id | TEXT | NOT NULL REFERENCES users(id) ON DELETE CASCADE |
| token | TEXT | NOT NULL UNIQUE — better-auth が十分な長さで生成、Cookie 値と一致 |
| expires_at | TEXT | NOT NULL — 既定 30 日 |
| created_at | TEXT | NOT NULL |
| updated_at | TEXT | NOT NULL |
| ip_address | TEXT | NULL |
| user_agent | TEXT | NULL |
| impersonated_by | TEXT | NULL REFERENCES users(id) ON DELETE SET NULL — admin plugin (将来 impersonate 機能用) |

インデックス:
- `uniq_sessions_token` UNIQUE (token)
- `idx_sessions_user` (user_id)
- `idx_sessions_expires_at` (expires_at)

注: better-auth 規約に従い `token` 平文保存方式 (旧仕様の `token_hash` 方式から変更)。トークンは十分な長さ (32+ bytes 由来) を持ち、D1 はネットワーク隔離されている前提で許容する **設計判断**: D1 のバックアップ漏洩リスクは `expires_at` (最大 30 日) で blast radius が抑えられる範囲とみなす。より厳格な要件が出た場合は `SessionService` アダプタを `token_hash` 方式に切り替える (ドメインインターフェースは無変更で対応可)。

注 (`user_id` の `ON DELETE CASCADE`): `accounts` と同様、論理削除では発火しない。`DeleteAccount` ユースケースは UoW commit 後に `SessionService.revokeAllForUser(userId)` を呼んで明示的に session 行をクリーンアップする。CASCADE は物理削除時の整合性保険として残す。

### verifications

better-auth `verification` テーブル規約。**ドメイン集約には対応せず、`VerificationChallenge` ポートのアダプタが直接読み書きする plumbing**。メール確認・パスワードリセット・メールアドレス変更等の単発トークンを `purpose` で識別して 1 表に汎用格納。

| カラム | 型 | 制約 |
|---|---|---|
| id | TEXT | PRIMARY KEY |
| identifier | TEXT | NOT NULL — `<purpose>:<userId>` 形式。purpose は `email_verification` / `password_reset` / `email_change` |
| value | TEXT | NOT NULL — トークン値。アダプタの実装裁量でハッシュ or 平文。`email_change` の場合は payload (`newEmail` 等) を JSON で同梱可 |
| expires_at | TEXT | NOT NULL |
| created_at | TEXT | NOT NULL |
| updated_at | TEXT | NOT NULL |

インデックス:
- `uniq_verifications_value` UNIQUE (value) — `VerificationChallenge.consume(token)` が value で行を引くため必須。トークンは十分なエントロピーを持つので衝突は実質発生しないが、UNIQUE 制約で発行時の衝突を検出可能にする
- `idx_verifications_identifier` (identifier)
- `idx_verifications_expires_at` (expires_at)

注: 1 トークン = 1 行。consume はアダプタが行削除 or フラグ更新で表現する (ドメインからは `VerificationChallenge.consume` 経由のため実装裁量)。期限切れ行のパージは pruner ワーカーで実施。

注 (`identifier` の UNIQUE 制約を置かない理由): `VerificationChallenge.issue` は同一 `(userId, purpose)` の既存未消費トークンを無効化してから新行を発行する仕様（ドメイン側で明記）だが、その「無効化」をアダプタが行削除で表現するか、フラグ更新（`consumed_at` 立て等）で表現するかは実装裁量。フラグ方式の場合は同 identifier で複数行が存在し得るため、強制 UNIQUE を置かず INDEX のみとする。同 identifier の「未消費は同時に最大 1 行」を担保するのはアダプタの `issue` 実装責務であり、SQL 制約には依存しない。

注 (value のハッシュ化): better-auth 既定では value は平文格納。`SessionService` と同様に「D1 がネットワーク隔離されている前提で許容する設計判断」とする。より厳格な要件 (バックアップ漏洩耐性) が必要になった場合は `VerificationChallenge` アダプタを value ハッシュ方式に切り替える (ドメインインターフェース無変更で対応可)。

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
| version | INTEGER | NOT NULL DEFAULT 0 — OCC トークン |

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

### note_revisions

`SaveNote` / `RestoreNoteRevision` 成功時に追加される、Note の不変スナップショット履歴。 親 Note の物理削除 (PurgeNote) で `ON DELETE CASCADE` により消える。 `AdminSettings.limits.maxNoteRevisionsPerNote` を超過した古い行はアプリケーション層で削除される (Issue #158 ADR-004)。

| カラム | 型 | 制約 |
|---|---|---|
| id | TEXT | PRIMARY KEY |
| note_id | TEXT | NOT NULL, REFERENCES notes(id) ON DELETE CASCADE |
| owner_id | TEXT | NOT NULL, REFERENCES users(id) ON DELETE CASCADE — `notes.owner_id` の冗長保持（メンテナンス用） |
| title | TEXT | NOT NULL |
| content_html | TEXT | NOT NULL |
| front_matter_json | TEXT | NOT NULL DEFAULT '{}' |
| created_by_user_id | TEXT | NOT NULL, REFERENCES users(id) ON DELETE CASCADE — 将来の共同編集対応のため列だけ保持（UI 非表示） |
| created_at | TEXT | NOT NULL |

インデックス:
- `idx_note_revisions_note_created` (note_id, created_at DESC, id DESC) — UI 表示の newest-first 一覧 + 同 ms 内の安定順
- `idx_note_revisions_owner` (owner_id)

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

トークナイザは `tokenize='trigram'`（migration 0008 で `unicode61` から切替、Issue #50）。CJK / ASCII を統一経路で部分一致できるようにするのが目的。trigram の本質的制約として 3 Unicode codepoint 未満のクエリトークンはマッチしないため、adapter (`D1SearchIndex.buildMatchExpression`) で短トークンを除外し、全滅時は `'""'` リテラルで 0 件にフォールバックする。

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
