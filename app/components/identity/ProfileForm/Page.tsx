import { toUserDTO } from "@/core/application/dto/identity";
import { requireCurrentUser } from "@/lib/server/currentUser";
import { ProfileForm } from "./index";

export async function ProfilePage() {
  const user = await requireCurrentUser();
  return (
    <main>
      <h1 className="sr-only">プロフィール設定</h1>
      <ProfileForm user={toUserDTO(user)} />
    </main>
  );
}
