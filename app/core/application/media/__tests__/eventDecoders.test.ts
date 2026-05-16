import { describe, expect, it } from "vitest";
import { EventId } from "@/core/domain/common/event";
import { UserId } from "@/core/domain/identity/valueObject";
import { MediaEvents } from "@/core/domain/media/events";
import { MediaAssetId } from "@/core/domain/media/valueObject";
import { mediaEventDecoders } from "../eventDecoders";

const T0 = new Date(0);

const mediaId = (n: number) =>
  MediaAssetId.create(
    `00000000-0000-7000-8000-${n.toString(16).padStart(12, "0")}`,
  );
const eventId = (n: number): EventId =>
  EventId.create(`01950000-0000-7000-8000-${n.toString(16).padStart(12, "0")}`);
const userId = (n: number) => UserId.create(`user-${n.toString(16)}`);

describe("mediaEventDecoders", () => {
  it("decodes media.created with a branded ownerId and mediaAssetId", () => {
    const id = mediaId(1);
    const owner = userId(1);
    const draft = MediaEvents.created(id, owner, T0);

    const decoded = mediaEventDecoders["media.created"](draft.payload, {
      id: eventId(1),
      occurredAt: draft.occurredAt,
      aggregateId: draft.aggregateId,
    });

    expect(decoded.type).toBe("media.created");
    expect(decoded.payload.mediaAssetId).toBe(id);
    expect(decoded.payload.ownerId).toBe(owner);
    expect(decoded.id).toBe(eventId(1));
  });

  it("decodes media.attached / orphaned / deleting / purged round-trip", () => {
    const id = mediaId(2);
    for (const [type, draft] of [
      ["media.attached", MediaEvents.attached(id, T0)],
      ["media.orphaned", MediaEvents.orphaned(id, T0)],
      ["media.deleting", MediaEvents.deleting(id, T0)],
      ["media.purged", MediaEvents.purged(id, T0)],
    ] as const) {
      const decoded = mediaEventDecoders[type](draft.payload, {
        id: eventId(2),
        occurredAt: draft.occurredAt,
        aggregateId: draft.aggregateId,
      });
      expect(decoded.type).toBe(type);
      expect(decoded.payload.mediaAssetId).toBe(id);
    }
  });

  it("rejects missing required fields instead of stringifying undefined", () => {
    expect(() =>
      mediaEventDecoders["media.attached"](
        {},
        {
          id: eventId(3),
          occurredAt: new Date(),
          aggregateId: mediaId(3),
        },
      ),
    ).toThrow();
  });

  it("rejects wrong-type payload (number where string is expected)", () => {
    expect(() =>
      mediaEventDecoders["media.attached"](
        { mediaAssetId: 42 },
        {
          id: eventId(4),
          occurredAt: new Date(),
          aggregateId: mediaId(4),
        },
      ),
    ).toThrow();
  });

  it("rejects unknown wire fields (strict schemas) so unrecognized payloads fail loudly", () => {
    // Media event schemas are `.strict()`: unknown fields surface as a
    // DataIntegrityError during decode rather than being silently stripped.
    // This forces an explicit schema bump when payloads gain new shape.
    expect(() =>
      mediaEventDecoders["media.created"](
        { mediaAssetId: mediaId(5), ownerId: userId(5), futureField: true },
        {
          id: eventId(5),
          occurredAt: new Date(),
          aggregateId: mediaId(5),
        },
      ),
    ).toThrow();
  });

  it("media.created rejects an empty ownerId because UserId.create enforces non-empty", () => {
    expect(() =>
      mediaEventDecoders["media.created"](
        { mediaAssetId: mediaId(6), ownerId: "   " },
        {
          id: eventId(6),
          occurredAt: new Date(),
          aggregateId: mediaId(6),
        },
      ),
    ).toThrow();
  });
});
