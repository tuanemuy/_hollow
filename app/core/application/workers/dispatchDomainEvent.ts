import type { DomainEvent } from "@/core/domain/common/event";
import { DirectoryId } from "@/core/domain/directory/valueObject";
import { isBusinessRuleError } from "@/core/domain/error";
import { ExportJobId as ExportJobIdVO } from "@/core/domain/export/valueObject";
import { UserId } from "@/core/domain/identity/valueObject";
import { isLLMRateLimitError } from "@/core/domain/ingestion/ports/llmProvider";
import { IngestionJobId as IngestionJobIdVO } from "@/core/domain/ingestion/valueObject";
import { MediaAssetId } from "@/core/domain/media/valueObject";
import type { NotePurgedEvent } from "@/core/domain/note/events";
import { NoteId } from "@/core/domain/note/valueObject";
import type { NoteSnapshot } from "@/core/domain/search/entity";
import { TagId } from "@/core/domain/tag/valueObject";
import type { ConsumerContainer } from "../di/types";
import type { IngestionJobId as IngestionJobIdDTO } from "../dto/ingestion";
import { NotFoundError } from "../errors";
import { handleUserDeletedEvent as exportHandleUserDeletedEvent } from "../export/handleUserDeletedEvent";
import { runExportJob } from "../export/runExportJob";
import { runIngestionJob } from "../ingestion/runIngestionJob";
import { handleNotePurgedEvent as mediaHandleNotePurgedEvent } from "../media/handleNotePurgedEvent";
import { handleLinkTargetResolution } from "../note/handleLinkTargetResolution";
import { handleLinkTargetTrashed } from "../note/handleLinkTargetTrashed";
import { handleNotePurgedEvent as publicationHandleNotePurgedEvent } from "../publication/handleNotePurgedEvent";
import { handleNoteTrashedEvent as publicationHandleNoteTrashedEvent } from "../publication/handleNoteTrashedEvent";
import { handleUserDeletedEvent as publicationHandleUserDeletedEvent } from "../publication/handleUserDeletedEvent";
import { buildNoteSnapshots } from "../search/buildNoteSnapshot";
import { handleNoteSavedEvent } from "../search/handleNoteSavedEvent";
import { handleNoteTrashedEvent as searchHandleNoteTrashedEvent } from "../search/handleNoteTrashedEvent";
import { handlePublicationChangedEvent } from "../search/handlePublicationChangedEvent";
import { handleDirectoryDeletedEvent as viewHandleDirectoryDeletedEvent } from "../view/handleDirectoryDeletedEvent";
import { handleNotePurgedEvent as viewHandleNotePurgedEvent } from "../view/handleNotePurgedEvent";
import { handleTagDeletedEvent as viewHandleTagDeletedEvent } from "../view/handleTagDeletedEvent";

/**
 * Outcome returned by `dispatchDomainEvent` to the queue handler glue.
 *
 * - `handled` — usecase ran (or the error was unrecoverable in a way
 *   that redelivery cannot fix). Queue message should be stamped + acked.
 * - `skipped` — the event type has no dispatch target. Treated the same
 *   way as `handled` by the consumer (stamp + ack), but kept as a
 *   distinct tag so unit tests can prove specific event types
 *   (e.g. `ingestion.previewAttached`) are intentionally not dispatched —
 *   regression guard against silent re-wiring.
 * - `retry` — a transient failure (D1 throw, `LLMRateLimitError`, any
 *   unexpected error). The consumer should call `message.retry()`
 *   without stamping so the next redelivery re-enters dispatch.
 */
export type DispatchOutcome =
  | { readonly kind: "handled" }
  | { readonly kind: "skipped" }
  | { readonly kind: "retry"; readonly error: unknown };

