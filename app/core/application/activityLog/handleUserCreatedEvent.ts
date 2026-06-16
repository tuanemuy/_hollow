import type { UserCreatedEvent } from "@/core/domain/identity/events";
import type { ConsumerContainer } from "../di/types";

export type HandleUserCreatedEventInput = Readonly<{
  event: UserCreatedEvent;
}>;

/**
 * Project a `user.created` event into the activity log (Issue #595).
 *
 * Resolves the new user's handle through a read-only UoW lookup so the
 * "対象" column carries a human handle rather than a raw id (AC-5), then
 * writes one row keyed on `eventId` (`insertIfAbsent`) — at-least-once
 * redelivery is a no-op (ADR-001). Opens no write UoW: the activity log is
 * a derived read-model written outside any aggregate transaction (ADR-006).
 */
export async function handleUserCreatedEvent({
  container,
  input,
}: {
  container: ConsumerContainer;
  input: HandleUserCreatedEventInput;
}): Promise<void> {
  const { event } = input;
  const now = container.clock.now();
  const userId = event.payload.userId;

  const handle = await container.unitOfWorkProvider.run(
    async ({ userRepository }) => {
      const versioned = await userRepository.findById(userId);
      return versioned?.entity.username ?? null;
    },
  );

  await container.activityLogRepository.insertIfAbsent({
    id: container.idGenerator.next(),
    eventId: event.id,
    kind: "user_created",
    actorId: userId,
    target: handle ?? userId,
    detail: "新規ユーザーが登録しました",
    severity: "success",
    occurredAt: event.occurredAt,
    createdAt: now,
  });
}
