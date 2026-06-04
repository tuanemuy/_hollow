import type { NoteId } from "@/core/domain/note/valueObject";
import { requireCurrentUser } from "@/lib/server/currentUser";
import { PUBLISH_BODY } from "../styles";
import { PublishSettings } from "./index";
import { loadPublishStateOrNotFound } from "./loader";

type Props = { noteId: string; appUrl: string };

export async function PublishSettingsPage({ noteId, appUrl }: Props) {
  const user = await requireCurrentUser();
  const initial = await loadPublishStateOrNotFound({
    noteId: noteId as NoteId,
    actorUserId: user.id,
  });

  // `_app`'s AppShellDrawer owns the single `<main>`; this leaf renders a
  // `<section>` to avoid a second landmark (mirrors NoteDetail).
  return (
    <section className={PUBLISH_BODY}>
      <PublishSettings noteId={noteId} appUrl={appUrl} initial={initial} />
    </section>
  );
}
