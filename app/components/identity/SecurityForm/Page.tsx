import { Suspense } from "react";
import { FormSkeleton } from "@/components/common/FormSkeleton";
import { SectionErrorBoundary } from "@/components/common/SectionErrorBoundary";
import type { UserDTO } from "@/core/application/dto/identity";
import { SecurityForm } from "./index";

type Props = Readonly<{
  user: UserDTO;
  sessionToken: string | null;
}>;

/**
 * Security settings shell. Auth and session-token reading
 * stay in the route handler; the session list streams behind its
 * `<Suspense>` boundary. The whole form is one merge boundary because
 * `SecurityForm` is a single client component needing both the user and
 * the session list.
 *
 * The session token is consumed inside the server-only section and never
 * forwarded to a client component.
 */
export function SecurityPage({ user, sessionToken }: Props) {
  return (
    <main>
      <h1 className="sr-only">セキュリティ設定</h1>
      <SectionErrorBoundary section="セキュリティ設定">
        <Suspense
          fallback={<FormSkeleton ariaLabel="セキュリティ設定を読み込み中" />}
        >
          <SecuritySection user={user} sessionToken={sessionToken} />
        </Suspense>
      </SectionErrorBoundary>
    </main>
  );
}

async function SecuritySection({ user, sessionToken }: Props) {
  const { getContainer } = await import("@/core/application/di/containerStore");
  const container = await getContainer();
  const { listUserSessions } = await import(
    "@/core/application/identity/listUserSessions"
  );
  const { sessions } = await listUserSessions({
    container,
    input: { userId: user.id, currentSessionToken: sessionToken },
  });
  return <SecurityForm user={user} sessions={sessions} />;
}
