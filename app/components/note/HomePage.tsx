import { AppShell } from "@/components/layout/AppShell";
import type { UserDTO } from "@/core/application/dto/identity";
import { NoteList } from "./NoteList";

type Props = {
  user: UserDTO;
  page: number;
  limit: number;
};

export function HomePage({ user, page, limit }: Props) {
  return (
    <AppShell user={user}>
      <NoteList user={user} page={page} limit={limit} />
    </AppShell>
  );
}