/**
 * Pure dispatch table for queue-delivered `DomainEvent`s.
 *
 * Routing:
 * - `ingestion.created` / `ingestion.retryRequested` /
 *   `ingestion.regenerated` → `runIngestionJob`
 * - `export.job.requested` / `export.job.retryRequested` → `runExportJob`
 * - `note.created` / `note.content_updated` / `note.renamed` /
 *   `note.moved` / `note.restored` / `note.tags_replaced` →
 *   `search.handleNoteSavedEvent` (re-build snapshot from `noteId` first).
 *   Additionally, for the title/id-affecting subset
 *   (`note.created` / `note.content_updated` / `note.renamed` /
 *   `note.restored`) → `note.handleLinkTargetResolution` (Issue #321),
 *   invoked before the search-snapshot early return so it runs even when
 *   the snapshot build skips. `moved` / `tags_replaced` are excluded
 *   because they change neither title nor id.
 * - `note.trashed` → fan-out to `search.handleNoteTrashedEvent` then
 *   `publication.handleNoteTrashedEvent` then `view.handleNotePurgedEvent`
 *   then `note.handleLinkTargetTrashed` (Issue #321 — unresolve link rows
 *   pointing at the trashed note; the FK set-null only fires on physical
 *   delete). (search-first so the delete index op is settled before
 *   publication emits `note.publish_changed`; view broken marker before
 *   the link unresolve because it does not depend on the others — see
 *   Issue #159 ADR-002, the view handler is reused for both trash and purge)
 * - `note.purged` → fan-out to `search.handleNoteTrashedEvent` then
 *   `publication.handleNotePurgedEvent` then `media.handleNotePurgedEvent`
 *   then `view.handleNotePurgedEvent` (Issue #159 ADR-001)
 * - `note.publish_changed` → `handlePublicationChangedEvent` (re-build
 *   snapshot first)
 * - `tag.deleted` → `view.handleTagDeletedEvent`
 * - `directory.deleted` → `view.handleDirectoryDeletedEvent` (Issue #181 —
 *   `Directory.DeleteDirectory` now emits a physical `directory.deleted`
 *   for every removed directory, including empty ones the `note.trashed`
 *   fan-out cannot cover; supersedes Issue #159 ADR-003 for directories).
 * - `user.deleted` → fan-out to `publication.handleUserDeletedEvent` then
 *   `export.handleUserDeletedEvent` (Issue #159 ADR-004)
 * - Everything else → `skipped` (`share_link.*`, `media.*`,
 *   `ingestion.previewAttached`, ...). `media.uploaded` remains skipped
 *   because its physical event is never emitted (Issue #159 ADR-003 —
 *   orphan monitoring is TTL/cron-based, not event-driven).
 *
 * Payload validation rule (Issue #159 ADR-005): for newly wired cases,
 * VO factories that validate payload fields the handlers will consume
 * are called at the head of the case BEFORE any handler is awaited.
 * This guarantees that a `BusinessRuleError` raised by payload schema
 * drift never lands between two side-effecting handlers (which would
 * leave a partial-commit state that no redelivery can recover, since
 * `handled+warn` ack-stamps the message).
 *
 * `ingestion.regenerated` IS now routed to `runIngestionJob` (Issue #253).
 * Issue #57 ADR-004 had intentionally excluded it because `regenerate`
 * transitioned `previewing → processing` directly, making the dispatch a
 * no-op against `runIngestionJob`'s `isPending` guard. Issue #253 reversed
 * that: `regenerate` now transitions `previewing → pending`, so the event
 * re-drives the LLM pipeline through the same path as admin retry (see
 * .issue/253/adr.md ADR-001 / ADR-002).
 *
 * Snapshot re-build is performed dispatcher-side (Issue #145 ADR-001)
 * because event payloads carry only `noteId` and the search handlers
 * require a full `NoteSnapshot`. `buildSnapshotByNoteId` opens a UoW,
 * calls `noteRepository.findById`, and returns `null` for three
 * skip-paths: row absent (purge race), `status === 'trashed'` (ADR-007
 * trashed status guard — prevents resurrection when `note.publish_changed`
 * is dispatched after `note.trashed`), and any rehydration failure
 * (propagated as a thrown error to the outer catch).
 *
 * Error classification (see ADR-005):
 * - `LLMRateLimitError` → `retry`. In the ingestion path, `runIngestionJob`
 *   rolls the job `processing → pending` before rethrowing (Issue #109),
 *   so the next redelivery passes the `isPending` guard and auto-re-drives
 *   the pipeline once the rate limit clears. A persistently throttled job
 *   eventually lands in the DLQ after `max_retries` (the queue's intended
 *   backoff behaviour, not a stall).
 * - `NotFoundError` (`INGESTION_JOB_NOT_FOUND` / `EXPORT_JOB_NOT_FOUND`)
 *   → `handled` — the row is gone, redelivery cannot resurrect it.
 *   Note: `runExportJob` swallows this internally, so the `EXPORT_JOB_NOT_FOUND`
 *   branch is effectively defensive code (kept symmetric with ingestion).
 * - `BusinessRuleError` → `handled` — VO factory throws on payload
 *   schema drift (e.g. empty `jobId`). Persistent shape mismatch will
 *   never recover via redelivery, so ack instead of looping until DLQ.
 *   Surfaces in `logger.warn` so an operator can spot drift.
 * - Anything else (D1 transient, UoW commit failure, etc.) → `retry`
 *   (queue backoff → eventually DLQ after `max_retries`).
 *
 * The container type is `ConsumerContainer` because the note.* /
 * publication.* routing needs `unitOfWorkProvider` (for snapshot rebuild)
 * plus the worker-only `indexJobRepository`. See ADR-001 (Issue #145)
 * for the responsibility-expansion boundary rationale.
 */
