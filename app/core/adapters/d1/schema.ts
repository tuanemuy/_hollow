import { desc, sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const outboxEvents = sqliteTable(
  "outbox_events",
  {
    id: text("id").primaryKey(),
    eventType: text("event_type").notNull(),
    aggregateId: text("aggregate_id").notNull(),
    payload: text("payload", { mode: "json" }).notNull(),
    occurredAt: integer("occurred_at", { mode: "timestamp_ms" }).notNull(),
    processedAt: integer("processed_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    nextAttemptAt: integer("next_attempt_at", { mode: "timestamp_ms" }),
    failedAt: integer("failed_at", { mode: "timestamp_ms" }),
    // Claim/lease pair so multiple relay workers cannot dispatch the
    // same row. `claimed_at` is stamped at claim time; a row is
    // re-claimable once `claimed_at <= now - leaseMs` (covers crashed
    // workers without an explicit unclaim step). `claimed_by` is a
    // free-form worker id (from `IdGenerator`) — used only for
    // diagnostics.
    claimedAt: integer("claimed_at", { mode: "timestamp_ms" }),
    claimedBy: text("claimed_by"),
  },
  (table) => [
    // Pending = not yet processed, not quarantined, due for next
    // attempt. The relay worker queries this slice each tick;
    // quarantined rows (`failed_at IS NOT NULL`) are deliberately
    // excluded from the index so a poison row no longer pollutes the
    // hot path. The claim/lease filter is checked on top of this slice
    // at claim time.
    index("idx_outbox_pending")
      .on(table.nextAttemptAt, table.createdAt, table.id)
      .where(sql`processed_at IS NULL AND failed_at IS NULL`),
  ],
);

export const processedEvents = sqliteTable("processed_events", {
  id: text("id").primaryKey(),
  processedAt: integer("processed_at", { mode: "timestamp_ms" }).notNull(),
});

// Name of the CHECK constraint on `_occ_guard.n > 0`. Exported so the
// adapter's OCC-violation detector can match against it without
// re-declaring the literal — schema and detector must stay in lockstep.
export const OCC_GUARD_CHECK_NAME = "occ_guard_positive";

// `_occ_guard` is the abort lever for OCC failures inside a
// `db.batch()`.
//
// D1 batches are atomic but treat `UPDATE ... WHERE version = ?`
// matching zero rows as a normal success — the batch commits the rest.
// To turn an OCC mismatch into a batch-wide rollback, each OCC-guarded
// write is followed by:
//
//     INSERT INTO _occ_guard (n)
//       SELECT changes() WHERE changes() = 0;
//
// `changes()` returns the row count touched by the immediately
// preceding statement. When that is > 0 the SELECT yields no rows
// and the INSERT is a no-op; when it is 0 the SELECT yields a single
// `n = 0` row, the CHECK constraint (`n > 0`) fails, the batch aborts,
// and the OCC handler in `PendingBatch` translates the driver error
// into a `ConflictError("OPTIMISTIC_LOCK_FAILURE")`. Because the
// success path never inserts, the table stays empty between batches
// without an explicit DELETE.
export const occGuard = sqliteTable(
  "_occ_guard",
  {
    n: integer("n").notNull(),
  },
  (table) => [check(OCC_GUARD_CHECK_NAME, sql`${table.n} > 0`)],
);

// ---------------------------------------------------------------------------
// Identity (better-auth schema + app extensions)
// ---------------------------------------------------------------------------
//
// All Identity timestamps are stored as ISO8601 text per
// `spec/database/index.md` (better-auth convention), distinct from
// the legacy `outbox_events` integer-ms columns above.

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    emailVerified: integer("email_verified").notNull().default(0),
    image: text("image"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    username: text("username").notNull(),
    displayUsername: text("display_username"),
    role: text("role").notNull().default("member"),
    banned: integer("banned").notNull().default(0),
    banReason: text("ban_reason"),
    banExpires: text("ban_expires"),
    bio: text("bio"),
    // `avatar_media_id` references `media_assets(id) ON DELETE SET NULL`
    // but the reference is expressed in SQL only (migration) to avoid a
    // declaration-order cycle with `mediaAssets.ownerId → users.id`.
    avatarMediaId: text("avatar_media_id"),
    lastUsernameChangedAt: text("last_username_changed_at"),
    deletedAt: text("deleted_at"),
  },
  (table) => [
    uniqueIndex("uniq_users_email").on(table.email),
    // `username` is stored lowercase (the `Username` value object rejects
    // any non-lowercase input), so this index doubles as the case-folded
    // prefix index used by `searchPublicByUsernamePrefix`'s range scan.
    uniqueIndex("uniq_users_username").on(table.username),
    index("idx_users_role_banned").on(table.role, table.banned),
    index("idx_users_deleted_at").on(table.deletedAt),
    check("users_email_verified_bool", sql`${table.emailVerified} IN (0, 1)`),
    check("users_banned_bool", sql`${table.banned} IN (0, 1)`),
    check("users_role_enum", sql`${table.role} IN ('member', 'admin')`),
  ],
);

export const accounts = sqliteTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    password: text("password"),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: text("access_token_expires_at"),
    refreshTokenExpiresAt: text("refresh_token_expires_at"),
    scope: text("scope"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("uniq_accounts_provider_account").on(
      table.providerId,
      table.accountId,
    ),
    index("idx_accounts_user").on(table.userId),
  ],
);

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    impersonatedBy: text("impersonated_by").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    uniqueIndex("uniq_sessions_token").on(table.token),
    index("idx_sessions_user").on(table.userId),
    index("idx_sessions_expires_at").on(table.expiresAt),
  ],
);

