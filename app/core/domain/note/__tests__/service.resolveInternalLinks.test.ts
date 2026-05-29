import { describe, expect, it } from "vitest";
import type { DirectoryId } from "@/core/domain/directory/valueObject";
import type { UserId } from "@/core/domain/identity/valueObject";
import type { MediaAssetId } from "@/core/domain/media/valueObject";
import { Note } from "../entity";
import type { NoteRepository } from "../ports/noteRepository";
import { NoteService } from "../service";
import {
  ContentHtml,
  FrontMatter,
  InternalLinkRef,
  type InternalLinkRef as InternalLinkRefType,
  type NoteId,
  NoteSlug,
  NoteTitle,
} from "../valueObject";

const T0 = new Date("2026-01-01T00:00:00.000Z");
const OWNER: UserId = "user-owner" as UserId;
const OTHER_OWNER: UserId = "user-other" as UserId;
const DIR: DirectoryId = "dir-a" as DirectoryId;

const ID_BASE = "00000000-0000-7000-8000-";
const rawId = (n: number) => `${ID_BASE}${n.toString(16).padStart(12, "0")}`;

function makeNote(id: string, title: string, ownerId: UserId = OWNER): Note {
  return Note.create(
    {
      id,
      ownerId,
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
}

// Minimal repo stub: `resolveInternalLinks` touches
// `findActiveByOwnerAndTitle` (kind=title) and `findByIds` (kind=id).
// Every other method throws so an accidental reliance on slug lookup
// (the old behaviour) fails loudly.
function stubRepo(
  byTitle: (title: string) => readonly Note[],
  byIds: (ids: readonly NoteId[]) => readonly Note[] = () => [],
): NoteRepository {
  const notImplemented = () => {
    throw new Error("not implemented");
  };
  return {
    findActiveByOwnerAndTitle: async (_o: UserId, title: string) =>
      byTitle(title),
    findByIds: async (ids: readonly NoteId[]) => byIds(ids),
    findByOwnerAndSlug: notImplemented,
    findById: notImplemented,
    findByDirectory: notImplemented,
    findByOwner: notImplemented,
    searchByTitlePrefix: notImplemented,
    findTrashedOlderThan: notImplemented,
    findReferrers: notImplemented,
    trashByDirectory: notImplemented,
    purge: notImplemented,
    countByOwner: notImplemented,
    listWithCount: notImplemented,
    insert: notImplemented,
    save: notImplemented,
    delete: notImplemented,
  } as unknown as NoteRepository;
}

const titleRef = (target: string) =>
  InternalLinkRef.create({ kind: "title", target });

const idRefOf = (target: string) =>
  InternalLinkRef.create({ kind: "id", target });

describe("NoteService.resolveInternalLinks", () => {
  it("resolves a kind=title ref by exact title match", async () => {
    const target = makeNote(rawId(1), "My Note");
    const refs = [titleRef("My Note")];

    const out = await NoteService.resolveInternalLinks(
      refs,
      OWNER,
      stubRepo((t) => (t === "My Note" ? [target] : [])),
    );

    expect(out).toHaveLength(1);
    expect(out[0].resolvedNoteId).toBe(target.id);
  });

  it("resolves case-insensitively (the adapter does lower(title) = lower(?))", async () => {
    // The domain passes the raw target to the port; the case-folding
    // happens in the adapter. Simulate a match regardless of case here.
    const target = makeNote(rawId(2), "My Note");
    const refs = [titleRef("MY NOTE")];

    const out = await NoteService.resolveInternalLinks(
      refs,
      OWNER,
      stubRepo(() => [target]),
    );

    expect(out[0].resolvedNoteId).toBe(target.id);
  });

  it("leaves resolvedNoteId null when no note matches", async () => {
    const refs = [titleRef("Nonexistent")];

    const out = await NoteService.resolveInternalLinks(
      refs,
      OWNER,
      stubRepo(() => []),
    );

    expect(out[0].resolvedNoteId).toBeNull();
  });

  it("resolves a kind=id ref to an existing active owned note", async () => {
    const target = makeNote(rawId(3), "Target");
    const refs = [idRefOf(rawId(3))];

    const out = await NoteService.resolveInternalLinks(
      refs,
      OWNER,
      stubRepo(
        () => {
          throw new Error(
            "findActiveByOwnerAndTitle must not be called for kind=id",
          );
        },
        () => [target],
      ),
    );

    expect(out[0].resolvedNoteId).toBe(target.id);
  });

  it("leaves a kind=id ref unresolved when the target note does not exist", async () => {
    const refs = [idRefOf(rawId(4))];

    const out = await NoteService.resolveInternalLinks(
      refs,
      OWNER,
      stubRepo(
        () => [],
        () => [],
      ),
    );

    expect(out[0].resolvedNoteId).toBeNull();
  });

  it("leaves a kind=id ref unresolved when the target note belongs to another owner", async () => {
    const foreign = makeNote(rawId(5), "Foreign", OTHER_OWNER);
    const refs = [idRefOf(rawId(5))];

    const out = await NoteService.resolveInternalLinks(
      refs,
      OWNER,
      stubRepo(
        () => [],
        () => [foreign],
      ),
    );

    expect(out[0].resolvedNoteId).toBeNull();
  });

  it("excludes the self note (exceptId) from a kind=id ref", async () => {
    const self = makeNote(rawId(6), "Self");
    const refs = [idRefOf(rawId(6))];

    const out = await NoteService.resolveInternalLinks(
      refs,
      OWNER,
      stubRepo(
        () => [],
        () => [self],
      ),
      self.id,
    );

    expect(out[0].resolvedNoteId).toBeNull();
  });

  it("chooses deterministically by (title asc, id asc) among duplicate titles", async () => {
    // Same title; ids deliberately returned out of order from the port
    // so the test pins the domain-side sort, not the port order.
    const lowId = makeNote(rawId(0x10), "Dup");
    const highId = makeNote(rawId(0x20), "Dup");
    const refs = [titleRef("Dup")];

    const out = await NoteService.resolveInternalLinks(
      refs,
      OWNER,
      stubRepo(() => [highId, lowId]),
    );

    expect(out[0].resolvedNoteId).toBe(lowId.id);
  });

  it("excludes the self note (exceptId) from candidates", async () => {
    const self = makeNote(rawId(0x30), "Self");
    const refs = [titleRef("Self")];

    const out = await NoteService.resolveInternalLinks(
      refs,
      OWNER,
      stubRepo(() => [self]),
      self.id,
    );

    expect(out[0].resolvedNoteId).toBeNull();
  });

  it("falls back to the next candidate when only the self note is excluded", async () => {
    const self = makeNote(rawId(0x40), "Shared");
    const other = makeNote(rawId(0x50), "Shared");
    const refs = [titleRef("Shared")];

    const out = await NoteService.resolveInternalLinks(
      refs,
      OWNER,
      stubRepo(() => [self, other]),
      self.id,
    );

    expect(out[0].resolvedNoteId).toBe(other.id);
  });

  it("propagates repository I/O errors instead of swallowing them", async () => {
    const refs = [titleRef("Boom")];
    const boom = new Error("db down");

    await expect(
      NoteService.resolveInternalLinks(
        refs,
        OWNER,
        stubRepo(() => {
          throw boom;
        }),
      ),
    ).rejects.toBe(boom);
  });
});
