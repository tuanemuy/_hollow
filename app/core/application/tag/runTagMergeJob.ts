import type { UserId } from "@/core/domain/identity/valueObject";
import { Note as NoteEntity } from "@/core/domain/note/entity";
import type { NoteRepository } from "@/core/domain/note/ports/noteRepository";
import type { NoteId } from "@/core/domain/note/valueObject";
import { TagEvents } from "@/core/domain/tag/events";
import { TagMergeJob } from "@/core/domain/tag/mergeJob/entity";
import { TagMergeJobId } from "@/core/domain/tag/mergeJob/valueObject";
import type { TagId } from "@/core/domain/tag/valueObject";
import { isConflictError, isNotFoundError } from "../errors";
import type { ServiceArgs } from "../types";
import { type TagMergeJobDTO, toTagMergeJobView } from "./view";

const MERGE_NOTE_PAGE_SIZE = 500;

export type RunTagMergeJobInput = Readonly<{
  jobId: string;
  // Test seam: batch size for the snapshot scan and note-processing loop.
  // Production always uses `MERGE_NOTE_PAGE_SIZE` (500) — the dispatch path
  // never sets this. Integration tests lower it to exercise the
  // multi-batch progress path without seeding 500+ notes.
  pageSize?: number;
}>;

export type RunTagMergeJobOutput = Readonly<{
  job: TagMergeJobDTO | null;
}>;

type Container = ServiceArgs<RunTagMergeJobInput>["container"];

type PreparedRun = Readonly<{
  kind: "run";
  ownerId: UserId;
  sourceTagId: TagId;
  targetTagId: TagId;
  total: number;
  baseProcessed: number;
  workIds: readonly NoteId[];
}>;

type Prepared =
  | null
  | Readonly<{ kind: "done"; job: TagMergeJob }>
  | PreparedRun;

/**
 * Worker-side tag-merge pipeline. Moves the note-rewriting + source-tag
 * deletion off the synchronous request path. The lifecycle is split
 * across independent UoW boundaries so each progress update commits on
 * its own — a worker crash mid-merge leaves the job in `processing`, and
 * the next dispatch idempotently resumes the remaining work.
 *
 * Crash-resume (ADR-006): the runner branches on Pending vs Processing.
 * Pending seeds `total` from the snapshot of source-holding notes;
 * Processing re-entry re-uses the persisted `total` (never re-seeds it)
 * and advances `processed` forward only, so the bar never moves
 * backward. The note rewrite (`replaceTags`) is a no-op for notes that
 * already carry the target tag, so re-scanning the remaining
 * source-holding notes naturally picks up only the unfinished work.
 *
 * Work-set snapshotting (arch P-001): the runner first reads the full set
 * of source-holding note ids (read-only) and then processes that fixed
 * list. Interleaving offset-paging with mutation would skip notes (a
 * rewritten note drops out of the `tagIds=[source]` result set, shifting
 * later notes up past the advancing offset), losing data — AC-5.
 */
export async function runTagMergeJob({
  container,
  input,
}: ServiceArgs<RunTagMergeJobInput>): Promise<RunTagMergeJobOutput> {
  const jobId = TagMergeJobId.create(input.jobId);
  const pageSize = input.pageSize ?? MERGE_NOTE_PAGE_SIZE;

  const prepared = await prepareProcessing(container, jobId, pageSize);
  if (prepared === null) return { job: null };
  if (prepared.kind === "done") {
    return { job: toTagMergeJobView(prepared.job) };
  }

  const { sourceTagId, targetTagId, total, baseProcessed, workIds } = prepared;

  try {
    const affectedIds = await processBatches(container, jobId, {
      sourceTagId,
      targetTagId,
      workIds,
      baseProcessed,
      total,
      pageSize,
    });
    const completed = await finalize(
      container,
      jobId,
      sourceTagId,
      affectedIds,
    );
    return { job: completed === null ? null : toTagMergeJobView(completed) };
  } catch (error) {
    const failed = await failJob(
      container,
      jobId,
      "tag_merge_run_failed",
      describe(error),
    );
    return { job: failed === null ? null : toTagMergeJobView(failed) };
  }
}

