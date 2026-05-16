-- D1 adapter schema for the Hollow application. Layered on top of
-- 0000_initial.sql (todos / outbox_events / processed_events / _occ_guard).
-- All timestamp columns here are ISO8601 TEXT per spec/database/index.md.

-- ---------------------------------------------------------------------------
-- Identity (better-auth + extensions)
-- ---------------------------------------------------------------------------

CREATE TABLE `users` (
        `id` text PRIMARY KEY NOT NULL,
        `name` text NOT NULL,
        `email` text NOT NULL,
        `email_verified` integer DEFAULT 0 NOT NULL,
        `image` text,
        `created_at` text NOT NULL,
        `updated_at` text NOT NULL,
        `username` text NOT NULL,
        `display_username` text,
        `role` text DEFAULT 'member' NOT NULL,
        `banned` integer DEFAULT 0 NOT NULL,
        `ban_reason` text,
        `ban_expires` text,
        `bio` text,
        `avatar_media_id` text,
        `last_username_changed_at` text,
        `deleted_at` text,
        CONSTRAINT `users_email_verified_bool` CHECK(`email_verified` IN (0, 1)),
        CONSTRAINT `users_banned_bool` CHECK(`banned` IN (0, 1)),
        CONSTRAINT `users_role_enum` CHECK(`role` IN ('member', 'admin'))
);

CREATE UNIQUE INDEX `uniq_users_email` ON `users` (`email`);
CREATE UNIQUE INDEX `uniq_users_username` ON `users` (`username`);
CREATE INDEX `idx_users_role_banned` ON `users` (`role`, `banned`);
CREATE INDEX `idx_users_deleted_at` ON `users` (`deleted_at`);

CREATE TABLE `accounts` (
        `id` text PRIMARY KEY NOT NULL,
        `user_id` text NOT NULL,
        `account_id` text NOT NULL,
        `provider_id` text NOT NULL,
        `password` text,
        `access_token` text,
        `refresh_token` text,
        `id_token` text,
        `access_token_expires_at` text,
        `refresh_token_expires_at` text,
        `scope` text,
        `created_at` text NOT NULL,
        `updated_at` text NOT NULL,
        FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);

CREATE UNIQUE INDEX `uniq_accounts_provider_account` ON `accounts` (`provider_id`, `account_id`);
CREATE INDEX `idx_accounts_user` ON `accounts` (`user_id`);

CREATE TABLE `sessions` (
        `id` text PRIMARY KEY NOT NULL,
        `user_id` text NOT NULL,
        `token` text NOT NULL,
        `expires_at` text NOT NULL,
        `created_at` text NOT NULL,
        `updated_at` text NOT NULL,
        `ip_address` text,
        `user_agent` text,
        `impersonated_by` text,
        FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
        FOREIGN KEY (`impersonated_by`) REFERENCES `users`(`id`) ON DELETE SET NULL
);

CREATE UNIQUE INDEX `uniq_sessions_token` ON `sessions` (`token`);
CREATE INDEX `idx_sessions_user` ON `sessions` (`user_id`);
CREATE INDEX `idx_sessions_expires_at` ON `sessions` (`expires_at`);

CREATE TABLE `verifications` (
        `id` text PRIMARY KEY NOT NULL,
        `identifier` text NOT NULL,
        `value` text NOT NULL,
        `expires_at` text NOT NULL,
        `created_at` text NOT NULL,
        `updated_at` text NOT NULL
);

CREATE UNIQUE INDEX `uniq_verifications_value` ON `verifications` (`value`);
CREATE INDEX `idx_verifications_identifier` ON `verifications` (`identifier`);
CREATE INDEX `idx_verifications_expires_at` ON `verifications` (`expires_at`);

-- ---------------------------------------------------------------------------
-- Media (declared before notes / user FK back-references resolve in SQL)
-- ---------------------------------------------------------------------------

CREATE TABLE `media_assets` (
        `id` text PRIMARY KEY NOT NULL,
        `owner_id` text NOT NULL,
        `kind` text NOT NULL,
        `mime_type` text NOT NULL,
        `byte_size` integer NOT NULL,
        `backend` text DEFAULT 'r2' NOT NULL,
        `storage_key` text NOT NULL,
        `original_file_name` text,
        `width` integer,
        `height` integer,
        `duration_ms` integer,
        `ref_count` integer DEFAULT 0 NOT NULL,
        `status` text DEFAULT 'pending' NOT NULL,
        `created_at` text NOT NULL,
        `updated_at` text NOT NULL,
        FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
        CONSTRAINT `media_kind_enum` CHECK(`kind` IN ('image', 'video', 'avatar')),
        CONSTRAINT `media_ref_count_nonneg` CHECK(`ref_count` >= 0),
        CONSTRAINT `media_status_enum` CHECK(`status` IN ('pending', 'attached', 'orphan', 'deleting'))
);

