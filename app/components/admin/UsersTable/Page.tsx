import { Suspense } from "react";
import { AdminTableSkeleton } from "@/components/common/AdminTableSkeleton";
import { SectionErrorBoundary } from "@/components/common/SectionErrorBoundary";
import { loadAdminUsers } from "./action";
import { UsersTable } from "./index";

/**
 * Admin users shell. The admin guard runs in the route
 * handler (outside the Suspense boundary); the count line and the table
 * stream behind the boundary because both depend on the user list.
 */
export function UsersPage({
  currentUserId,
}: Readonly<{ currentUserId: string }>) {
  return (
    <main className="max-w-[var(--container-max)] mx-auto px-[var(--container-padding)] pt-10 pb-20">
      <h1 className="text-3xl font-regular tracking-tightest leading-tight m-0 mb-2">
        ユーザー管理
      </h1>
      <SectionErrorBoundary section="ユーザー一覧">
        <Suspense
          fallback={<AdminTableSkeleton ariaLabel="ユーザーを読み込み中" />}
        >
          <UsersSection currentUserId={currentUserId} />
        </Suspense>
      </SectionErrorBoundary>
    </main>
  );
}

async function UsersSection({
  currentUserId,
}: Readonly<{ currentUserId: string }>) {
  const { users } = await loadAdminUsers();
  const activeCount = users.filter((u) => u.status === "active").length;
  return (
    <>
      <p className="text-md text-ink-secondary m-0 mb-8">
        {users.length} アカウント · うちアクティブ {activeCount}
      </p>
      <UsersTable users={users} currentUserId={currentUserId} />
    </>
  );
}
