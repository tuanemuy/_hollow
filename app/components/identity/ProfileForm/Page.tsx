import { toUserDTO } from "@/core/application/dto/identity";
import { requireCurrentUser } from "@/lib/server/currentUser";
import { ProfileForm } from "./index";

export async function ProfilePage() {
  const user = await requireCurrentUser();
  const { getContainer } = await import("@/core/application/di/containerStore");
  const container = await getContainer();
  return (
    <main>
      <h1 className="sr-only">プロフィール設定</h1>
      <ProfileForm user={toUserDTO(user)} appUrl={container.config.appUrl} />
    </main>
  );
}