async function prepareProcessing(
  container: Container,
  jobId: TagMergeJobId,
  pageSize: number,
): Promise<Prepared> {
  const now = container.clock.now();
  return container.unitOfWorkProvider.run(
    async ({ tagMergeJobRepository, noteRepository }) => {
      const found = await tagMergeJobRepository.findById(jobId);
      if (found === null) return null;
      const job = found.entity;
      if (TagMergeJob.isCompleted(job) || TagMergeJob.isFailed(job)) {
        return { kind: "done", job } as const;
      }

      // Read-only snapshot of the work set BEFORE any mutation.
      const workIds = await collectSourceNoteIds(
        noteRepository,
        job.ownerId,
        job.sourceTagId,
        pageSize,
      );

      if (TagMergeJob.isPending(job)) {
        const started = TagMergeJob.startProcessing(job, workIds.length, now);
        await tagMergeJobRepository.save(started, found.expectedVersion);
        return {
          kind: "run",
          ownerId: job.ownerId,
          sourceTagId: job.sourceTagId,
          targetTagId: job.targetTagId,
          total: workIds.length,
          baseProcessed: 0,
          workIds,
        } satisfies PreparedRun;
      }

      // Processing re-entry (crash resume): keep the persisted total and
      // advance forward only. `total - remaining` is how many notes were
      // already merged; never re-seed the denominator (bar逆行防止).
      const total = job.progress.total;
      const remaining = workIds.length;
      const baseProcessed = Math.min(
        total,
        Math.max(job.progress.processed, total - remaining),
      );
      return {
        kind: "run",
        ownerId: job.ownerId,
        sourceTagId: job.sourceTagId,
        targetTagId: job.targetTagId,
        total,
        baseProcessed,
        workIds,
      } satisfies PreparedRun;
    },
  );
}

async function processBatches(
  container: Container,
  jobId: TagMergeJobId,
  params: {
    sourceTagId: TagId;
    targetTagId: TagId;
    workIds: readonly NoteId[];
    baseProcessed: number;
    total: number;
    pageSize: number;
  },
): Promise<readonly NoteId[]> {
  const { sourceTagId, targetTagId, workIds, baseProcessed, total, pageSize } =
    params;
  const affectedIds: NoteId[] = [];
  let inspected = 0;

  for (let i = 0; i < workIds.length; i += pageSize) {
    const batch = workIds.slice(i, i + pageSize);
    const now = container.clock.now();
    const result = await container.unitOfWorkProvider.run(
      async ({ noteRepository, tagMergeJobRepository, collectEvents }) => {
        const found = await tagMergeJobRepository.findById(jobId);
        // Another run (twin or resume) finished or failed the job; stop.
        if (found === null || !TagMergeJob.isProcessing(found.entity)) {
          return { stop: true, affected: [] as NoteId[], inspectedInBatch: 0 };
        }
        const affectedInBatch: NoteId[] = [];
        let inspectedInBatch = 0;
        for (const noteId of batch) {
          // Count every inspected note, including no-ops, so the bar
          // reaches 100% (arch S-003).
          inspectedInBatch += 1;
          const versioned = await noteRepository.findById(noteId);
          if (!versioned) continue;
          const current = versioned.entity;
          const nextTags = mergeTagSets(
            current.tagIds,
            sourceTagId,
            targetTagId,
          );
          const { entity: updated, eventDrafts } = NoteEntity.replaceTags(
            current,
            nextTags,
            now,
          );
          if (eventDrafts.length === 0) continue;
          await noteRepository.save(updated, versioned.expectedVersion);
          collectEvents(eventDrafts);
          affectedInBatch.push(updated.id);
        }
        const processedSoFar = Math.min(
          total,
          baseProcessed + inspected + inspectedInBatch,
        );
        const progressed = TagMergeJob.recordProgress(
          found.entity,
          processedSoFar,
          now,
        );
        await tagMergeJobRepository.save(progressed, found.expectedVersion);
        return { stop: false, affected: affectedInBatch, inspectedInBatch };
      },
    );
    if (result.stop) break;
    affectedIds.push(...result.affected);
    inspected += result.inspectedInBatch;
  }

  return affectedIds;
}

