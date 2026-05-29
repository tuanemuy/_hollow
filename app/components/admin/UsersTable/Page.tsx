import { requireAdminUser } from "@/lib/server/currentUser";
import { loadAdminUsers } from "./action";
import { UsersTable } from "./index";

export async function UsersPage() {
  const me = await requireAdminUser();
  const { users } = await loadAdminUsers();
  const activeCount = users.filter((u) => u.status === "active").length;
  return (
    <main className="max-w-[var(--container-max)] mx-auto px-[var(--container-padding)] pt-10 pb-20">
      <h1 className="text-3xl font-regular tracking-tightest leading-tight m-0 mb-2">
        ユーザー管理
      </h1>
      <p className="text-md text-ink-secondary m-0 mb-8">
        {users.length} アカウント · うちアクティブ {activeCount}
      </p>
      <UsersTable users={users} currentUserId={me.id} />
    </main>
  );
}
