import { Suspense } from "react";
import { FormSkeleton } from "@/components/common/FormSkeleton";
import { SectionErrorBoundary } from "@/components/common/SectionErrorBoundary";
import type { UserDTO } from "@/core/application/dto/identity";
import { AccountDeleteForm } from "./index";

type Props = Readonly<{ user: UserDTO }>;

/**
 * Account-delete shell. Auth stays in the route handler; the deletion
 * impact aggregation streams behind its `<Suspense>` boundary and any
 * aggregation failure is isolated by `<SectionErrorBoundary>` (mirrors
 * P22 `SecurityForm/Page.tsx`). The route loader does only auth + RSC
 * render — the aggregation usecase is invoked here.
 */
export function AccountDeletePage({ user }: Props) {
  return (
    <main>
      <h1 className="sr-only">アカウント削除</h1>
      <SectionErrorBoundary section="アカウント削除">
        <Suspense
          fallback={<FormSkeleton ariaLabel="アカウント削除を読み込み中" />}
        >
          <AccountDeleteSection user={user} />
        </Suspense>
      </SectionErrorBoundary>
    </main>
  );
}

async function AccountDeleteSection({ user }: Props) {
  const { getContainer } = await import("@/core/application/di/containerStore");
  const container = await getContainer();
  const { summarizeAccountDeletion } = await import(
    "@/core/application/identity/summarizeAccountDeletion"
  );
  const impact = await summarizeAccountDeletion({
    container,
    input: { actorUserId: user.id },
  });
  return <AccountDeleteForm user={user} impact={impact} />;
}
