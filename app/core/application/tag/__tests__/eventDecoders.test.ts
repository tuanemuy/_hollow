import { describe, expect, it } from "vitest";
import { EventId } from "@/core/domain/common/event";
import { TagEvents } from "@/core/domain/tag/events";
import { TagId } from "@/core/domain/tag/valueObject";
import { tagEventDecoders } from "../eventDecoders";

const T0 = new Date(0);

const tagId = (n: number) =>
  TagId.create(`00000000-0000-7000-8000-${n.toString(16).padStart(12, "0")}`);
const eventId = (n: number): EventId =>
  EventId.create(`01950000-0000-7000-8000-${n.toString(16).padStart(12, "0")}`);

describe("tagEventDecoders", () => {
  it("decodes a valid tag.deleted payload, rehydrating the TagId brand", () => {
    const id = tagId(1);
    const draft = TagEvents.deleted(id, T0);

    const decoded = tagEventDecoders["tag.deleted"](draft.payload, {
      id: eventId(1),
      occurredAt: draft.occurredAt,
      aggregateId: draft.aggregateId,
    });

    expect(decoded.type).toBe("tag.deleted");
    expect(decoded.payload.tagId).toBe(id);
    expect(decoded.id).toBe(eventId(1));
    expect(decoded.aggregateId).toBe(draft.aggregateId);
  });

  it("rejects missing tagId instead of stringifying undefined", () => {
    const id = tagId(2);
    expect(() =>
      tagEventDecoders["tag.deleted"]({} as { tagId: string }, {
        id: eventId(2),
        occurredAt: new Date(),
        aggregateId: id,
      }),
    ).toThrow();
  });

  it("rejects non-string tagId instead of coercing it", () => {
    const id = tagId(3);
    expect(() =>
      tagEventDecoders["tag.deleted"](
        { tagId: 42 } as unknown as { tagId: string },
        {
          id: eventId(3),
          occurredAt: new Date(),
          aggregateId: id,
        },
      ),
    ).toThrow();
  });

  it("rejects unknown wire fields (strict schema)", () => {
    const id = tagId(4);
    expect(() =>
      tagEventDecoders["tag.deleted"](
        { tagId: id, futureField: true } as unknown as { tagId: string },
        {
          id: eventId(4),
          occurredAt: new Date(),
          aggregateId: id,
        },
      ),
    ).toThrow();
  });
});
