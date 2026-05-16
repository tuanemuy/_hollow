import { cache } from "react";
import type { NoteId } from "@/core/application/dto/note";
import { serverData } from "@/core/presentation/serverAction";

type ListInput = Readonly<{
  actorUserId: string;
  status: "active" | "trashed";
  page: number;
  limit: number;
}>;

export const loadOwnedNotes = cache(
  serverData(
    () => import("@/core/application/note/listNotesByOwner"),
    ({ container }, { listNotesByOwner }, input: ListInput) =>
      listNotesByOwner({
        container,
        input: {
          actorUserId: input.actorUserId as unknown as Parameters<
            typeof listNotesByOwner
          >[0]["input"]["actorUserId"],
          status: input.status,
          page: input.page,
          limit: input.limit,
          sort: "updatedAt",
          order: "desc",
        },
      }),
  ),
);

export const loadNoteDetail = cache(
  serverData(
    () => import("@/core/application/note/getNoteDetail"),
    (
      { container },
      { getNoteDetail },
      args: { actorUserId: string; noteId: NoteId },
    ) =>
      getNoteDetail({
        container,
        input: {
          actorUserId: args.actorUserId as unknown as Parameters<
            typeof getNoteDetail
          >[0]["input"]["actorUserId"],
          noteId: args.noteId as unknown as Parameters<
            typeof getNoteDetail
          >[0]["input"]["noteId"],
        },
      }),
  ),
);
