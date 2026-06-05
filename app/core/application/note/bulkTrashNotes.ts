import { isBusinessRuleError } from "@/core/domain/error";
import { isApplicationError } from "../errors";
import type { ServiceArgs } from "../types";
import { deleteNote } from "./deleteNote";

export type BulkTrashNotesInput = Readonly<{
  actorUserId: string;
  noteIds: readonly string[];
}>;

export type BulkTrashNoteFailure = Readonly<{
  noteId: string;
  code: string;
  message: string;
}>;

export type BulkTrashNotesOutput = Readonly<{
  successCount: number;
  failures: readonly BulkTrashNoteFailure[];
}>;

function describeFailure(noteId: string, error: unknown): BulkTrashNoteFailure {
  if (isApplicationError(error) || isBusinessRuleError(error)) {
    return { noteId, code: error.code, message: error.message };
  }
  return {
    noteId,
    code: "UNKNOWN_ERROR",
    message: error instanceof Error ? error.message : String(error),
  };
}

export async function bulkTrashNotes({
  container,
  input,
}: ServiceArgs<BulkTrashNotesInput>): Promise<BulkTrashNotesOutput> {
  let successCount = 0;
  const failures: BulkTrashNoteFailure[] = [];
  for (const noteId of input.noteIds) {
    try {
      await deleteNote({
        container,
        input: { actorUserId: input.actorUserId, noteId },
      });
      successCount += 1;
    } catch (error) {
      failures.push(describeFailure(noteId, error));
    }
  }
  return { successCount, failures };
}
