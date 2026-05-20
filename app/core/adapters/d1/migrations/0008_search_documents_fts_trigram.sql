-- Issue #50: switch `search_documents_fts` tokenizer from the default
-- `unicode61` to `trigram` so CJK partial-match queries (e.g. `デザイン`
-- contained inside `デザイン原則` / `デザインメモ`) actually hit. The
-- default `unicode61` tokenizes a run of CJK characters as a single
-- token, which makes substring search structurally impossible.
--
-- Trigram has one essential constraint that `unicode61` did not: query
-- tokens shorter than 3 Unicode codepoints cannot match anything. That
-- gap against the domain's `SearchKeyword.create` (min length 1) is
-- absorbed inside the adapter (`buildMatchExpression` in `searchIndex.ts`),
-- not here.
--
-- FTS5 virtual tables and triggers are owned by raw SQL (drizzle does
-- not manage them — see the schema.ts note). Modifying `0001_*.sql` in
-- place would desync the migration set against environments that have
-- already applied it; instead we drop and recreate the virtual table
-- here, then rebuild the index from the host `search_documents` rows.
--
-- The three sync triggers are reapplied verbatim from
-- `0001_hollow_schema.sql:391-406`. Keeping the trigger bodies
-- mechanically identical is intentional: this migration changes only
-- the tokenizer, not the host-to-FTS sync semantics. If the trigger
-- bodies need to diverge in the future, split that into its own
-- migration so the DDL stays self-evident.

DROP TRIGGER IF EXISTS `search_documents_ai`;
DROP TRIGGER IF EXISTS `search_documents_ad`;
DROP TRIGGER IF EXISTS `search_documents_au`;

DROP TABLE IF EXISTS `search_documents_fts`;

-- `IF NOT EXISTS` is defensive: combined with the `DROP TABLE IF EXISTS`
-- above, a partially-applied migration that crashed between the drop
-- and the create can be re-run idempotently.
CREATE VIRTUAL TABLE IF NOT EXISTS `search_documents_fts` USING fts5(
        `title`,
        `body_plain`,
        `tag_names_json`,
        content='search_documents',
        content_rowid='rowid',
        tokenize='trigram'
);

-- `IF NOT EXISTS` mirrors the `IF NOT EXISTS` on the virtual table above:
-- the preceding `DROP TRIGGER IF EXISTS` makes re-creation safe in the
-- happy path, and these clauses keep the migration uniformly idempotent.
-- Trigger bodies are copied verbatim from `0001_hollow_schema.sql:391-406`.
CREATE TRIGGER IF NOT EXISTS `search_documents_ai` AFTER INSERT ON `search_documents` BEGIN
        INSERT INTO `search_documents_fts`(`rowid`, `title`, `body_plain`, `tag_names_json`)
                VALUES (NEW.rowid, NEW.`title`, NEW.`body_plain`, NEW.`tag_names_json`);
END;

CREATE TRIGGER IF NOT EXISTS `search_documents_ad` AFTER DELETE ON `search_documents` BEGIN
        INSERT INTO `search_documents_fts`(`search_documents_fts`, `rowid`, `title`, `body_plain`, `tag_names_json`)
                VALUES ('delete', OLD.rowid, OLD.`title`, OLD.`body_plain`, OLD.`tag_names_json`);
END;

CREATE TRIGGER IF NOT EXISTS `search_documents_au` AFTER UPDATE ON `search_documents` BEGIN
        INSERT INTO `search_documents_fts`(`search_documents_fts`, `rowid`, `title`, `body_plain`, `tag_names_json`)
                VALUES ('delete', OLD.rowid, OLD.`title`, OLD.`body_plain`, OLD.`tag_names_json`);
        INSERT INTO `search_documents_fts`(`rowid`, `title`, `body_plain`, `tag_names_json`)
                VALUES (NEW.rowid, NEW.`title`, NEW.`body_plain`, NEW.`tag_names_json`);
END;

-- Repopulate the FTS index from the host table. External-content FTS5
-- supports rebuilding via the special command
-- `INSERT INTO search_documents_fts(search_documents_fts) VALUES('rebuild')`,
-- but the explicit SELECT form below makes the intent legible from the
-- SQL alone (the two are semantically equivalent).
INSERT INTO `search_documents_fts`(`rowid`, `title`, `body_plain`, `tag_names_json`)
        SELECT `rowid`, `title`, `body_plain`, `tag_names_json` FROM `search_documents`;
