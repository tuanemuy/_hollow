import { toUserDTO } from "@/core/application/dto/identity";
import { requireCurrentUser } from "@/lib/server/currentUser";
import { AccountDeleteForm } from "./index";

export async function AccountDeletePage() {
  const user = await requireCurrentUser();
  return (
    <main>
      <h1 className="sr-only">アカウント削除</h1>
      <AccountDeleteForm user={toUserDTO(user)} />
    </main>
  );
}
