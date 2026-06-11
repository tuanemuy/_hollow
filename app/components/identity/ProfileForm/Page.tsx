import type { UserDTO } from "@/core/application/dto/identity";
import { ProfileForm } from "./index";

/**
 * Issue #636: auth and config resolution moved to the route handler
 * (outside any Suspense boundary). With both passed as props there is
 * no async data left to stream, so this page renders synchronously
 * without a boundary (`.issue/636/adr.md` ADR-008).
 */
export function ProfilePage({
  user,
  appUrl,
}: Readonly<{ user: UserDTO; appUrl: string }>) {
  return (
    <main>
      <h1 className="sr-only">プロフィール設定</h1>
      <ProfileForm user={user} appUrl={appUrl} />
    </main>
  );
}
