import type { NoteId } from "@/core/domain/note/valueObject";
import { requireCurrentUser } from "@/lib/server/currentUser";
import { PublishSettings } from "./index";
import { loadPublishStateOrNotFound } from "./loader";

type Props = { noteId: string; appUrl: string };

export async function PublishSettingsPage({ noteId, appUrl }: Props) {
  const user = await requireCurrentUser();
  const initial = await loadPublishStateOrNotFound({
    noteId: noteId as NoteId,
    actorUserId: user.id,
  });

  return (
    <main>
      <PublishSettings noteId={noteId} appUrl={appUrl} initial={initial} />
    </main>
  );
}