export async function dispatchDomainEvent(
  container: ConsumerContainer,
  event: DomainEvent,
): Promise<DispatchOutcome> {
  try {
    switch (event.type) {
      case "ingestion.created":
      case "ingestion.retryRequested":
      case "ingestion.regenerated": {
        const payload = event.payload as Readonly<{ jobId: string }>;
        // `IngestionJobId` is split into domain VO (validating brand)
        // and `dto/ingestion.IngestionJobId` (transport brand). Construct
        // via the VO factory so payload drift throws `BusinessRuleError`
        // here, then cross the domain↔application boundary explicitly
        // to satisfy the usecase's DTO parameter shape.
        const jobId = IngestionJobIdVO.create(
          payload.jobId,
        ) as unknown as IngestionJobIdDTO;
        await runIngestionJob({ container, input: { jobId } });
        return { kind: "handled" };
      }
      case "export.job.requested":
      case "export.job.retryRequested": {
        const payload = event.payload as Readonly<{ exportJobId: string }>;
        const jobId = ExportJobIdVO.create(payload.exportJobId);
        await runExportJob({ container, input: { jobId } });
        return { kind: "handled" };
      }
      case "note.created":
      case "note.content_updated":
      case "note.renamed":
      case "note.moved":
      case "note.restored":
      case "note.tags_replaced": {
        const payload = event.payload as Readonly<{ noteId: string }>;
        // Issue #321: re-resolve `note_internal_links.resolved_note_id`
        // on other notes when a link target is created / renamed /
        // restored (or its title changes via `content_updated`). This
        // runs in its own UoW with its own `findById` + active-status
        // guard, so it must be invoked BEFORE the search-snapshot early
        // return below (snapshot is `null` for absent/trashed notes, but
        // the resolution handler still needs to run — e.g. the title
        // change carried by `content_updated` for an active note). The
        // `moved` / `tags_replaced` events leave title and id unchanged,
        // so they are excluded from this fan-out (the title/id-keyed
        // resolution cannot change). NoteId VO is constructed before any
        // side effect (Issue #159 ADR-005).
        if (
          [
            "note.created",
            "note.content_updated",
            "note.renamed",
            "note.restored",
          ].includes(event.type)
        ) {
          await handleLinkTargetResolution({
            container,
            input: { noteId: NoteId.create(payload.noteId) },
          });
        }
        const snapshot = await buildSnapshotByNoteId(container, payload.noteId);
        if (snapshot === null) {
          container.logger.info(
            `[dispatch] skipping snapshot build for ${event.type} (note absent or trashed)`,
            {
              eventId: event.id,
              eventType: event.type,
              noteId: payload.noteId,
            },
          );
          return { kind: "handled" };
        }
        await handleNoteSavedEvent({ container, input: { snapshot } });
        return { kind: "handled" };
      }
      case "note.trashed": {
        const payload = event.payload as Readonly<{ noteId: string }>;
        // === Issue #159 ADR-005: validation 一括先行 ===
        // 複数 handler のある fan-out では、handler が参照する field を
        // 副作用呼出の前に全件 validate する。noteId の VO 化は既存
        // コードが担当しているため、ここで再確認することで partial-commit
        // リスク（validation 失敗が handler 呼出後に起こる）を排除。
        const noteId = NoteId.create(payload.noteId);
        // === handler 順次呼出（search → publication → view） ===
        // 各 handler が冪等で、publication は note.publish_changed を再 emit する
        // ため、search delete を先に済ませることで index を一貫性のある状態に
        // 保つ。view は last に実行（ADR-002 — note.purged と同じ handler を再利用）。
        await searchHandleNoteTrashedEvent({ container, input: { noteId } });
        await publicationHandleNoteTrashedEvent({
          container,
          input: { noteId },
        });
        await viewHandleNotePurgedEvent({
          container,
          input: { noteId: payload.noteId },
        });
        // Issue #321: unresolve every link row currently pointing at the
        // trashed note (FK set-null fires only on physical delete). Runs
        // last; independent of the other handlers and idempotent.
        await handleLinkTargetTrashed({ container, input: { noteId } });
        return { kind: "handled" };
      }
      case "note.purged": {
        const payload = event.payload as Readonly<{
          noteId: string;
          ownerId: string;
          mediaRefs: readonly string[];
        }>;
        // === Issue #159 ADR-005: validation 一括先行 ===
        // handler が参照する field を副作用呼出の前に全件 validate する。
        // payload schema drift で BusinessRuleError が後段 handler 呼出
        // 後に発生すると partial-commit が回復不能になるため。
        const noteId = NoteId.create(payload.noteId);
        void UserId.create(payload.ownerId);
        // validate-only, envelope は event cast で渡す
        void payload.mediaRefs.map((id) => MediaAssetId.create(id));
        // === handler 順次呼出 (search → publication → media → view) ===
        await searchHandleNoteTrashedEvent({ container, input: { noteId } });
        await publicationHandleNotePurgedEvent({
          container,
          input: { noteId },
        });
        await mediaHandleNotePurgedEvent({
          container,
          input: { event: event as NotePurgedEvent },
        });
        await viewHandleNotePurgedEvent({
          container,
          input: { noteId: payload.noteId },
        });
        return { kind: "handled" };
      }
      case "tag.deleted": {
        const payload = event.payload as Readonly<{ tagId: string }>;
        // validate-only — handler signature takes raw string but we want
        // schema drift to surface as BusinessRuleError before any side
        // effects (Issue #159 ADR-005).
        void TagId.create(payload.tagId);
        await viewHandleTagDeletedEvent({
          container,
          input: { tagId: payload.tagId },
        });
        return { kind: "handled" };
      }
      case "directory.deleted": {
        const payload = event.payload as Readonly<{ directoryId: string }>;
        // validate-only — handler signature takes raw string but we want
        // schema drift to surface as BusinessRuleError before any side
        // effects (Issue #159 ADR-005).
        void DirectoryId.create(payload.directoryId);
        await viewHandleDirectoryDeletedEvent({
          container,
          input: { directoryId: payload.directoryId },
        });
        return { kind: "handled" };
      }
      case "user.deleted": {
        const payload = event.payload as Readonly<{ userId: string }>;
        const userId = UserId.create(payload.userId);
        // fan-out: publication → export. Order per Issue #159 ADR-004
        // (publication first so "公開停止 → export 取消" logical order is
        // preserved). publication is idempotent (already-private notes
        // produce empty drafts) so retry replays cleanly.
        //
        // Issue #182: latency scales with the user's footprint (every
        // public note + in-flight export job), and a push consumer
        // invocation is capped at 30s CPU / 15min wall-clock. There is no
        // mid-flight visibility-timeout redelivery, so the only failure
        // mode is exceeding that cap and retrying the whole batch. Emit the
        // wall-clock `durationMs` so an operator can watch how close a heavy
        // user gets to the ceiling (.issue/182/adr.md records the deferred
        // mitigations). `startedAt` is after `UserId.create` so a payload
        // BusinessRuleError stays out of the measured span (#159 ADR-005).
        const startedAt = container.clock.now();
        await publicationHandleUserDeletedEvent({
          container,
          input: { userId },
        });
        await exportHandleUserDeletedEvent({
          container,
          input: { userId },
        });
        const durationMs =
          container.clock.now().getTime() - startedAt.getTime();
        container.logger.info("[dispatch] user.deleted fan-out complete", {
          eventId: event.id,
          userId: payload.userId,
          durationMs,
        });
        return { kind: "handled" };
      }
      case "note.publish_changed": {
        const payload = event.payload as Readonly<{ noteId: string }>;
        const snapshot = await buildSnapshotByNoteId(container, payload.noteId);
        if (snapshot === null) {
          container.logger.info(
            "[dispatch] skipping snapshot build for note.publish_changed (note absent or trashed)",
            {
              eventId: event.id,
              eventType: event.type,
              noteId: payload.noteId,
            },
          );
          return { kind: "handled" };
        }
        await handlePublicationChangedEvent({
          container,
          input: { snapshot },
        });
        return { kind: "handled" };
      }
      default:
        return { kind: "skipped" };
    }
  } catch (error) {
    if (isLLMRateLimitError(error)) {
      return { kind: "retry", error };
    }
    if (error instanceof NotFoundError) {
      return { kind: "handled" };
    }
    if (isBusinessRuleError(error)) {
      // Payload schema drift (e.g. empty jobId from a relay-side change)
      // — never recovers via redelivery; ack to avoid a retry loop.
      container.logger.warn(
        `[dispatch] business-rule violation for ${event.type}, acking to skip retry loop`,
        { eventId: event.id, eventType: event.type, cause: error },
      );
      return { kind: "handled" };
    }
    return { kind: "retry", error };
  }
}

