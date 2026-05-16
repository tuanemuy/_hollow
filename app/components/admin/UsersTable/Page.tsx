import { requireAdminUser } from "@/lib/server/currentUser";
import { loadAdminUsers } from "./action";
import { UsersTable } from "./index";

export async function UsersPage() {
  await requireAdminUser();
  const { users } = await loadAdminUsers();
  const activeCount = users.filter((u) => u.status === "active").length;
  return (
    <main className="admin-main">
      <h1 className="admin-page-title">ユーザー管理</h1>
      <p className="admin-page-subtitle">
        {users.length} アカウント · うちアクティブ {activeCount}
      </p>
      <UsersTable users={users} />
    </main>
  );
}
