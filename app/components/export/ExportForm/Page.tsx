import { requireCurrentUser } from "@/lib/server/currentUser";
import { EXPORT_MAIN_FORM } from "../styles";
import { ExportForm } from "./index";

type Props = { noteId: string | null };

export async function ExportFormPage({ noteId }: Props) {
  await requireCurrentUser();
  return (
    <main className={EXPORT_MAIN_FORM}>
      <ExportForm noteId={noteId} />
    </main>
  );
}
