import type { UserDTO } from "@/core/application/dto/identity";
import { AccountDeleteForm } from "./index";

/**
 * Auth is resolved in the route handler (outside any Suspense boundary).
 * No async data remains, so this page renders synchronously without a
 * boundary.
 */
export function AccountDeletePage({ user }: Readonly<{ user: UserDTO }>) {
  return (
    <main>
      <h1 className="sr-only">アカウント削除</h1>
      <AccountDeleteForm user={user} />
    </main>
  );
}
