import type { DirectoryId } from "@/core/domain/directory/valueObject";
import { isBusinessRuleError } from "@/core/domain/error";
import type { UserId } from "@/core/domain/identity/valueObject";
import type { NoteId } from "@/core/domain/note/valueObject";
import { isApplicationError } from "../errors";
import type { ServiceArgs } from "../types";
import { moveNote } from "./moveNote";

export type BulkMoveNotesInput = Readonly<{
  actorUserId: UserId;
  noteIds: readonly NoteId[];
  newDirectoryId: DirectoryId;
}>;

export type BulkMoveNoteFailure = Readonly<{
  noteId: NoteId;
  code: string;
  message: string;
}>;

export type BulkMoveNotesOutput = Readonly<{
  successCount: number;
  failures: readonly BulkMoveNoteFailure[];
}>;

function describeFailure(noteId: NoteId, error: unknown): BulkMoveNoteFailure {
  if (isApplicationError(error) || isBusinessRuleError(error)) {
    return { noteId, code: error.code, message: error.message };
  }
  return {
    noteId,
    code: "UNKNOWN_ERROR",
    message: error instanceof Error ? error.message : String(error),
  };
}

export async function bulkMoveNotes({
  container,
  input,
}: ServiceArgs<BulkMoveNotesInput>): Promise<BulkMoveNotesOutput> {
  let successCount = 0;
  const failures: BulkMoveNoteFailure[] = [];
  for (const noteId of input.noteIds) {
    try {
      await moveNote({
        container,
        input: {
          actorUserId: input.actorUserId,
          noteId,
          newDirectoryId: input.newDirectoryId,
        },
      });
      successCount += 1;
    } catch (error) {
      failures.push(describeFailure(noteId, error));
    }
  }
  return { successCount, failures };
}
