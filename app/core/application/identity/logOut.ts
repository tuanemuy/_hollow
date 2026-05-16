import type { ServiceArgs } from "../types";

export type LogOutInput = {
  sessionToken: string;
};

/**
 * Revoke the supplied session token. `SessionService.revoke` is
 * idempotent, so unknown / already-revoked tokens succeed silently.
 */
export async function logOut({
  container,
  input,
}: ServiceArgs<LogOutInput>): Promise<void> {
  await container.sessionService.revoke(input.sessionToken);
}
