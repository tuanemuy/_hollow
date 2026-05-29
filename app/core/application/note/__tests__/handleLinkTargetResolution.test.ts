import { describe, expect, it, vi } from "vitest";
import type { DirectoryId } from "@/core/domain/directory/valueObject";
import type { UserId } from "@/core/domain/identity/valueObject";
import type { MediaAssetId } from "@/core/domain/media/valueObject";
import { Note } from "@/core/domain/note/entity";
import type { NoteRepository } from "@/core/domain/note/ports/noteRepository";
import {
  ContentHtml,
  FrontMatter,
  type InternalLinkRef as InternalLinkRefType,
  type NoteId,
  NoteSlug,
  NoteTitle,
} from "@/core/domain/note/valueObject";
import { handleLinkTargetResolution } from "../handleLinkTargetResolution";
import { handleLinkTargetTrashed } from "../handleLinkTargetTrashed";

const T0 = new Date("2026-01-01T00:00:00.000Z");
const OWNER: UserId = "user-owner" as UserId;
const DIR: DirectoryId = "dir-a" as DirectoryId;
const ID_BASE = "00000000-0000-7000-8000-";
const rawId = (n: number) => `${ID_BASE}${n.toString(16).padStart(12, "0")}`;

function makeNote(
  id: string,
  title: string,
  status: "active" | "trashed" = "active",
): Note {
  const note = Note.create(
    {
      id,
      ownerId: OWNER,
      directoryId: DIR,
      slug: NoteSlug.create(`s-${id.slice(-4)}`),
      title: NoteTitle.create(title),
      contentHtml: ContentHtml.create("<p>body</p>"),
      frontMatter: FrontMatter.empty(),
      tagIds: [],
      internalLinkRefs: [] as readonly InternalLinkRefType[],
      mediaRefs: [] as readonly MediaAssetId[],
    },
    T0,
  ).entity;
  return status === "trashed" ? Note.trash(note, T0).entity : note;
}

type FakeRepoSpec = {
  note: Note | null;
  unresolvedTitle?: readonly { id: string; fromNoteId: NoteId }[];
  unresolvedId?: readonly { id: string; fromNoteId: NoteId }[];
  resolvedByTarget?: readonly {
    id: string;
    fromNoteId: NoteId;
    refKind: "id" | "title";
    refTarget: string;
  }[];
  titleCandidates?: readonly Note[];
};

function fakeContainer(spec: FakeRepoSpec) {
  const setLinkResolution = vi.fn(async () => {});
  const collectEvents = vi.fn();
  const repo = {
    findById: async (_id: string) =>
      spec.note === null
        ? null
        : { entity: spec.note, expectedVersion: 0 as never },
    findUnresolvedTitleLinkRows: async () => spec.unresolvedTitle ?? [],
    findUnresolvedIdLinkRows: async () => spec.unresolvedId ?? [],
    findResolvedLinkRowsByTarget: async () => spec.resolvedByTarget ?? [],
    findActiveByOwnerAndTitle: async () => spec.titleCandidates ?? [],
    setLinkResolution,
  } as unknown as NoteRepository;

  const container = {
    unitOfWorkProvider: {
      run: async <T>(
        fn: (ctx: {
          noteRepository: NoteRepository;
          collectEvents: typeof collectEvents;
        }) => Promise<T>,
      ) => fn({ noteRepository: repo, collectEvents }),
    },
  } as never;
  return { container, setLinkResolution, collectEvents };
}

describe("handleLinkTargetResolution", () => {
  it("no-ops when the note is absent", async () => {
    const { container, setLinkResolution } = fakeContainer({ note: null });
    await handleLinkTargetResolution({
      container,
      input: { noteId: rawId(1) as NoteId },
    });
    expect(setLinkResolution).not.toHaveBeenCalled();
  });

  it("no-ops when the note is trashed", async () => {
    const a = makeNote(rawId(2), "A", "trashed");
    const { container, setLinkResolution } = fakeContainer({ note: a });
    await handleLinkTargetResolution({ container, input: { noteId: a.id } });
    expect(setLinkResolution).not.toHaveBeenCalled();
  });

  it("resolves matching title rows to this note and unresolves stale ones", async () => {
    const a = makeNote(rawId(3), "Current");
    const { container, setLinkResolution } = fakeContainer({
      note: a,
      // a stale row currently resolved to A but pointing at "Old"
      resolvedByTarget: [
        {
          id: "stale-1",
          fromNoteId: rawId(0x90) as NoteId,
          refKind: "title",
          refTarget: "Old",
        },
      ],
      // a pending row targeting the current title
      unresolvedTitle: [{ id: "pend-1", fromNoteId: rawId(0x91) as NoteId }],
      titleCandidates: [a],
    });

    await handleLinkTargetResolution({ container, input: { noteId: a.id } });

    // stale → null, pending → A
    expect(setLinkResolution).toHaveBeenCalledWith(["stale-1"], null);
    expect(setLinkResolution).toHaveBeenCalledWith(["pend-1"], a.id);
  });

  it("does not unresolve a kind=id row when the title changes", async () => {
    const a = makeNote(rawId(4), "Current");
    const { container, setLinkResolution } = fakeContainer({
      note: a,
      resolvedByTarget: [
        {
          id: "id-row",
          fromNoteId: rawId(0x92) as NoteId,
          refKind: "id",
          refTarget: a.id,
        },
      ],
    });

    await handleLinkTargetResolution({ container, input: { noteId: a.id } });

    // The unresolve call must be made with an empty id list (no stale
    // title rows), so the id row is left resolved.
    expect(setLinkResolution).toHaveBeenCalledWith([], null);
  });

  it("resolves unresolved kind=id rows pointing at this note", async () => {
    const a = makeNote(rawId(5), "Current");
    const { container, setLinkResolution } = fakeContainer({
      note: a,
      unresolvedId: [{ id: "id-pend", fromNoteId: rawId(0x93) as NoteId }],
      titleCandidates: [a],
    });

    await handleLinkTargetResolution({ container, input: { noteId: a.id } });

    expect(setLinkResolution).toHaveBeenCalledWith(["id-pend"], a.id);
  });
});

describe("handleLinkTargetTrashed", () => {
  it("unresolves every row resolved to the target", async () => {
    const a = makeNote(rawId(6), "A");
    const { container, setLinkResolution } = fakeContainer({
      note: a,
      resolvedByTarget: [
        {
          id: "r1",
          fromNoteId: rawId(0x94) as NoteId,
          refKind: "title",
          refTarget: "A",
        },
        {
          id: "r2",
          fromNoteId: rawId(0x95) as NoteId,
          refKind: "id",
          refTarget: a.id,
        },
      ],
    });

    await handleLinkTargetTrashed({ container, input: { noteId: a.id } });

    expect(setLinkResolution).toHaveBeenCalledWith(["r1", "r2"], null);
  });
});
