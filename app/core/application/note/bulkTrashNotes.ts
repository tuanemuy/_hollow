import { isBusinessRuleError } from "@/core/domain/error";
import type { UserId } from "@/core/domain/identity/valueObject";
import type { NoteId } from "@/core/domain/note/valueObject";
import { isApplicationError } from "../errors";
import type { ServiceArgs } from "../types";
import { deleteNote } from "./deleteNote";

export type BulkTrashNotesInput = Readonly<{
  actorUserId: UserId;
  noteIds: readonly NoteId[];
}>;

export type BulkTrashNoteFailure = Readonly<{
  noteId: NoteId;
  code: string;
  message: string;
}>;

export type BulkTrashNotesOutput = Readonly<{
  successCount: number;
  failures: readonly BulkTrashNoteFailure[];
}>;

function describeFailure(noteId: NoteId, error: unknown): BulkTrashNoteFailure {
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
