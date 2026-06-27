import { describe, expect, it, vi } from "vitest";
import { UserId, Username } from "@/core/domain/identity/valueObject";
import { NoteId } from "@/core/domain/note/valueObject";
import type { NoteSnapshot, SearchDocument } from "../entity";
import type { SearchIndex, SearchQueryResult } from "../ports/searchIndex";
import { SearchIndexUnavailableError } from "../ports/searchIndex";
import { SearchService } from "../service";
import {
  SearchHighlightedTitle,
  SearchQuery,
  SearchScore,
  SearchSnippet,
  Visibility,
} from "../valueObject";

const T0 = new Date(0);

const noteId = (n: number): NoteId =>
  NoteId.create(`00000000-0000-7000-8000-${n.toString(16).padStart(12, "0")}`);
const userId = (n: number): UserId =>
  UserId.create(`00000000-0000-7000-9000-${n.toString(16).padStart(12, "0")}`);

function makeIndex(overrides: Partial<SearchIndex> = {}): SearchIndex & {
  upsert: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  query: ReturnType<typeof vi.fn>;
  bulkRebuildFromSnapshots: ReturnType<typeof vi.fn>;
} {
  return {
    upsert: vi.fn(async (_doc: SearchDocument) => {}),
    delete: vi.fn(async (_id: NoteId) => {}),
    query: vi.fn(
      async (): Promise<SearchQueryResult> => ({
        hits: [],
        nextCursor: null,
      }),
    ),
    bulkRebuildFromSnapshots: vi.fn(async () => {}),
    ...overrides,
  } as SearchIndex & {
    upsert: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    query: ReturnType<typeof vi.fn>;
    bulkRebuildFromSnapshots: ReturnType<typeof vi.fn>;
  };
}

function makeSnapshot(over: Partial<NoteSnapshot> = {}): NoteSnapshot {
  return {
    noteId: noteId(1),
    ownerId: userId(1),
    visibility: "public",
    title: "Title",
    plainBody: "body",
    tagNames: ["t"],
    directoryPath: "/",
    frontMatterDate: null,
    updatedAt: T0,
    ...over,
  };
}

describe("SearchService.applyUpsert", () => {
  it("projects the snapshot through SearchDocument.fromSnapshot and forwards to index.upsert", async () => {
    const index = makeIndex();
    await SearchService.applyUpsert(makeSnapshot(), index, new Date(123));
    expect(index.upsert).toHaveBeenCalledTimes(1);
    const doc = index.upsert.mock.calls[0]?.[0] as SearchDocument | undefined;
    expect(doc).toBeDefined();
    if (!doc) return;
    expect(doc.indexedAt.getTime()).toBe(123);
    expect(doc.title as unknown as string).toBe("Title");
  });

  it("propagates SearchIndexUnavailableError from the adapter unchanged", async () => {
    const index = makeIndex({
      upsert: vi.fn(async () => {
        throw new SearchIndexUnavailableError("backend down");
      }),
    });
    await expect(
      SearchService.applyUpsert(makeSnapshot(), index, T0),
    ).rejects.toBeInstanceOf(SearchIndexUnavailableError);
  });
});

describe("SearchService.applyDelete", () => {
  it("forwards the noteId to index.delete", async () => {
    const index = makeIndex();
    const id = noteId(9);
    await SearchService.applyDelete(id, index);
    expect(index.delete).toHaveBeenCalledWith(id);
  });
});

describe("SearchService.runQuery", () => {
  it("forwards the query to index.query and returns the result verbatim", async () => {
    const username = Username.create("alice");
    const expected: SearchQueryResult = {
      hits: [
        {
          noteId: noteId(11),
          ownerId: userId(11),
          username,
          title: SearchHighlightedTitle.create("hit"),
          snippet: SearchSnippet.create("snip"),
          tagNames: [],
          score: SearchScore.create(1.0),
          visibility: Visibility.create("public"),
          updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      ],
      nextCursor: null,
    };
    const index = makeIndex({ query: vi.fn(async () => expected) });

    const query = SearchQuery.create({
      keyword: "hello",
      ownerIdFilter: null,
      visibilityFilter: ["public"],
      tagNames: [],
      directoryPathPrefix: null,
      dateRange: null,
      limit: 10,
      cursor: null,
    });
    const result = await SearchService.runQuery(query, index);
    expect(index.query).toHaveBeenCalledWith(query);
    expect(result).toBe(expected);
  });
});
