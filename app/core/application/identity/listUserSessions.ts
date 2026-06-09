import { UserId } from "@/core/domain/identity/valueObject";
import { type SessionDTO, toSessionDTO } from "../dto/identity";
import type { ServiceArgs } from "../types";

export type ListUserSessionsInput = {
  userId: string;
  currentSessionToken: string | null;
};

export type ListUserSessionsOutput = {
  sessions: readonly SessionDTO[];
};

/**
 * Read-only listing of a user's currently-valid sessions for the P22
 * active-sessions surface. `isCurrent` is resolved here by comparing each
 * row's token against `currentSessionToken`; the token itself is dropped
 * by `toSessionDTO` and never crosses into the presentation layer.
 */
export async function listUserSessions({
  container,
  input,
}: ServiceArgs<ListUserSessionsInput>): Promise<ListUserSessionsOutput> {
  const userId = UserId.create(input.userId);
  const records = await container.sessionService.listForUser(userId);
  const sessions = records.map((record) =>
    toSessionDTO(record, input.currentSessionToken),
  );
  return { sessions };
}
