import { describe, expect, it } from "vitest";
import { EventId } from "@/core/domain/common/event";
import { DirectoryId } from "@/core/domain/directory/valueObject";
import { UserId } from "@/core/domain/identity/valueObject";
import { MediaAssetId } from "@/core/domain/media/valueObject";
import { NoteEvents } from "@/core/domain/note/events";
import { NoteId, NoteSlug, NoteTitle } from "@/core/domain/note/valueObject";
import { TagId } from "@/core/domain/tag/valueObject";
import { noteEventDecoders } from "../eventDecoders";

const T0 = new Date(0);
const RAW_NOTE = "00000000-0000-7000-8000-000000000001";
const RAW_EVENT = "01950000-0000-7000-8000-000000000001";
const RAW_USER = "user-1";
const RAW_DIR = "dir-1";
const RAW_TAG = "00000000-0000-7000-8000-000000000010";
const RAW_MEDIA = "00000000-0000-7000-8000-000000000020";

const noteId = () => NoteId.create(RAW_NOTE);
const userId = () => UserId.create(RAW_USER);
const dirId = () => DirectoryId.create(RAW_DIR);
const tagId = () => TagId.create(RAW_TAG);
const mediaId = () => MediaAssetId.create(RAW_MEDIA);

describe("noteEventDecoders", () => {
  it("decodes a valid note.created payload", () => {
    const draft = NoteEvents.created(
      {
        noteId: noteId(),
        ownerId: userId(),
        directoryId: dirId(),
        slug: NoteSlug.create("hello"),
        title: NoteTitle.create("Hello"),
        tagIds: [tagId()],
        mediaRefs: [mediaId()],
      },
      T0,
    );

    const decoded = noteEventDecoders["note.created"](draft.payload, {
      id: EventId.create(RAW_EVENT),
      occurredAt: draft.occurredAt,
      aggregateId: draft.aggregateId,
    });

    expect(decoded.type).toBe("note.created");
    expect(decoded.payload.noteId).toBe(RAW_NOTE);
    expect(decoded.payload.title as unknown as string).toBe("Hello");
    expect(decoded.payload.slug as unknown as string).toBe("hello");
    expect(decoded.payload.tagIds[0]).toBe(RAW_TAG);
    expect(decoded.payload.mediaRefs[0]).toBe(RAW_MEDIA);
  });

  it("decodes a valid note.tags_replaced payload", () => {
    const draft = NoteEvents.tagsReplaced(
      {
        noteId: noteId(),
        ownerId: userId(),
        previousTagIds: [tagId()],
        tagIds: [],
      },
      T0,
    );

    const decoded = noteEventDecoders["note.tags_replaced"](draft.payload, {
      id: EventId.create(RAW_EVENT),
      occurredAt: draft.occurredAt,
      aggregateId: draft.aggregateId,
    });

    expect(decoded.payload.previousTagIds).toHaveLength(1);
    expect(decoded.payload.tagIds).toHaveLength(0);
  });

  it("decodes a valid note.moved payload", () => {
    const draft = NoteEvents.moved(
      {
        noteId: noteId(),
        ownerId: userId(),
        fromDirectoryId: dirId(),
        toDirectoryId: DirectoryId.create("dir-2"),
      },
      T0,
    );
    const decoded = noteEventDecoders["note.moved"](draft.payload, {
      id: EventId.create(RAW_EVENT),
      occurredAt: draft.occurredAt,
      aggregateId: draft.aggregateId,
    });
    expect(decoded.payload.fromDirectoryId).toBe(RAW_DIR);
    expect(decoded.payload.toDirectoryId).toBe("dir-2");
  });

  it("rejects payloads missing required fields", () => {
    expect(() =>
      noteEventDecoders["note.created"](
        // biome-ignore lint/suspicious/noExplicitAny: deliberate malformed input
        { noteId: RAW_NOTE } as any,
        {
          id: EventId.create(RAW_EVENT),
          occurredAt: new Date(),
          aggregateId: noteId(),
        },
      ),
    ).toThrow();
  });

  it("rejects unknown fields via strict schema", () => {
    expect(() =>
      noteEventDecoders["note.renamed"](
        {
          noteId: RAW_NOTE,
          ownerId: RAW_USER,
          title: "T",
          slug: "hello",
          futureField: true,
          // biome-ignore lint/suspicious/noExplicitAny: probe strict-schema rejection of extra fields
        } as any,
        {
          id: EventId.create(RAW_EVENT),
          occurredAt: new Date(),
          aggregateId: noteId(),
        },
      ),
    ).toThrow();
  });

  it("rejects type-mismatched fields (no coercion)", () => {
    expect(() =>
      noteEventDecoders["note.trashed"](
        // biome-ignore lint/suspicious/noExplicitAny: deliberate type mismatch
        { noteId: RAW_NOTE, ownerId: RAW_USER, mediaRefs: "not-array" } as any,
        {
          id: EventId.create(RAW_EVENT),
          occurredAt: new Date(),
          aggregateId: noteId(),
        },
      ),
    ).toThrow();
  });

  it("decodes note.purged / note.restored / note.content_updated round trip", () => {
    const meta = {
      id: EventId.create(RAW_EVENT),
      occurredAt: T0,
      aggregateId: noteId(),
    };

    const purgedDraft = NoteEvents.purged(
      {
        noteId: noteId(),
        ownerId: userId(),
        title: NoteTitle.create("Purged Note"),
        mediaRefs: [],
        sourceFileId: null,
      },
      T0,
    );
    const purged = noteEventDecoders["note.purged"](purgedDraft.payload, meta);
    expect(purged.type).toBe("note.purged");
    expect(purged.payload.title).toBe("Purged Note");

    const legacyPurged = noteEventDecoders["note.purged"](
      {
        noteId: noteId(),
        ownerId: userId(),
        mediaRefs: [],
      } as never,
      meta,
    );
    expect(legacyPurged.payload.title).toBe("");

    const restoredDraft = NoteEvents.restored(
      {
        noteId: noteId(),
        ownerId: userId(),
        directoryId: dirId(),
      },
      T0,
    );
    const restored = noteEventDecoders["note.restored"](
      restoredDraft.payload,
      meta,
    );
    expect(restored.type).toBe("note.restored");

    const updatedDraft = NoteEvents.contentUpdated(
      {
        noteId: noteId(),
        ownerId: userId(),
        title: NoteTitle.create("T"),
        tagIds: [tagId()],
        mediaRefs: [mediaId()],
      },
      T0,
    );
    const updated = noteEventDecoders["note.content_updated"](
      updatedDraft.payload,
      meta,
    );
    expect(updated.type).toBe("note.content_updated");
    expect(updated.payload.mediaRefs).toHaveLength(1);
  });
});
