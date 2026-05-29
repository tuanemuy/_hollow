import { describe, expect, it } from "vitest";
import type { DirectoryId } from "@/core/domain/directory/valueObject";
import type { UserId } from "@/core/domain/identity/valueObject";
import type { MediaAssetId } from "@/core/domain/media/valueObject";
import { Note } from "../entity";
import { NoteService } from "../service";
import {
  ContentHtml,
  FrontMatter,
  type InternalLinkRef as InternalLinkRefType,
  NoteSlug,
  NoteTitle,
} from "../valueObject";

const T0 = new Date("2026-01-01T00:00:00.000Z");
const OWNER: UserId = "user-owner" as UserId;
const DIR: DirectoryId = "dir-a" as DirectoryId;

const ID_BASE = "00000000-0000-7000-8000-";
const rawId = (n: number) => `${ID_BASE}${n.toString(16).padStart(12, "0")}`;

function makeNote(id: string, title: string): Note {
  return Note.create(
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
}

describe("NoteService.chooseResolutionForTitle", () => {
  it("returns null for an empty candidate set", () => {
    expect(NoteService.chooseResolutionForTitle([], null)).toBeNull();
  });

  it("returns the sole candidate id", () => {
    const only = makeNote(rawId(1), "Solo");
    expect(NoteService.chooseResolutionForTitle([only], null)).toBe(only.id);
  });

  it("picks by (title asc, id asc) regardless of input order", () => {
    const lowId = makeNote(rawId(0x10), "Dup");
    const highId = makeNote(rawId(0x20), "Dup");
    expect(NoteService.chooseResolutionForTitle([highId, lowId], null)).toBe(
      lowId.id,
    );
  });

  it("breaks ties by title before id", () => {
    // Title sort dominates even when ids would order the other way.
    const aTitleHighId = makeNote(rawId(0x90), "Alpha");
    const bTitleLowId = makeNote(rawId(0x01), "Beta");
    expect(
      NoteService.chooseResolutionForTitle([bTitleLowId, aTitleHighId], null),
    ).toBe(aTitleHighId.id);
  });

  it("excludes exceptId from candidates", () => {
    const self = makeNote(rawId(0x30), "Self");
    expect(NoteService.chooseResolutionForTitle([self], self.id)).toBeNull();
  });

  it("falls back to the next candidate when only the self note is excluded", () => {
    const self = makeNote(rawId(0x40), "Shared");
    const other = makeNote(rawId(0x50), "Shared");
    expect(NoteService.chooseResolutionForTitle([self, other], self.id)).toBe(
      other.id,
    );
  });

  it("agrees with resolveInternalLinks (same input → same output)", async () => {
    // The extraction must preserve #127 behaviour: feeding the same
    // candidate set through the public resolve path yields the id that
    // chooseResolutionForTitle returns.
    const lowId = makeNote(rawId(0x10), "Dup");
    const highId = makeNote(rawId(0x20), "Dup");
    const candidates = [highId, lowId];

    const chosen = NoteService.chooseResolutionForTitle(candidates, null);

    const out = await NoteService.resolveInternalLinks(
      [{ kind: "title", target: "Dup" } as InternalLinkRefType],
      OWNER,
      {
        findActiveByOwnerAndTitle: async () => candidates,
        findByIds: async () => [],
      } as never,
    );

    expect(out[0].resolvedNoteId).toBe(chosen);
  });
});
