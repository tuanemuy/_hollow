import { applyD1Migrations, env } from "cloudflare:test";
import { afterEach, beforeAll, beforeEach, expect } from "vitest";

// Each integration test file shares a single Workers isolate (configured
// via `singleWorker: true`). Migrations run once per file, then each test
// gets a clean slate via TRUNCATE. D1 has no transaction-rollback escape
// hatch we can wrap a test in, so per-test isolation is achieved by
// explicit deletion of all rows.
beforeAll(async () => {
  await applyD1Migrations(env.DB, env.MIGRATIONS);
});

const CLEAN_STATEMENTS: ReadonlyArray<readonly [label: string, sql: string]> = [
  ["outbox_events", "DELETE FROM outbox_events"],
  ["processed_events", "DELETE FROM processed_events"],
  ["index_jobs", "DELETE FROM index_jobs"],
  ["instance_settings", "DELETE FROM instance_settings"],
  ["note_internal_links", "DELETE FROM note_internal_links"],
  ["note_media_refs", "DELETE FROM note_media_refs"],
  ["note_revisions", "DELETE FROM note_revisions"],
  ["note_tags", "DELETE FROM note_tags"],
  ["search_documents", "DELETE FROM search_documents"],
  ["publication_states", "DELETE FROM publication_states"],
  ["share_links", "DELETE FROM share_links"],
  ["saved_views", "DELETE FROM saved_views"],
  ["ingestion_jobs", "DELETE FROM ingestion_jobs"],
  ["export_jobs", "DELETE FROM export_jobs"],
  ["user_prompt_overrides", "DELETE FROM user_prompt_overrides"],
  [
    "users.avatar_media_id reset",
    "UPDATE users SET avatar_media_id = NULL WHERE avatar_media_id IS NOT NULL",
  ],
  ["media_assets", "DELETE FROM media_assets"],
  ["notes", "DELETE FROM notes"],
  ["tags", "DELETE FROM tags"],
  ["tag_blacklist", "DELETE FROM tag_blacklist"],
  // `directories.parent_id` is ON DELETE RESTRICT — handled separately
  // below by iterating leaf-deletes until the table empties.
];

beforeEach(async () => {
  // Drop owner-scoped state in the right order so the RESTRICT FKs on
  // `directories.parent_id` and `note_media_refs.media_id` don't trip,
  // and the `users_avatar_media_assets_set_null` trigger has nothing
  // to chase. Per-statement order matters: leaves before roots. Run
  // sequentially (not as a batch) so a failure surfaces the specific
  // statement that tripped the constraint.
  //
  // `_occ_guard` is intentionally untouched — the CHECK keeps it empty
  // by construction and the afterEach hook below asserts so.
  for (const [label, sql] of CLEAN_STATEMENTS) {
    try {
      await env.DB.prepare(sql).run();
    } catch (cause) {
      throw new Error(`integration cleanup failed at: ${label} (${sql})`, {
        cause,
      });
    }
  }
  // Iteratively delete `directories` from leaves to roots so the
  // `parent_id` RESTRICT FK never trips. Bounded loop to surface bugs.
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const { results } = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM directories",
    ).all<{ n: number }>();
    if ((results[0]?.n ?? 0) === 0) break;
    await env.DB.prepare(
      "DELETE FROM directories WHERE id NOT IN (SELECT parent_id FROM directories WHERE parent_id IS NOT NULL)",
    ).run();
  }
  // Now the user-FK tables (accounts, sessions, etc.) and `users` itself.
  await env.DB.batch([
    env.DB.prepare("DELETE FROM accounts"),
    env.DB.prepare("DELETE FROM sessions"),
    env.DB.prepare("DELETE FROM verifications"),
    env.DB.prepare("DELETE FROM users"),
  ]);
});

// `_occ_guard` must stay empty by construction: the CHECK (`n > 0`) aborts
// the batch the moment a guard row with `n = 0` is attempted, so no row
// can ever persist on either the success or conflict path. A non-empty
// table means the CHECK was bypassed (schema regression, migration drift)
// — exactly the class of bug a blanket `DELETE FROM _occ_guard` in setup
// would have silently swept under the rug.
afterEach(async () => {
  const { results } = await env.DB.prepare("SELECT 1 FROM _occ_guard").all();
  expect(results).toHaveLength(0);
});
