import { toUserDTO } from "@/core/application/dto/identity";
import {
  getCurrentSessionToken,
  requireCurrentUser,
} from "@/lib/server/currentUser";
import { SecurityForm } from "./index";

export async function SecurityPage() {
  const user = await requireCurrentUser();
  const token = getCurrentSessionToken();
  const { getContainer } = await import("@/core/application/di/containerStore");
  const container = await getContainer();
  const { listUserSessions } = await import(
    "@/core/application/identity/listUserSessions"
  );
  const { sessions } = await listUserSessions({
    container,
    input: { userId: user.id, currentSessionToken: token },
  });
  return (
    <main>
      <h1 className="sr-only">セキュリティ設定</h1>
      <SecurityForm user={toUserDTO(user)} sessions={sessions} />
    </main>
  );
}
