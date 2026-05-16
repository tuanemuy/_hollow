import { requireCurrentUser } from "@/lib/server/currentUser";
import { ExportForm } from "./index";

type Props = { noteId: string | null };

export async function ExportFormPage({ noteId }: Props) {
  await requireCurrentUser();
  return (
    <main>
      <ExportForm noteId={noteId} />
    </main>
  );
}
