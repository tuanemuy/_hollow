import { describe, expect, it } from "vitest";
import { EventId } from "@/core/domain/common/event";
import { DirectoryEvents } from "@/core/domain/directory/events";
import {
  DirectoryId,
  DirectoryName,
} from "@/core/domain/directory/valueObject";
import { directoryEventDecoders } from "../eventDecoders";

const T0 = new Date(0);

const directoryId = (n: number) =>
  DirectoryId.create(
    `00000000-0000-7000-8000-${n.toString(16).padStart(12, "0")}`,
  );
const eventId = (n: number): EventId =>
  EventId.create(`01950000-0000-7000-8000-${n.toString(16).padStart(12, "0")}`);

describe("directoryEventDecoders", () => {
  it("decodes a valid directory.deleted payload, rehydrating the DirectoryId brand", () => {
    const id = directoryId(1);
    const draft = DirectoryEvents.deleted(
      id,
      DirectoryName.create("Papers"),
      T0,
    );

    const decoded = directoryEventDecoders["directory.deleted"](draft.payload, {
      id: eventId(1),
      occurredAt: draft.occurredAt,
      aggregateId: draft.aggregateId,
    });

    expect(decoded.type).toBe("directory.deleted");
    expect(decoded.payload.directoryId).toBe(id);
    expect(decoded.payload.name).toBe("Papers");
    expect(decoded.id).toBe(eventId(1));
    expect(decoded.aggregateId).toBe(draft.aggregateId);
  });

  it("decodes a legacy payload without name, falling back to empty string", () => {
    const id = directoryId(5);
    const decoded = directoryEventDecoders["directory.deleted"](
      { directoryId: id } as { directoryId: string },
      {
        id: eventId(5),
        occurredAt: T0,
        aggregateId: id,
      },
    );
    expect(decoded.payload.name).toBe("");
  });

  it("rejects missing directoryId instead of stringifying undefined", () => {
    const id = directoryId(2);
    expect(() =>
      directoryEventDecoders["directory.deleted"](
        {} as { directoryId: string },
        {
          id: eventId(2),
          occurredAt: new Date(),
          aggregateId: id,
        },
      ),
    ).toThrow();
  });

  it("rejects non-string directoryId instead of coercing it", () => {
    const id = directoryId(3);
    expect(() =>
      directoryEventDecoders["directory.deleted"](
        { directoryId: 42 } as unknown as { directoryId: string },
        {
          id: eventId(3),
          occurredAt: new Date(),
          aggregateId: id,
        },
      ),
    ).toThrow();
  });

  it("rejects unknown wire fields (strict schema)", () => {
    const id = directoryId(4);
    expect(() =>
      directoryEventDecoders["directory.deleted"](
        {
          directoryId: id,
          futureField: true,
        } as unknown as { directoryId: string },
        {
          id: eventId(4),
          occurredAt: new Date(),
          aggregateId: id,
        },
      ),
    ).toThrow();
  });
});
