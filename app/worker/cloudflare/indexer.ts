import type {
  ExecutionContext,
  ScheduledController,
} from "@cloudflare/workers-types";
import { type IndexerEnv, runIndexJobTick } from "./handlers";

export type { IndexerEnv } from "./handlers";

// Cron-driven drainer for `index_jobs`. The producer side is the
// queue consumer's dispatch (note.* / publication.* → IndexJob enqueue
// in the same UoW as the source aggregate write); this worker pulls
// those rows out and forwards them to `SearchService.applyUpsert /
// applyDelete` via `consumeIndexJob`. See `docs/runtime_cloudflare.md`
// for the deploy ordering (consumer → indexer → relay → app).
export default {
  async scheduled(
    _controller: ScheduledController,
    env: IndexerEnv,
    ctx: ExecutionContext,
  ): Promise<void> {
    ctx.waitUntil(runIndexJobTick(env));
  },
};
