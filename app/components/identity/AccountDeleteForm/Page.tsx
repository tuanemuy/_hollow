import type { UserDTO } from "@/core/application/dto/identity";
import { AccountDeleteForm } from "./index";

/**
 * Issue #636: auth moved to the route handler (outside any Suspense
 * boundary). No async data remains, so this page renders synchronously
 * without a boundary (`.issue/636/adr.md` ADR-008).
 */
export function AccountDeletePage({ user }: Readonly<{ user: UserDTO }>) {
  return (
    <main>
      <h1 className="sr-only">アカウント削除</h1>
      <AccountDeleteForm user={user} />
    </main>
  );
}
