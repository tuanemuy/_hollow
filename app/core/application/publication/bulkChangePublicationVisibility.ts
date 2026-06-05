import type { ServiceArgs } from "../types";
import {
  changePublicationVisibility,
  type Visibility,
} from "./changePublicationVisibility";

export type BulkChangePublicationVisibilityInput = Readonly<{
  actorUserId: string;
  noteIds: readonly string[];
  nextVisibility: Visibility;
}>;

export type BulkChangeFailure = Readonly<{
  noteId: string;
  reason: string;
}>;

export type BulkChangePublicationVisibilityOutput = Readonly<{
  successCount: number;
  failures: readonly BulkChangeFailure[];
}>;

/**
 * Apply a visibility change to a batch of notes.
 *
 * Each note is processed in its own UoW so a single failure does not
 * abort the batch; per-note errors are surfaced in `failures`. This is
 * intentionally sequential — D1 batches per UoW would otherwise
 * compete for the same `_occ_guard` row, and the spec calls for
 * "失敗は集計" (collect failures), not "atomic across the batch".
 */
export async function bulkChangePublicationVisibility({
  container,
  input,
}: ServiceArgs<BulkChangePublicationVisibilityInput>): Promise<BulkChangePublicationVisibilityOutput> {
  let successCount = 0;
  const failures: BulkChangeFailure[] = [];

  for (const noteId of input.noteIds) {
    try {
      await changePublicationVisibility({
        container,
        input: {
          actorUserId: input.actorUserId,
          noteId,
          nextVisibility: input.nextVisibility,
        },
      });
      successCount += 1;
    } catch (error) {
      failures.push({
        noteId,
        reason: describeFailure(error),
      });
    }
  }

  return { successCount, failures };
}

function describeFailure(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return String(error);
}