/**
 * Re-build a `NoteSnapshot` from a raw `noteId` string for the search
 * handlers. The snapshot is computed via `buildNoteSnapshots` against
 * the live aggregate — so consume-time data (latest title / body / tags
 * / publication visibility) flows into the index even when the event
 * payload was captured earlier.
 *
 * Returns `null` when:
 * - the note row is absent (e.g. trash → purge ran before this dispatch)
 * - the note is `status === 'trashed'` (ADR-007 trashed status guard:
 *   the search index must never carry trashed notes, even if a stale
 *   `note.publish_changed` arrives after `note.trashed`)
 *
 * The caller treats `null` as a handled-and-skip outcome (with an
 * `info` log) rather than a retry — neither condition recovers via
 * queue redelivery.
 */
async function buildSnapshotByNoteId(
  container: ConsumerContainer,
  noteIdRaw: string,
): Promise<NoteSnapshot | null> {
  const noteId = NoteId.create(noteIdRaw);
  return container.unitOfWorkProvider.run(async (ctx) => {
    const versioned = await ctx.noteRepository.findById(noteId);
    if (versioned === null) return null;
    if (versioned.entity.status === "trashed") return null;
    const snapshots = await buildNoteSnapshots([versioned.entity], {
      directoryRepository: ctx.directoryRepository,
      tagRepository: ctx.tagRepository,
      publicationStateRepository: ctx.publicationStateRepository,
      htmlSanitizer: container.htmlSanitizer,
    });
    return snapshots[0] ?? null;
  });
}
