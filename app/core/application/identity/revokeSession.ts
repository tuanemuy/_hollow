import type { ServiceArgs } from "../types";

export type RevokeSessionInput = {
  sessionToken: string;
};

/**
 * Synonym of `logOut`. Kept as a distinct usecase so admin / account
 * settings flows that revoke a specific session (other than the
 * caller's current one) have a self-describing entry point. The
 * underlying contract (`SessionService.revoke`, idempotent) is shared.
 */
export async function revokeSession({
  container,
  input,
}: ServiceArgs<RevokeSessionInput>): Promise<void> {
  await container.sessionService.revoke(input.sessionToken);
}