CREATE UNIQUE INDEX `uniq_media_storage_key` ON `media_assets` (`storage_key`);
CREATE INDEX `idx_media_owner` ON `media_assets` (`owner_id`, `created_at` DESC);
CREATE INDEX `idx_media_status_updated` ON `media_assets` (`status`, `updated_at`);

-- Wire the `users.avatar_media_id → media_assets.id` reference. The FK is
-- declared post-hoc via a trigger because SQLite cannot ALTER TABLE to add
-- foreign keys after the fact. The constraint is enforced at the
-- application layer (User aggregate's avatar mutator validates the id) and
-- by the ON DELETE side via the media_assets trigger below.

CREATE TRIGGER `users_avatar_media_assets_set_null`
        AFTER DELETE ON `media_assets`
        FOR EACH ROW
BEGIN
        UPDATE `users` SET `avatar_media_id` = NULL WHERE `avatar_media_id` = OLD.`id`;
END;

-- ---------------------------------------------------------------------------
-- Directory
-- ---------------------------------------------------------------------------

CREATE TABLE `directories` (
        `id` text PRIMARY KEY NOT NULL,
        `owner_id` text NOT NULL,
        `parent_id` text,
        `name` text NOT NULL,
        `slug` text NOT NULL,
        `depth` integer NOT NULL,
        `version` integer DEFAULT 0 NOT NULL,
        `created_at` text NOT NULL,
        `updated_at` text NOT NULL,
        FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
        FOREIGN KEY (`parent_id`) REFERENCES `directories`(`id`) ON DELETE RESTRICT,
        CONSTRAINT `directories_depth_range` CHECK(`depth` >= 0 AND `depth` <= 10)
);

CREATE UNIQUE INDEX `uniq_directories_owner_parent_name`
        ON `directories` (`owner_id`, `parent_id`, LOWER(`name`));
CREATE UNIQUE INDEX `uniq_directories_owner_root`
        ON `directories` (`owner_id`) WHERE `parent_id` IS NULL;
CREATE INDEX `idx_directories_owner_parent` ON `directories` (`owner_id`, `parent_id`);
CREATE INDEX `idx_directories_owner_depth` ON `directories` (`owner_id`, `depth`);

-- ---------------------------------------------------------------------------
-- Note
-- ---------------------------------------------------------------------------

CREATE TABLE `notes` (
        `id` text PRIMARY KEY NOT NULL,
        `owner_id` text NOT NULL,
        `directory_id` text NOT NULL,
        `slug` text NOT NULL,
        `title` text NOT NULL,
        `content_html` text NOT NULL,
        `front_matter_json` text DEFAULT '{}' NOT NULL,
        `status` text DEFAULT 'active' NOT NULL,
        `trashed_at` text,
        `created_at` text NOT NULL,
        `updated_at` text NOT NULL,
        `edit_lock_user_id` text,
        `edit_lock_acquired_at` text,
        `edit_lock_expires_at` text,
        `version` integer DEFAULT 0 NOT NULL,
        FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
        FOREIGN KEY (`directory_id`) REFERENCES `directories`(`id`) ON DELETE RESTRICT,
        FOREIGN KEY (`edit_lock_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
        CONSTRAINT `notes_status_enum` CHECK(`status` IN ('active', 'trashed'))
);

CREATE UNIQUE INDEX `uniq_notes_owner_slug` ON `notes` (`owner_id`, `slug`);
CREATE INDEX `idx_notes_owner_status_updated` ON `notes` (`owner_id`, `status`, `updated_at` DESC);
CREATE INDEX `idx_notes_directory_status` ON `notes` (`directory_id`, `status`, `updated_at` DESC);
CREATE INDEX `idx_notes_trashed_at` ON `notes` (`trashed_at`);
CREATE INDEX `idx_notes_edit_lock` ON `notes` (`edit_lock_expires_at`);

-- ---------------------------------------------------------------------------
-- Tag
-- ---------------------------------------------------------------------------

CREATE TABLE `tags` (
        `id` text PRIMARY KEY NOT NULL,
        `owner_id` text NOT NULL,
        `name` text NOT NULL,
        `name_normalized` text NOT NULL,
        `note_count` integer DEFAULT 0 NOT NULL,
        `version` integer DEFAULT 0 NOT NULL,
        `created_at` text NOT NULL,
        `updated_at` text NOT NULL,
        FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
        CONSTRAINT `tags_note_count_nonneg` CHECK(`note_count` >= 0)
);

CREATE UNIQUE INDEX `uniq_tags_owner_name_normalized` ON `tags` (`owner_id`, `name_normalized`);
CREATE INDEX `idx_tags_owner_note_count` ON `tags` (`owner_id`, `note_count` DESC);

CREATE TABLE `tag_blacklist` (
        `owner_id` text NOT NULL,
        `name_normalized` text NOT NULL,
        `added_at` text NOT NULL,
        PRIMARY KEY (`owner_id`, `name_normalized`),
        FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);

CREATE TABLE `note_tags` (
        `note_id` text NOT NULL,
        `tag_id` text NOT NULL,
        PRIMARY KEY (`note_id`, `tag_id`),
        FOREIGN KEY (`note_id`) REFERENCES `notes`(`id`) ON DELETE CASCADE,
        FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON DELETE CASCADE
);

CREATE INDEX `idx_note_tags_tag_id` ON `note_tags` (`tag_id`);

CREATE TABLE `note_internal_links` (
        `id` text PRIMARY KEY NOT NULL,
        `from_note_id` text NOT NULL,
        `ref_kind` text NOT NULL,
        `ref_target` text NOT NULL,
        `display_text` text,
        `resolved_note_id` text,
        FOREIGN KEY (`from_note_id`) REFERENCES `notes`(`id`) ON DELETE CASCADE,
        FOREIGN KEY (`resolved_note_id`) REFERENCES `notes`(`id`) ON DELETE SET NULL,
        CONSTRAINT `nil_ref_kind_enum` CHECK(`ref_kind` IN ('id', 'title')),
        CONSTRAINT `nil_ref_target_length` CHECK(length(`ref_target`) >= 1 AND length(`ref_target`) <= 200)
);

CREATE INDEX `idx_nil_from` ON `note_internal_links` (`from_note_id`);
CREATE INDEX `idx_nil_resolved` ON `note_internal_links` (`resolved_note_id`);
CREATE INDEX `idx_nil_target` ON `note_internal_links` (`ref_kind`, `ref_target`);

CREATE TABLE `note_media_refs` (
        `note_id` text NOT NULL,
        `media_id` text NOT NULL,
        PRIMARY KEY (`note_id`, `media_id`),
        FOREIGN KEY (`note_id`) REFERENCES `notes`(`id`) ON DELETE CASCADE,
        FOREIGN KEY (`media_id`) REFERENCES `media_assets`(`id`) ON DELETE RESTRICT
);

CREATE INDEX `idx_nmr_media` ON `note_media_refs` (`media_id`);

-- ---------------------------------------------------------------------------
-- Publication
-- ---------------------------------------------------------------------------

CREATE TABLE `publication_states` (
        `note_id` text PRIMARY KEY NOT NULL,
        `owner_id` text NOT NULL,
        `visibility` text DEFAULT 'private' NOT NULL,
        `published_at` text,
        `updated_at` text NOT NULL,
        FOREIGN KEY (`note_id`) REFERENCES `notes`(`id`) ON DELETE CASCADE,
        FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
        CONSTRAINT `pubs_visibility_enum` CHECK(`visibility` IN ('private', 'unlisted', 'public'))
);

CREATE INDEX `idx_pubs_visibility_owner` ON `publication_states` (`visibility`, `owner_id`);
CREATE INDEX `idx_pubs_public_published_at` ON `publication_states` (`published_at`);

CREATE TABLE `share_links` (
        `id` text PRIMARY KEY NOT NULL,
        `note_id` text NOT NULL,
        `owner_id` text NOT NULL,
        `token_hash` text NOT NULL,
        `password_hash` text,
        `status` text DEFAULT 'active' NOT NULL,
        `failed_attempts` integer DEFAULT 0 NOT NULL,
        `locked_until` text,
        `created_at` text NOT NULL,
        `revoked_at` text,
        `last_accessed_at` text,
        FOREIGN KEY (`note_id`) REFERENCES `notes`(`id`) ON DELETE CASCADE,
        FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
        CONSTRAINT `share_links_status_enum` CHECK(`status` IN ('active', 'revoked')),
        CONSTRAINT `share_links_failed_attempts_nonneg` CHECK(`failed_attempts` >= 0)
);

CREATE UNIQUE INDEX `uniq_share_links_token_hash` ON `share_links` (`token_hash`);
CREATE INDEX `idx_share_links_note_status` ON `share_links` (`note_id`, `status`);
CREATE INDEX `idx_share_links_locked_until` ON `share_links` (`locked_until`);

-- ---------------------------------------------------------------------------
-- Ingestion
-- ---------------------------------------------------------------------------

CREATE TABLE `ingestion_jobs` (
        `id` text PRIMARY KEY NOT NULL,
        `owner_id` text NOT NULL,
        `original_file_name` text NOT NULL,
        `mime_type` text NOT NULL,
        `byte_size` integer NOT NULL,
        `kind` text NOT NULL,
        `status` text NOT NULL,
        `temp_storage_key` text,
        `preview_json` text,
        `error_code` text,
        `error_reason` text,
        `regeneration_count` integer DEFAULT 0 NOT NULL,
        `saved_as_note_id` text,
        `created_at` text NOT NULL,
        `updated_at` text NOT NULL,
        FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
        FOREIGN KEY (`saved_as_note_id`) REFERENCES `notes`(`id`) ON DELETE SET NULL,
        CONSTRAINT `ij_byte_size_positive` CHECK(`byte_size` > 0),
        CONSTRAINT `ij_status_enum` CHECK(`status` IN ('pending', 'processing', 'previewing', 'saved', 'failed', 'discarded'))
);

CREATE INDEX `idx_ij_owner_status` ON `ingestion_jobs` (`owner_id`, `status`, `updated_at` DESC);
CREATE INDEX `idx_ij_status_updated` ON `ingestion_jobs` (`status`, `updated_at`);

-- ---------------------------------------------------------------------------
-- Export
-- ---------------------------------------------------------------------------

CREATE TABLE `export_jobs` (
        `id` text PRIMARY KEY NOT NULL,
        `owner_id` text NOT NULL,
        `format` text NOT NULL,
        `scope` text NOT NULL,
        `target_note_ids_json` text DEFAULT '[]' NOT NULL,
        `view_query_json` text,
        `options_json` text NOT NULL,
        `status` text NOT NULL,
        `artifact_key` text,
        `artifact_size` integer,
        `error_code` text,
        `error_reason` text,
        `progress_processed` integer DEFAULT 0 NOT NULL,
        `progress_total` integer DEFAULT 0 NOT NULL,
        `failed_note_ids_json` text DEFAULT '[]' NOT NULL,
        `created_at` text NOT NULL,
        `updated_at` text NOT NULL,
        `completed_at` text,
        `expires_at` text,
        FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
        CONSTRAINT `export_jobs_format_enum` CHECK(`format` IN ('html', 'markdown', 'pdf')),
        CONSTRAINT `export_jobs_scope_enum` CHECK(`scope` IN ('single', 'multiple', 'view')),
        CONSTRAINT `export_jobs_status_enum` CHECK(`status` IN ('pending', 'processing', 'completed', 'failed', 'cancelled', 'expired'))
);

CREATE INDEX `idx_export_jobs_owner_status` ON `export_jobs` (`owner_id`, `status`, `updated_at` DESC);
CREATE INDEX `idx_export_jobs_expires_at` ON `export_jobs` (`expires_at`);

-- ---------------------------------------------------------------------------
-- Search
-- ---------------------------------------------------------------------------

CREATE TABLE `search_documents` (
        `note_id` text PRIMARY KEY NOT NULL,
        `owner_id` text NOT NULL,
        `visibility` text NOT NULL,
        `title` text NOT NULL,
        `body_plain` text NOT NULL,
        `tag_names_json` text DEFAULT '[]' NOT NULL,
        `directory_path` text DEFAULT '' NOT NULL,
        `date_for_calendar` text NOT NULL,
        `updated_at` text NOT NULL,
        `indexed_at` text NOT NULL,
        FOREIGN KEY (`note_id`) REFERENCES `notes`(`id`) ON DELETE CASCADE,
        FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
        CONSTRAINT `sd_visibility_enum` CHECK(`visibility` IN ('private', 'unlisted', 'public'))
);

CREATE INDEX `idx_sd_visibility_owner`
        ON `search_documents` (`visibility`, `owner_id`, `date_for_calendar` DESC);

-- FTS5 virtual table over `search_documents`. `content=` + `content_rowid=`
-- glue the FTS index to the host table; sync triggers keep the FTS index
-- consistent on host mutations. `rowid` is the implicit row id assigned by
-- SQLite to the host table.
CREATE VIRTUAL TABLE `search_documents_fts` USING fts5(
        `title`,
        `body_plain`,
        `tag_names_json`,
        content='search_documents',
        content_rowid='rowid'
);

CREATE TRIGGER `search_documents_ai` AFTER INSERT ON `search_documents` BEGIN
        INSERT INTO `search_documents_fts`(`rowid`, `title`, `body_plain`, `tag_names_json`)
                VALUES (NEW.rowid, NEW.`title`, NEW.`body_plain`, NEW.`tag_names_json`);
END;

CREATE TRIGGER `search_documents_ad` AFTER DELETE ON `search_documents` BEGIN
        INSERT INTO `search_documents_fts`(`search_documents_fts`, `rowid`, `title`, `body_plain`, `tag_names_json`)
                VALUES ('delete', OLD.rowid, OLD.`title`, OLD.`body_plain`, OLD.`tag_names_json`);
END;

CREATE TRIGGER `search_documents_au` AFTER UPDATE ON `search_documents` BEGIN
        INSERT INTO `search_documents_fts`(`search_documents_fts`, `rowid`, `title`, `body_plain`, `tag_names_json`)
                VALUES ('delete', OLD.rowid, OLD.`title`, OLD.`body_plain`, OLD.`tag_names_json`);
        INSERT INTO `search_documents_fts`(`rowid`, `title`, `body_plain`, `tag_names_json`)
                VALUES (NEW.rowid, NEW.`title`, NEW.`body_plain`, NEW.`tag_names_json`);
END;

CREATE TABLE `index_jobs` (
        `id` text PRIMARY KEY NOT NULL,
        `note_id` text NOT NULL,
        `op` text NOT NULL,
        `payload_json` text,
        `attempts` integer DEFAULT 0 NOT NULL,
        `last_error` text,
        `enqueued_at` text NOT NULL,
        `processed_at` text,
        CONSTRAINT `index_jobs_op_enum` CHECK(`op` IN ('upsert', 'delete'))
);

CREATE INDEX `idx_index_jobs_enqueued` ON `index_jobs` (`processed_at`, `enqueued_at`);

-- ---------------------------------------------------------------------------
-- View
-- ---------------------------------------------------------------------------

CREATE TABLE `saved_views` (
        `id` text PRIMARY KEY NOT NULL,
        `owner_id` text NOT NULL,
        `name` text NOT NULL,
        `kind` text NOT NULL,
        `query_json` text NOT NULL,
        `display_mode` text NOT NULL,
        `calendar_date_key` text NOT NULL,
        `sort_json` text NOT NULL,
        `is_default` integer DEFAULT 0 NOT NULL,
        `broken_conditions_json` text DEFAULT '[]' NOT NULL,
        `version` integer DEFAULT 0 NOT NULL,
        `created_at` text NOT NULL,
        `updated_at` text NOT NULL,
        FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
        CONSTRAINT `saved_views_kind_enum` CHECK(`kind` IN ('personal', 'public')),
        CONSTRAINT `saved_views_display_mode_enum` CHECK(`display_mode` IN ('list', 'tile', 'calendar')),
        CONSTRAINT `saved_views_calendar_date_key_enum` CHECK(`calendar_date_key` IN ('updated', 'created', 'frontMatterDate')),
        CONSTRAINT `saved_views_is_default_bool` CHECK(`is_default` IN (0, 1))
);

CREATE UNIQUE INDEX `uniq_saved_views_owner_kind_name` ON `saved_views` (`owner_id`, `kind`, `name`);

-- ---------------------------------------------------------------------------
-- AdminSettings
-- ---------------------------------------------------------------------------

CREATE TABLE `instance_settings` (
        `id` text PRIMARY KEY NOT NULL,
        `llm_provider` text DEFAULT 'anthropic' NOT NULL,
        `llm_model` text NOT NULL,
        `llm_api_key_source` text NOT NULL,
        `llm_api_key_ciphertext` text,
        `prompts_json` text DEFAULT '{}' NOT NULL,
        `design_tokens_json` text DEFAULT '{}' NOT NULL,
        `registration_open` integer DEFAULT 1 NOT NULL,
        `registration_closed_reason` text,
        `limits_json` text NOT NULL,
        `version` integer DEFAULT 0 NOT NULL,
        `updated_at` text NOT NULL,
        CONSTRAINT `instance_settings_singleton` CHECK(`id` = 'singleton'),
        CONSTRAINT `instance_settings_key_source_enum` CHECK(`llm_api_key_source` IN ('env', 'db')),
        CONSTRAINT `instance_settings_registration_open_bool` CHECK(`registration_open` IN (0, 1))
);

CREATE TABLE `user_prompt_overrides` (
        `owner_id` text PRIMARY KEY NOT NULL,
        `prompts_json` text DEFAULT '{}' NOT NULL,
        `version` integer DEFAULT 0 NOT NULL,
        `updated_at` text NOT NULL,
        FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);
