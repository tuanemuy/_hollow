import { describe, expect, it } from "vitest";
import { EventId } from "@/core/domain/common/event";
import { UserId } from "@/core/domain/identity/valueObject";
import { NoteId } from "@/core/domain/note/valueObject";
import { PublicationEvents } from "@/core/domain/publication/events";
import {
  PublicationVisibility,
  ShareLinkId,
} from "@/core/domain/publication/valueObject";
import { isSystemError } from "../../errors";
import { publicationEventDecoders } from "../eventDecoders";

const T0 = new Date(0);
const eventId = (n: number): EventId =>
  EventId.create(`01950000-0000-7000-8000-${n.toString(16).padStart(12, "0")}`);
const noteIdRaw = (n: number) =>
  `00000000-0000-7000-8000-${n.toString(16).padStart(12, "0")}`;
const shareLinkIdRaw = (n: number) =>
  `00000000-0000-7000-9000-${n.toString(16).padStart(12, "0")}`;
const userIdRaw = (n: number) =>
  `00000000-0000-7000-a000-${n.toString(16).padStart(12, "0")}`;

describe("publicationEventDecoders[note.publish_changed]", () => {
  it("decodes a valid payload and rebrands ids / visibility", () => {
    const draft = PublicationEvents.notePublishChanged(
      {
        noteId: NoteId.create(noteIdRaw(1)),
        ownerId: UserId.create(userIdRaw(1)),
        previous: PublicationVisibility.create("private"),
        next: PublicationVisibility.create("public"),
      },
      T0,
    );
    const decoded = publicationEventDecoders["note.publish_changed"](
      draft.payload,
      {
        id: eventId(1),
        occurredAt: draft.occurredAt,
        aggregateId: draft.aggregateId,
      },
    );
    expect(decoded.payload.previous).toBe("private");
    expect(decoded.payload.next).toBe("public");
    expect(decoded.type).toBe("note.publish_changed");
  });

  it("rejects an unknown visibility literal", () => {
    try {
      publicationEventDecoders["note.publish_changed"](
        {
          noteId: noteIdRaw(2),
          ownerId: userIdRaw(2),
          previous: "private",
          next: "draft",
        },
        {
          id: eventId(2),
          occurredAt: T0,
          aggregateId: noteIdRaw(2),
        },
      );
      expect.fail("should have thrown");
    } catch (error) {
      expect(isSystemError(error)).toBe(true);
    }
  });

  it("rejects extra wire fields (strict schema)", () => {
    expect(() =>
      publicationEventDecoders["note.publish_changed"](
        {
          noteId: noteIdRaw(3),
          ownerId: userIdRaw(3),
          previous: "private",
          next: "public",
          extra: "boom",
        },
        {
          id: eventId(3),
          occurredAt: T0,
          aggregateId: noteIdRaw(3),
        },
      ),
    ).toThrow();
  });

  it("rejects missing required fields", () => {
    expect(() =>
      publicationEventDecoders["note.publish_changed"](
        { noteId: noteIdRaw(4) },
        {
          id: eventId(4),
          occurredAt: T0,
          aggregateId: noteIdRaw(4),
        },
      ),
    ).toThrow();
  });
});

describe("publicationEventDecoders[share_link.issued]", () => {
  it("decodes a valid payload", () => {
    const draft = PublicationEvents.shareLinkIssued(
      ShareLinkId.create(shareLinkIdRaw(10)),
      NoteId.create(noteIdRaw(10)),
      UserId.create(userIdRaw(10)),
      T0,
    );
    const decoded = publicationEventDecoders["share_link.issued"](
      draft.payload,
      {
        id: eventId(10),
        occurredAt: draft.occurredAt,
        aggregateId: draft.aggregateId,
      },
    );
    expect(decoded.type).toBe("share_link.issued");
    expect(decoded.payload.shareLinkId).toBe(shareLinkIdRaw(10));
  });

  it("rejects extra wire fields", () => {
    expect(() =>
      publicationEventDecoders["share_link.issued"](
        {
          shareLinkId: shareLinkIdRaw(11),
          noteId: noteIdRaw(11),
          ownerId: userIdRaw(11),
          unexpected: true,
        },
        {
          id: eventId(11),
          occurredAt: T0,
          aggregateId: shareLinkIdRaw(11),
        },
      ),
    ).toThrow();
  });
});

describe("publicationEventDecoders[share_link.revoked]", () => {
  it("decodes a valid payload", () => {
    const draft = PublicationEvents.shareLinkRevoked(
      ShareLinkId.create(shareLinkIdRaw(20)),
      NoteId.create(noteIdRaw(20)),
      UserId.create(userIdRaw(20)),
      T0,
    );
    const decoded = publicationEventDecoders["share_link.revoked"](
      draft.payload,
      {
        id: eventId(20),
        occurredAt: draft.occurredAt,
        aggregateId: draft.aggregateId,
      },
    );
    expect(decoded.type).toBe("share_link.revoked");
    expect(decoded.payload.noteId).toBe(noteIdRaw(20));
  });

  it("rejects empty shareLinkId via ShareLinkId.create", () => {
    expect(() =>
      publicationEventDecoders["share_link.revoked"](
        {
          shareLinkId: "",
          noteId: noteIdRaw(21),
          ownerId: userIdRaw(21),
        },
        {
          id: eventId(21),
          occurredAt: T0,
          aggregateId: shareLinkIdRaw(21),
        },
      ),
    ).toThrow();
  });
});
