import type {
  UnitOfWorkContext,
  UnitOfWorkProvider,
} from "@/core/application/execution/unitOfWork";
import type { Clock } from "@/core/application/ports/clock";
import type { IdGenerator } from "@/core/application/ports/idGenerator";
import {
  NoopRelayTrigger,
  type RelayTrigger,
} from "@/core/application/ports/relayTrigger";
import {
  attachEventIds,
  type DomainEvent,
  EventId,
} from "@/core/domain/common/event";
import type { Database } from "./client";
import { PendingBatch } from "./pendingBatch";
import { D1CredentialStore } from "./repositories/credentialStore";
import { D1DirectoryRepository } from "./repositories/directoryRepository";
import { D1ExportJobRepository } from "./repositories/exportJobRepository";
import { isOccGuardViolation, mapDbError } from "./repositories/helpers";
import { D1IndexJobRepository } from "./repositories/indexJobRepository";
import { D1IngestionJobRepository } from "./repositories/ingestionJobRepository";
import { D1InstanceSettingsRepository } from "./repositories/instanceSettingsRepository";
import { D1MediaAssetRepository } from "./repositories/mediaAssetRepository";
import { D1NoteRepository } from "./repositories/noteRepository";
import { D1NoteRevisionRepository } from "./repositories/noteRevisionRepository";
import { D1OutboxRepository } from "./repositories/outboxRepository";
import { D1PublicationStateRepository } from "./repositories/publicationStateRepository";
import { D1SavedViewRepository } from "./repositories/savedViewRepository";
import { D1ShareLinkRepository } from "./repositories/shareLinkRepository";
import { D1TagBlacklistRepository } from "./repositories/tagBlacklistRepository";
import { D1TagMergeJobRepository } from "./repositories/tagMergeJobRepository";
import { D1TagRepository } from "./repositories/tagRepository";
import { D1UserPromptOverrideRepository } from "./repositories/userPromptOverrideRepository";
import { D1UserRepository } from "./repositories/userRepository";
import { D1VerificationChallenge } from "./repositories/verificationChallenge";

/**
 * D1 implementation of `UnitOfWorkProvider`.
 *
 * D1 has no interactive transactions, so a `db.transaction(fn)` shape
 * is impossible. The replacement is a deferred-batch model:
 *
 *   1. The caller's `fn` runs through to completion. Reads execute
 *      immediately against `db`; writes (and outbox events) accumulate
 *      on a `PendingBatch`.
 *
 *   2. After `fn` returns, a single `db.batch()` flushes everything
 *      atomically. If the batch fails because an OCC-guarded write
 *      matched zero rows (`_occ_guard` CHECK violation), the buffer's
 *      head conflict handler throws a domain-friendly
 *      `ConflictError("OPTIMISTIC_LOCK_FAILURE")`. Other driver errors
 *      are translated through `mapDbError`.
 *
 * Read-your-write within the same UoW is unsupported by design — see
 * `D1NoteRepository` for the rationale.
 *
 * No application-level retry: D1 surfaces transient conditions
 * (`SQLITE_BUSY` / `SQLITE_LOCKED`) as connection-level errors that
 * the binding handles upstream of this adapter, and OCC mismatches
 * are caller-visible signals rather than retry candidates.
 */
export class D1UnitOfWorkProvider implements UnitOfWorkProvider {
  constructor(
    private readonly db: Database,
    private readonly clock: Clock,
    private readonly idGenerator: IdGenerator,
    // Default to a no-op kicker so worker contexts (relay / consumer /
    // pruner / dlq) can construct the provider without service-binding
    // wiring. The request path overrides this with a real Service
    // Binding kicker in `app/core/application/di/serverCloudflare.ts`.
    private readonly relayTrigger: RelayTrigger = NoopRelayTrigger,
  ) {}

