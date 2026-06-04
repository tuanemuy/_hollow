import { UserId } from "@/core/domain/identity/valueObject";
import type { ServiceArgs } from "../types";

export type RevokeAllOtherSessionsInput = {
  actorUserId: string;
  currentSessionToken: string;
};

export type RevokeAllOtherSessionsOutput = {
  revokedCount: number;
};

export async function revokeAllOtherSessions({
  container,
  input,
}: ServiceArgs<RevokeAllOtherSessionsInput>): Promise<RevokeAllOtherSessionsOutput> {
  const actor = UserId.create(input.actorUserId);
  const revokedCount = await container.sessionService.revokeAllForUser(
    actor,
    input.currentSessionToken,
  );
  return { revokedCount };
}