export const verifications = sqliteTable(
  "verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("uniq_verifications_value").on(table.value),
    index("idx_verifications_identifier").on(table.identifier),
    index("idx_verifications_expires_at").on(table.expiresAt),
  ],
);

// ---------------------------------------------------------------------------
// Directory
// ---------------------------------------------------------------------------

export const directories = sqliteTable(
  "directories",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    parentId: text("parent_id"),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    depth: integer("depth").notNull(),
    version: integer("version").notNull().default(0),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    // Self-referencing FK declared in SQL migration to avoid declaration
    // order issue with the table reference.
    index("idx_directories_owner_parent").on(table.ownerId, table.parentId),
    index("idx_directories_owner_depth").on(table.ownerId, table.depth),
    check(
      "directories_depth_range",
      sql`${table.depth} >= 0 AND ${table.depth} <= 10`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Note
// ---------------------------------------------------------------------------

export const notes = sqliteTable(
  "notes",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    directoryId: text("directory_id")
      .notNull()
      .references(() => directories.id, { onDelete: "restrict" }),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    contentHtml: text("content_html").notNull(),
    frontMatterJson: text("front_matter_json").notNull().default("{}"),
    status: text("status").notNull().default("active"),
    trashedAt: text("trashed_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    editLockUserId: text("edit_lock_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    editLockAcquiredAt: text("edit_lock_acquired_at"),
    editLockExpiresAt: text("edit_lock_expires_at"),
    // Persistent ingested source file bound 1:1 to the note (Issue #452).
    // `ON DELETE SET NULL` so purging the source asset (orphan reclaim)
    // leaves the note row intact with a null binding.
    sourceFileId: text("source_file_id").references(() => mediaAssets.id, {
      onDelete: "set null",
    }),
    // OCC token. Bumped by every aggregate-mutating transition; persisted
    // alongside the row so `D1NoteRepository.save` / `.delete` can guard
    // against lost updates via `_occ_guard`.
    version: integer("version").notNull().default(0),
  },
  (table) => [
    // Partial unique index: only `status = 'active'` rows participate, so
    // a trashed row can share `(owner_id, slug)` with an active row.
    // The predicate text MUST stay byte-identical to migration
    // `0007_notes_slug_partial_unique.sql` — switching to a parameter
    // binding (e.g. `sql\`status = ${"active"}\``) makes SQLite's
    // partial-index matcher fail to align with the query plan and
    // queries that should use this index fall back to a seq scan.
    uniqueIndex("uniq_notes_owner_slug")
      .on(table.ownerId, table.slug)
      .where(sql`status = 'active'`),
    index("idx_notes_owner_status_updated").on(
      table.ownerId,
      table.status,
      desc(table.updatedAt),
    ),
    index("idx_notes_directory_status").on(
      table.directoryId,
      table.status,
      desc(table.updatedAt),
    ),
    index("idx_notes_trashed_at").on(table.trashedAt),
    index("idx_notes_edit_lock").on(table.editLockExpiresAt),
    check("notes_status_enum", sql`${table.status} IN ('active', 'trashed')`),
  ],
);

export const tags = sqliteTable(
  "tags",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    nameNormalized: text("name_normalized").notNull(),
    version: integer("version").notNull().default(0),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("uniq_tags_owner_name_normalized").on(
      table.ownerId,
      table.nameNormalized,
    ),
  ],
);

export const tagBlacklist = sqliteTable(
  "tag_blacklist",
  {
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    nameNormalized: text("name_normalized").notNull(),
    addedAt: text("added_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.ownerId, table.nameNormalized] })],
);

export const noteTags = sqliteTable(
  "note_tags",
  {
    noteId: text("note_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.noteId, table.tagId] }),
    index("idx_note_tags_tag_id").on(table.tagId),
  ],
);

export const noteInternalLinks = sqliteTable(
  "note_internal_links",
  {
    id: text("id").primaryKey(),
    fromNoteId: text("from_note_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    refKind: text("ref_kind").notNull(),
    refTarget: text("ref_target").notNull(),
    displayText: text("display_text"),
    resolvedNoteId: text("resolved_note_id").references(() => notes.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    index("idx_nil_from").on(table.fromNoteId),
    index("idx_nil_resolved").on(table.resolvedNoteId),
    index("idx_nil_target").on(table.refKind, table.refTarget),
    check("nil_ref_kind_enum", sql`${table.refKind} IN ('id', 'title')`),
    check(
      "nil_ref_target_length",
      sql`length(${table.refTarget}) >= 1 AND length(${table.refTarget}) <= 200`,
    ),
  ],
);

export const noteMediaRefs = sqliteTable(
  "note_media_refs",
  {
    noteId: text("note_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    // `media_id` references `media_assets(id) ON DELETE RESTRICT` —
    // declared in SQL only to avoid the declaration cycle with
    // `media_assets.owner_id → users.id` ↔ `users.avatar_media_id`.
    mediaId: text("media_id").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.noteId, table.mediaId] }),
    index("idx_nmr_media").on(table.mediaId),
  ],
);

// Issue #158: append-only history snapshots of `notes`. See migration
// `0011_note_revisions.sql` for index / FK rationale. Pruning is driven
// from the application layer using the per-note ceiling exposed by
// `AdminSettings.limits.maxNoteRevisionsPerNote`.
export const noteRevisions = sqliteTable(
  "note_revisions",
  {
    id: text("id").primaryKey(),
    noteId: text("note_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    contentHtml: text("content_html").notNull(),
    frontMatterJson: text("front_matter_json").notNull().default("{}"),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_note_revisions_note_created").on(
      table.noteId,
      desc(table.createdAt),
      desc(table.id),
    ),
    index("idx_note_revisions_owner").on(table.ownerId),
  ],
);

// ---------------------------------------------------------------------------
// Publication
// ---------------------------------------------------------------------------

export const publicationStates = sqliteTable(
  "publication_states",
  {
    noteId: text("note_id")
      .primaryKey()
      .references(() => notes.id, { onDelete: "cascade" }),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    visibility: text("visibility").notNull().default("private"),
    publishedAt: text("published_at"),
    updatedAt: text("updated_at").notNull(),
    version: integer("version").notNull().default(0),
  },
  (table) => [
    index("idx_pubs_visibility_owner").on(table.visibility, table.ownerId),
    index("idx_pubs_public_published_at").on(table.publishedAt),
    // owner-scoped public listing ordered by published_at (P30 公開日順):
    // the leading (owner_id, visibility) columns serve the equality filter
    // and published_at the ordered read-out, so the listing avoids a full
    // table scan.
    index("idx_pubs_owner_visibility_published_at").on(
      table.ownerId,
      table.visibility,
      table.publishedAt,
    ),
    check(
      "pubs_visibility_enum",
      sql`${table.visibility} IN ('private', 'unlisted', 'public')`,
    ),
  ],
);

export const shareLinks = sqliteTable(
  "share_links",
  {
    id: text("id").primaryKey(),
    noteId: text("note_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    passwordHash: text("password_hash"),
    status: text("status").notNull().default("active"),
    failedAttempts: integer("failed_attempts").notNull().default(0),
    lockedUntil: text("locked_until"),
    createdAt: text("created_at").notNull(),
    revokedAt: text("revoked_at"),
    lastAccessedAt: text("last_accessed_at"),
    updatedAt: text("updated_at").notNull(),
    version: integer("version").notNull().default(0),
  },
  (table) => [
    uniqueIndex("uniq_share_links_token_hash").on(table.tokenHash),
    index("idx_share_links_note_status").on(table.noteId, table.status),
    index("idx_share_links_locked_until").on(table.lockedUntil),
    check(
      "share_links_status_enum",
      sql`${table.status} IN ('active', 'revoked')`,
    ),
    check(
      "share_links_failed_attempts_nonneg",
      sql`${table.failedAttempts} >= 0`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Ingestion
// ---------------------------------------------------------------------------

export const ingestionJobs = sqliteTable(
  "ingestion_jobs",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    originalFileName: text("original_file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    kind: text("kind").notNull(),
    status: text("status").notNull(),
    tempStorageKey: text("temp_storage_key"),
    structurePromptOverride: text("structure_prompt_override"),
    metadataPromptOverride: text("metadata_prompt_override"),
    previewJson: text("preview_json"),
    errorCode: text("error_code"),
    errorReason: text("error_reason"),
    regenerationCount: integer("regeneration_count").notNull().default(0),
    savedAsNoteId: text("saved_as_note_id").references(() => notes.id, {
      onDelete: "set null",
    }),
    // OCC token column. The `IngestionJob` aggregate is updated through
    // the shared `TransactionalRepository` contract (see
    // `D1IngestionJobRepository`); matching the convention used by
    // `publication_states.version`.
    version: integer("version").notNull().default(0),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_ij_owner_status").on(
      table.ownerId,
      table.status,
      desc(table.updatedAt),
    ),
    index("idx_ij_status_updated").on(table.status, table.updatedAt),
    // Admin-wide listing sort key (P46 /admin/jobs). The composite
    // `(owner, status, updated_at)` indices above are useless once the
    // query drops the leading owner predicate, so a dedicated index on
    // `(updated_at DESC, id DESC)` keeps the all-owners scan bounded.
    index("idx_ij_updated_at").on(desc(table.updatedAt), desc(table.id)),
    // Dashboard 24h hourly aggregation (D1UsageMetricsProvider). The
    // `created_at >= windowStart` range predicate cannot use any of the
    // indices above (all lead with `owner`/`status`, not `created_at`), so
    // a dedicated index on `created_at` keeps the hourly scan bounded to
    // the 24h window instead of a full-table scan.
    index("idx_ij_created_at").on(table.createdAt),
    check("ij_byte_size_positive", sql`${table.byteSize} > 0`),
    check(
      "ij_status_enum",
      sql`${table.status} IN ('pending', 'processing', 'previewing', 'saved', 'failed', 'discarded')`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Media
// ---------------------------------------------------------------------------

export const mediaAssets = sqliteTable(
  "media_assets",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    mimeType: text("mime_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    backend: text("backend").notNull().default("r2"),
    storageKey: text("storage_key").notNull(),
    originalFileName: text("original_file_name"),
    width: integer("width"),
    height: integer("height"),
    durationMs: integer("duration_ms"),
    refCount: integer("ref_count").notNull().default(0),
    status: text("status").notNull().default("pending"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("uniq_media_storage_key").on(table.storageKey),
    index("idx_media_owner").on(table.ownerId, desc(table.createdAt)),
    index("idx_media_status_updated").on(table.status, table.updatedAt),
    check(
      "media_kind_enum",
      sql`${table.kind} IN ('image', 'video', 'avatar', 'source')`,
    ),
    check("media_ref_count_nonneg", sql`${table.refCount} >= 0`),
    check(
      "media_status_enum",
      sql`${table.status} IN ('pending', 'attached', 'orphan', 'deleting')`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const exportJobs = sqliteTable(
  "export_jobs",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    format: text("format").notNull(),
    scope: text("scope").notNull(),
    targetNoteIdsJson: text("target_note_ids_json").notNull().default("[]"),
    viewQueryJson: text("view_query_json"),
    optionsJson: text("options_json").notNull(),
    status: text("status").notNull(),
    artifactKey: text("artifact_key"),
    artifactSize: integer("artifact_size"),
    errorCode: text("error_code"),
    errorReason: text("error_reason"),
    progressProcessed: integer("progress_processed").notNull().default(0),
    progressTotal: integer("progress_total").notNull().default(0),
    failedNoteIdsJson: text("failed_note_ids_json").notNull().default("[]"),
    version: integer("version").notNull().default(0),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    completedAt: text("completed_at"),
    expiresAt: text("expires_at"),
  },
  (table) => [
    index("idx_export_jobs_owner_status").on(
      table.ownerId,
      table.status,
      desc(table.updatedAt),
    ),
    index("idx_export_jobs_expires_at").on(table.expiresAt),
    // Admin-wide listing sort key (P46 /admin/jobs). Mirrors
    // `idx_ij_updated_at` on ingestion_jobs.
    index("idx_export_jobs_updated_at").on(
      desc(table.updatedAt),
      desc(table.id),
    ),
    check(
      "export_jobs_format_enum",
      sql`${table.format} IN ('html', 'markdown', 'pdf')`,
    ),
    check(
      "export_jobs_scope_enum",
      sql`${table.scope} IN ('single', 'multiple', 'view')`,
    ),
    check(
      "export_jobs_status_enum",
      sql`${table.status} IN ('pending', 'processing', 'completed', 'failed', 'cancelled', 'expired')`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export const searchDocuments = sqliteTable(
  "search_documents",
  {
    noteId: text("note_id")
      .primaryKey()
      .references(() => notes.id, { onDelete: "cascade" }),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    visibility: text("visibility").notNull(),
    title: text("title").notNull(),
    bodyPlain: text("body_plain").notNull(),
    tagNamesJson: text("tag_names_json").notNull().default("[]"),
    directoryPath: text("directory_path").notNull().default(""),
    dateForCalendar: text("date_for_calendar").notNull(),
    updatedAt: text("updated_at").notNull(),
    indexedAt: text("indexed_at").notNull(),
  },
  (table) => [
    index("idx_sd_visibility_owner").on(
      table.visibility,
      table.ownerId,
      desc(table.dateForCalendar),
    ),
    check(
      "sd_visibility_enum",
      sql`${table.visibility} IN ('private', 'unlisted', 'public')`,
    ),
  ],
);

// FTS5 virtual table `search_documents_fts` cannot be expressed via
// drizzle's `sqliteTable`. The current definition (with `tokenize='trigram'`)
// lives in `migrations/0008_search_documents_fts_trigram.sql`; the initial
// `unicode61` definition in `0001_hollow_schema.sql` is dropped and
// recreated by `0008` as part of the Issue #50 CJK partial-match fix.
// The adapter accesses the virtual table through raw SQL when needed.

export const indexJobs = sqliteTable(
  "index_jobs",
  {
    id: text("id").primaryKey(),
    noteId: text("note_id").notNull(),
    op: text("op").notNull(),
    payloadJson: text("payload_json"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    enqueuedAt: text("enqueued_at").notNull(),
    processedAt: text("processed_at"),
  },
  (table) => [
    index("idx_index_jobs_enqueued").on(table.processedAt, table.enqueuedAt),
    check("index_jobs_op_enum", sql`${table.op} IN ('upsert', 'delete')`),
  ],
);

// ---------------------------------------------------------------------------
// View
// ---------------------------------------------------------------------------

export const savedViews = sqliteTable(
  "saved_views",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: text("kind").notNull(),
    queryJson: text("query_json").notNull(),
    displayMode: text("display_mode").notNull(),
    calendarDateKey: text("calendar_date_key").notNull(),
    sortJson: text("sort_json").notNull(),
    isDefault: integer("is_default").notNull().default(0),
    brokenConditionsJson: text("broken_conditions_json")
      .notNull()
      .default("[]"),
    version: integer("version").notNull().default(0),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("uniq_saved_views_owner_kind_name").on(
      table.ownerId,
      table.kind,
      table.name,
    ),
    check(
      "saved_views_kind_enum",
      sql`${table.kind} IN ('personal', 'public')`,
    ),
    check(
      "saved_views_display_mode_enum",
      sql`${table.displayMode} IN ('list', 'tile', 'calendar')`,
    ),
    check(
      "saved_views_calendar_date_key_enum",
      sql`${table.calendarDateKey} IN ('updated', 'created', 'frontMatterDate')`,
    ),
    check("saved_views_is_default_bool", sql`${table.isDefault} IN (0, 1)`),
  ],
);

// ---------------------------------------------------------------------------
// AdminSettings
// ---------------------------------------------------------------------------

export const instanceSettings = sqliteTable(
  "instance_settings",
  {
    id: text("id").primaryKey(),
    llmProvider: text("llm_provider").notNull().default("anthropic"),
    llmModel: text("llm_model").notNull(),
    llmBaseUrl: text("llm_base_url"),
    llmApiKeySource: text("llm_api_key_source").notNull(),
    llmApiKeyCiphertext: text("llm_api_key_ciphertext"),
    speechProvider: text("speech_provider").notNull().default("openai"),
    speechModel: text("speech_model"),
    speechApiKeySource: text("speech_api_key_source").notNull().default("env"),
    speechApiKeyCiphertext: text("speech_api_key_ciphertext"),
    promptsJson: text("prompts_json").notNull().default("{}"),
    designTokensJson: text("design_tokens_json").notNull().default("{}"),
    registrationOpen: integer("registration_open").notNull().default(1),
    registrationClosedReason: text("registration_closed_reason"),
    limitsJson: text("limits_json").notNull(),
    version: integer("version").notNull().default(0),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    check("instance_settings_singleton", sql`${table.id} = 'singleton'`),
    check(
      "instance_settings_key_source_enum",
      sql`${table.llmApiKeySource} IN ('env', 'db')`,
    ),
    check(
      "instance_settings_speech_key_source_enum",
      sql`${table.speechApiKeySource} IN ('env', 'db')`,
    ),
    check(
      "instance_settings_registration_open_bool",
      sql`${table.registrationOpen} IN (0, 1)`,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Activity log (admin dashboard "最近のアクティビティ" read-model)
// ---------------------------------------------------------------------------
//
// Event-sourced projection built by the queue consumer (ADR-001). Each row
// is a single activity entry derived 1:1 from a domain event. `event_id`
// is the unique idempotency key — projection handlers `insertIfAbsent`
// (`ON CONFLICT(event_id) DO NOTHING`) so at-least-once redelivery never
// produces a duplicate row (no count aggregation, ADR-005). Rows older than
// `ACTIVITY_LOG_RETENTION_DAYS` are pruned out-of-band (ADR-007).
export const activityLog = sqliteTable(
  "activity_log",
  {
    id: text("id").primaryKey(),
    // Source domain event id — natural idempotency key.
    eventId: text("event_id").notNull(),
    // Activity kind discriminator (application-level ActivityKind union).
    kind: text("kind").notNull(),
    // Actor user id when the event has one (nullable — system / job-driven
    // events may have no human actor).
    actorId: text("actor_id"),
    // Human-readable "対象" column (e.g. user handle, file name summary,
    // setting kind). Snapshotted at projection time.
    target: text("target").notNull().default(""),
    // Human-readable "詳細" column (e.g. error summary, locale, count).
    detail: text("detail").notNull().default(""),
    // Tag variant driving the UI: info / warning / error / success.
    severity: text("severity").notNull().default("info"),
    occurredAt: integer("occurred_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("uniq_activity_log_event_id").on(table.eventId),
    // Descending recent-first read path (`findRecent(limit)`).
    index("idx_activity_log_occurred_at").on(desc(table.occurredAt)),
    check(
      "activity_log_severity_enum",
      sql`${table.severity} IN ('info', 'warning', 'error', 'success')`,
    ),
  ],
);

// Intermediate burst-detection table for "大量アップロード" (ADR-005 方式A).
// Each `ingestion.created` is inserted 1:1 keyed on `event_id` (no count
// aggregation — re-delivery is a no-op). The "大量アップロード" activity row
// is derived at read time by counting distinct `event_id` per owner over a
// short window. High-frequency table — pruned at 24h retention (ADR-007).
export const ingestionBurstLog = sqliteTable(
  "ingestion_burst_log",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id").notNull(),
    ownerId: text("owner_id").notNull(),
    // UTC hour bucket ("YYYY-MM-DDTHH") — coarse grouping for the read-time
    // window aggregation (the precise burst window uses `occurred_at`).
    hourBucket: text("hour_bucket").notNull(),
    occurredAt: integer("occurred_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("uniq_ingestion_burst_log_event_id").on(table.eventId),
    index("idx_ingestion_burst_log_owner_occurred").on(
      table.ownerId,
      desc(table.occurredAt),
    ),
    index("idx_ingestion_burst_log_occurred_at").on(table.occurredAt),
  ],
);

export const userPromptOverrides = sqliteTable("user_prompt_overrides", {
  ownerId: text("owner_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  promptsJson: text("prompts_json").notNull().default("{}"),
  version: integer("version").notNull().default(0),
  updatedAt: text("updated_at").notNull(),
});

// Per-user fixed-window counter backing `D1PromptPreviewRateLimiter`.
// One row per `(user_id, window_start)` bucket, where
// `window_start = floor(now_ms / windowMs)`. See that class for the claim
// and opportunistic-pruning contract (ADR-009).
export const promptPreviewCounters = sqliteTable(
  "prompt_preview_counters",
  {
    userId: text("user_id").notNull(),
    windowStart: integer("window_start").notNull(),
    count: integer("count").notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.userId, table.windowStart] })],
);
