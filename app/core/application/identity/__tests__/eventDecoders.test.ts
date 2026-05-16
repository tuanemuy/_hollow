import { describe, expect, it } from "vitest";
import { EventId } from "@/core/domain/common/event";
import { IdentityEvents } from "@/core/domain/identity/events";
import { UserId } from "@/core/domain/identity/valueObject";
import { identityEventDecoders } from "../eventDecoders";

const T0 = new Date(0);

const userId = (n: number) =>
  UserId.create(`00000000-0000-7000-8000-${n.toString(16).padStart(12, "0")}`);
const eventId = (n: number): EventId =>
  EventId.create(`01950000-0000-7000-8000-${n.toString(16).padStart(12, "0")}`);

describe("identityEventDecoders", () => {
  it("decodes a user.created payload and rehydrates the UserId brand", () => {
    const uid = userId(1);
    const draft = IdentityEvents.created(uid, T0);
    const decoded = identityEventDecoders["user.created"](draft.payload, {
      id: eventId(1),
      occurredAt: draft.occurredAt,
      aggregateId: draft.aggregateId,
    });
    expect(decoded.type).toBe("user.created");
    expect(decoded.payload.userId).toBe(uid);
  });

  it("decodes user.deleted with a coerced deletedAt", () => {
    const uid = userId(2);
    const deletedAt = new Date("2026-05-01T10:00:00.000Z");
    const draft = IdentityEvents.deleted(uid, deletedAt, T0);
    const decoded = identityEventDecoders["user.deleted"](draft.payload, {
      id: eventId(2),
      occurredAt: draft.occurredAt,
      aggregateId: draft.aggregateId,
    });
    expect(decoded.type).toBe("user.deleted");
    expect(decoded.payload.userId).toBe(uid);
    expect(decoded.payload.deletedAt.getTime()).toBe(deletedAt.getTime());
  });

  it("decodes user.suspended", () => {
    const uid = userId(3);
    const draft = IdentityEvents.suspended(uid, T0);
    const decoded = identityEventDecoders["user.suspended"](draft.payload, {
      id: eventId(3),
      occurredAt: draft.occurredAt,
      aggregateId: draft.aggregateId,
    });
    expect(decoded.type).toBe("user.suspended");
    expect(decoded.payload.userId).toBe(uid);
  });

  it("decodes user.reinstated", () => {
    const uid = userId(4);
    const draft = IdentityEvents.reinstated(uid, T0);
    const decoded = identityEventDecoders["user.reinstated"](draft.payload, {
      id: eventId(4),
      occurredAt: draft.occurredAt,
      aggregateId: draft.aggregateId,
    });
    expect(decoded.type).toBe("user.reinstated");
    expect(decoded.payload.userId).toBe(uid);
  });

  it("rejects payloads missing the required userId field", () => {
    expect(() =>
      identityEventDecoders["user.created"](
        {},
        {
          id: eventId(5),
          occurredAt: T0,
          aggregateId: userId(5),
        },
      ),
    ).toThrow();
  });

  it("rejects unknown extra fields (strict schema)", () => {
    expect(() =>
      identityEventDecoders["user.created"](
        { userId: userId(6), extra: 1 },
        {
          id: eventId(6),
          occurredAt: T0,
          aggregateId: userId(6),
        },
      ),
    ).toThrow();
  });

  it("rejects user.deleted with a non-coercible deletedAt", () => {
    expect(() =>
      identityEventDecoders["user.deleted"](
        { userId: userId(7), deletedAt: "not-a-date" },
        {
          id: eventId(7),
          occurredAt: T0,
          aggregateId: userId(7),
        },
      ),
    ).toThrow();
  });
});