async function finalize(
  container: Container,
  jobId: TagMergeJobId,
  sourceTagId: TagId,
  affectedIds: readonly NoteId[],
): Promise<TagMergeJob | null> {
  const now = container.clock.now();
  try {
    return await container.unitOfWorkProvider.run(
      async ({ tagMergeJobRepository, tagRepository, collectEvents }) => {
        const found = await tagMergeJobRepository.findById(jobId);
        if (found === null) return null;
        if (!TagMergeJob.isProcessing(found.entity)) return found.entity;

        const sourceFound = await tagRepository.findById(sourceTagId);
        if (sourceFound !== null) {
          await tagRepository.delete(sourceTagId, sourceFound.expectedVersion);
          collectEvents([
            TagEvents.deleted(sourceTagId, sourceFound.entity.name, now),
          ]);
        }
        const completed = TagMergeJob.complete(found.entity, affectedIds, now);
        await tagMergeJobRepository.save(completed, found.expectedVersion);
        return completed;
      },
    );
  } catch (error) {
    // A concurrent twin run deleted the source first → our OCC delete
    // conflicts (or the row is already gone). The merge is actually done,
    // so complete idempotently instead of failing (ADR-006 S-003).
    if (isConflictError(error) || isNotFoundError(error)) {
      return completeWithoutSourceDelete(container, jobId, affectedIds);
    }
    throw error;
  }
}

async function completeWithoutSourceDelete(
  container: Container,
  jobId: TagMergeJobId,
  affectedIds: readonly NoteId[],
): Promise<TagMergeJob | null> {
  const now = container.clock.now();
  return container.unitOfWorkProvider.run(async ({ tagMergeJobRepository }) => {
    const found = await tagMergeJobRepository.findById(jobId);
    if (found === null) return null;
    if (!TagMergeJob.isProcessing(found.entity)) return found.entity;
    const completed = TagMergeJob.complete(found.entity, affectedIds, now);
    await tagMergeJobRepository.save(completed, found.expectedVersion);
    return completed;
  });
}

async function failJob(
  container: Container,
  jobId: TagMergeJobId,
  code: string,
  reason: string,
): Promise<TagMergeJob | null> {
  const now = container.clock.now();
  return container.unitOfWorkProvider.run(async ({ tagMergeJobRepository }) => {
    const found = await tagMergeJobRepository.findById(jobId);
    if (found === null) return null;
    if (
      !TagMergeJob.isPending(found.entity) &&
      !TagMergeJob.isProcessing(found.entity)
    ) {
      return found.entity;
    }
    const failed = TagMergeJob.fail(found.entity, code, reason, now);
    await tagMergeJobRepository.save(failed, found.expectedVersion);
    return failed;
  });
}

/**
 * Set-union of a note's tag ids that replaces `source` with `target`,
 * de-duplicating and ensuring `target` is present. Pure.
 */
function mergeTagSets(
  current: readonly TagId[],
  source: TagId,
  target: TagId,
): readonly TagId[] {
  const seen = new Set<string>();
  const out: TagId[] = [];
  for (const id of current) {
    if (id === source) {
      if (!seen.has(target)) {
        seen.add(target);
        out.push(target);
      }
      continue;
    }
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  if (!seen.has(target)) {
    out.push(target);
  }
  return out;
}

/**
 * Read-only full snapshot of the note ids that still carry `tagId`. A
 * plain paginated scan with no interleaved mutation — the caller processes
 * the returned fixed list, so no note is skipped (arch P-001).
 */
async function collectSourceNoteIds(
  noteRepository: NoteRepository,
  ownerId: UserId,
  tagId: TagId,
  pageSize: number,
): Promise<readonly NoteId[]> {
  const all: NoteId[] = [];
  let offset = 0;
  while (true) {
    const notes = await noteRepository.findByOwner(ownerId, {
      limit: pageSize,
      offset,
      tagIds: [tagId],
    });
    if (notes.length === 0) break;
    for (const note of notes) all.push(note.id);
    if (notes.length < pageSize) break;
    offset += notes.length;
  }
  return all;
}

function describe(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}