  async run<T>(fn: (ctx: UnitOfWorkContext) => Promise<T>): Promise<T> {
    const pending = new PendingBatch(this.db);
    const collected: DomainEvent[] = [];

    const mediaAssetRepository = new D1MediaAssetRepository(
      this.db,
      pending,
      this.idGenerator,
    );
    const tagRepository = new D1TagRepository(
      this.db,
      pending,
      this.idGenerator,
    );
    const tagBlacklistRepository = new D1TagBlacklistRepository(
      this.db,
      pending,
    );
    const tagMergeJobRepository = new D1TagMergeJobRepository(
      this.db,
      pending,
      this.idGenerator,
    );
    const publicationStateRepository = new D1PublicationStateRepository(
      this.db,
      pending,
      this.idGenerator,
    );
    const shareLinkRepository = new D1ShareLinkRepository(
      this.db,
      pending,
      this.idGenerator,
    );
    const ingestionJobRepository = new D1IngestionJobRepository(
      this.db,
      pending,
      this.idGenerator,
    );
    const userRepository = new D1UserRepository(
      this.db,
      pending,
      this.idGenerator,
    );
    const directoryRepository = new D1DirectoryRepository(
      this.db,
      pending,
      this.idGenerator,
    );
    const noteRepository = new D1NoteRepository(
      this.db,
      pending,
      this.idGenerator,
    );
    const noteRevisionRepository = new D1NoteRevisionRepository(
      this.db,
      pending,
    );
    const exportJobRepository = new D1ExportJobRepository(
      this.db,
      pending,
      this.idGenerator,
    );
    const savedViewRepository = new D1SavedViewRepository(
      this.db,
      pending,
      this.idGenerator,
    );
    const instanceSettingsRepository = new D1InstanceSettingsRepository(
      this.db,
      pending,
      this.clock,
    );
    const userPromptOverrideRepository = new D1UserPromptOverrideRepository(
      this.db,
      pending,
    );
    // Index jobs are dispatched out-of-band by an independent worker, so
    // the repository does not need to participate in the pending batch.
    // The slot still lives on the UoW context for symmetry, allowing
    // usecases to enqueue jobs alongside the aggregate write that
    // triggered them.
    const indexJobRepository = new D1IndexJobRepository(
      this.db,
      this.idGenerator,
      this.clock,
    );
    const verificationChallenge = new D1VerificationChallenge(
      this.db,
      pending,
      this.idGenerator,
      this.clock,
    );
    const credentialStore = new D1CredentialStore(
      this.db,
      pending,
      this.idGenerator,
      this.clock,
    );
    const outbox = new D1OutboxRepository(
      this.db,
      this.idGenerator,
      this.clock,
      pending,
    );

    const ctx: UnitOfWorkContext = {
      mediaAssetRepository,
      tagRepository,
      tagBlacklistRepository,
      tagMergeJobRepository,
      publicationStateRepository,
      shareLinkRepository,
      ingestionJobRepository,
      userRepository,
      directoryRepository,
      noteRepository,
      noteRevisionRepository,
      exportJobRepository,
      savedViewRepository,
      instanceSettingsRepository,
      userPromptOverrideRepository,
      indexJobRepository,
      verificationChallenge,
      credentialStore,
      // `EventId` is minted here, on the path between domain emission
      // and outbox persistence — keeping id generation a single
      // application-layer concern. Domain factories return identity-less
      // drafts; usecases never see `idGenerator`.
      collectEvents: (drafts) => {
        collected.push(
          ...attachEventIds(drafts, () =>
            EventId.create(this.idGenerator.next()),
          ),
        );
      },
    };

    const result = await fn(ctx);

    if (collected.length > 0) {
      await outbox.save(collected);
    }

    if (pending.isEmpty()) {
      // Nothing to flush — pure-read UoW. D1 rejects empty batches, so
      // exit before calling `db.batch()`.
      return result;
    }

    await mapDbError("Failed to commit unit of work", async () => {
      try {
        await this.db.batch(pending.build());
      } catch (error) {
        if (isOccGuardViolation(error)) {
          const handler = pending.firstConflictHandler();
          // Defensive: a guard violation without a registered handler
          // would mean the batch carried an `_occ_guard` statement
          // without an `addOcc` registration — i.e. the buffer was
          // built incorrectly. Throw the original error so the bug is
          // not swallowed.
          if (handler) handler();
        }
        throw error;
      }
    });

    // Post-commit only — kicking before the batch resolves would race
    // the relay against rows that may roll back. The kicker is
    // fire-and-forget; failures here do not affect usecase semantics.
    if (collected.length > 0) {
      this.relayTrigger.kick();
    }

    return result;
  }
}
