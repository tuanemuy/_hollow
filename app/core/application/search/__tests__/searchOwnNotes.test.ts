import { describe, expect, it, vi } from "vitest";
import type { RequestContainer } from "@/core/application/di/types";
import type { UnitOfWorkContext } from "@/core/application/execution/unitOfWork";
import { Directory } from "@/core/domain/directory/entity";
import {
  type DirectoryId,
  DirectoryName,
} from "@/core/domain/directory/valueObject";
import { isBusinessRuleError } from "@/core/domain/error";
import { UserId, Username } from "@/core/domain/identity/valueObject";
import { NoteId } from "@/core/domain/note/valueObject";
import { SearchErrorCode } from "@/core/domain/search/errorCode";
import type { SearchIndex } from "@/core/domain/search/ports/searchIndex";
import { SearchIndexUnavailableError } from "@/core/domain/search/ports/searchIndex";
import {
  type SearchHit,
  type SearchQuery,
  SearchScore,
  SearchSnippet,
  SearchTitle,
  Visibility,
} from "@/core/domain/search/valueObject";
import { isNotFoundError } from "../../errors";
import { searchOwnNotes } from "../searchOwnNotes";

const T0 = new Date(0);

const userId = (n: number): UserId =>
  UserId.create(`00000000-0000-7000-9000-${n.toString(16).padStart(12, "0")}`);
const noteId = (n: number): NoteId =>
  NoteId.create(`00000000-0000-7000-8000-${n.toString(16).padStart(12, "0")}`);

type SearchIndexSpy = SearchIndex & {
  upsert: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  query: ReturnType<typeof vi.fn>;
  bulkRebuildFromSnapshots: ReturnType<typeof vi.fn>;
};

function makeIndex(
  query: (q: SearchQuery) => Promise<{
    hits: readonly SearchHit[];
    nextCursor: string | null;
  }>,
): SearchIndexSpy {
  return {
    upsert: vi.fn(async () => {}),
    delete: vi.fn(async () => {}),
    query: vi.fn(query),
    bulkRebuildFromSnapshots: vi.fn(async () => {}),
  } as SearchIndexSpy;
}

function makeContainer(parts: {
  searchIndex: SearchIndex;
  directoryRepository?: UnitOfWorkContext["directoryRepository"];
}): RequestContainer {
  const uowCtx = {
    directoryRepository: parts.directoryRepository,
  } as unknown as UnitOfWorkContext;
  return {
    unitOfWorkProvider: {
      async run<T>(fn: (ctx: UnitOfWorkContext) => Promise<T>): Promise<T> {
        return fn(uowCtx);
      },
    },
    searchIndex: parts.searchIndex,
    clock: { now: () => T0 },
    idGenerator: {
      next: () => "00000000-0000-7000-8000-000000000000",
      validate: () => true,
    },
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  } as unknown as RequestContainer;
}

function makeHit(over: Partial<SearchHit> = {}): SearchHit {
  return {
    noteId: noteId(1),
    ownerId: userId(1),
    username: Username.create("alice"),
    title: SearchTitle.create("hit"),
    snippet: SearchSnippet.create("..."),
    tagNames: [],
    score: SearchScore.create(1),
    visibility: Visibility.create("private"),
    ...over,
  };
}

describe("searchOwnNotes", () => {
  it("forwards the keyword + ownerId filter and returns hits + nextCursor", async () => {
    let observed: SearchQuery | undefined;
    const searchIndex = makeIndex(async (q) => {
      observed = q;
      return {
        hits: [makeHit({ noteId: noteId(10) })],
        nextCursor: "cur-1",
      };
    });
    const container = makeContainer({ searchIndex });
    const actorUserId = userId(99);

    const result = await searchOwnNotes({
      container,
      input: { actorUserId, keyword: "hello", limit: 10 },
    });

    expect(result.hits).toHaveLength(1);
    expect(result.nextCursor).toBe("cur-1");
    expect(observed).toBeDefined();
    if (!observed) return;
    expect(observed.keyword as unknown as string).toBe("hello");
    expect(observed.ownerIdFilter).toBe(actorUserId);
  });

  it("defaults visibilityFilter to all three when visibility is omitted", async () => {
    let observed: SearchQuery | undefined;
    const searchIndex = makeIndex(async (q) => {
      observed = q;
      return { hits: [], nextCursor: null };
    });
    const container = makeContainer({ searchIndex });

    await searchOwnNotes({
      container,
      input: { actorUserId: userId(1), keyword: "any", limit: 10 },
    });

    expect(observed).toBeDefined();
    if (!observed) return;
    expect([...observed.visibilityFilter].sort()).toEqual([
      "private",
      "public",
      "unlisted",
    ]);
  });

  it("returns an empty array and null cursor when the index yields no hits", async () => {
    const searchIndex = makeIndex(async () => ({
      hits: [],
      nextCursor: null,
    }));
    const container = makeContainer({ searchIndex });
    const result = await searchOwnNotes({
      container,
      input: { actorUserId: userId(1), keyword: "nothing", limit: 10 },
    });
    expect(result.hits).toEqual([]);
    expect(result.nextCursor).toBeNull();
  });

  it("rejects an empty keyword (delegates to SearchKeyword.create — KeywordEmpty)", async () => {
    const searchIndex = makeIndex(async () => ({ hits: [], nextCursor: null }));
    const container = makeContainer({ searchIndex });
    try {
      await searchOwnNotes({
        container,
        input: { actorUserId: userId(1), keyword: "   ", limit: 10 },
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(SearchErrorCode.KeywordEmpty);
      }
    }
    expect(searchIndex.query).not.toHaveBeenCalled();
  });

  it("forwards tagNames to the query verbatim", async () => {
    let observed: SearchQuery | undefined;
    const searchIndex = makeIndex(async (q) => {
      observed = q;
      return { hits: [], nextCursor: null };
    });
    const container = makeContainer({ searchIndex });

    await searchOwnNotes({
      container,
      input: {
        actorUserId: userId(1),
        keyword: "hello",
        tagNames: ["a", "b"],
        limit: 10,
      },
    });

    expect(observed?.tagNames).toEqual(["a", "b"]);
  });

  it("resolves directoryId to a directoryPath prefix via DirectoryService.computePath", async () => {
    const dirId = "00000000-0000-7000-a000-000000000001";
    const owner = userId(1);
    // ChildDirectory under the owner's root, depth 1.
    const child = Directory.create(
      {
        id: dirId,
        ownerId: owner,
        parent: Directory.createRoot(
          { id: "00000000-0000-7000-a000-000000000099", ownerId: owner },
          T0,
        ),
        name: DirectoryName.create("Notes"),
      },
      T0,
    );

    let observed: SearchQuery | undefined;
    const searchIndex = makeIndex(async (q) => {
      observed = q;
      return { hits: [], nextCursor: null };
    });

    const directoryRepository = {
      findById: vi.fn(async (id: DirectoryId) => {
        if (id !== child.id) return null;
        return {
          entity: child,
          expectedVersion: 0 as never,
        };
      }),
      findAncestors: vi.fn(async () => []),
    } as unknown as UnitOfWorkContext["directoryRepository"];

    const container = makeContainer({ searchIndex, directoryRepository });
    await searchOwnNotes({
      container,
      input: {
        actorUserId: owner,
        keyword: "anything",
        directoryId: dirId,
        limit: 10,
      },
    });

    expect(observed?.directoryPathPrefix as unknown as string).toBe(
      `/${child.slug as unknown as string}`,
    );
  });

  it("raises NotFoundError('directory') when the directoryId is unknown", async () => {
    const searchIndex = makeIndex(async () => ({ hits: [], nextCursor: null }));
    const directoryRepository = {
      findById: vi.fn(async () => null),
    } as unknown as UnitOfWorkContext["directoryRepository"];
    const container = makeContainer({ searchIndex, directoryRepository });

    try {
      await searchOwnNotes({
        container,
        input: {
          actorUserId: userId(1),
          keyword: "k",
          directoryId: "00000000-0000-7000-a000-000000000777",
          limit: 10,
        },
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isNotFoundError(error)).toBe(true);
    }
    expect(searchIndex.query).not.toHaveBeenCalled();
  });

  it("forwards input.visibility to the query's visibilityFilter when provided", async () => {
    let observed: SearchQuery | undefined;
    const searchIndex = makeIndex(async (q) => {
      observed = q;
      return { hits: [], nextCursor: null };
    });
    const container = makeContainer({ searchIndex });

    await searchOwnNotes({
      container,
      input: {
        actorUserId: userId(1),
        keyword: "hello",
        visibility: ["public"],
        limit: 10,
      },
    });

    expect(observed?.visibilityFilter).toEqual(["public"]);
  });

  it("projects each hit's visibility into the returned DTO", async () => {
    const searchIndex = makeIndex(async () => ({
      hits: [
        makeHit({ noteId: noteId(1), visibility: Visibility.create("public") }),
        makeHit({
          noteId: noteId(2),
          visibility: Visibility.create("unlisted"),
        }),
        makeHit({
          noteId: noteId(3),
          visibility: Visibility.create("private"),
        }),
      ],
      nextCursor: null,
    }));
    const container = makeContainer({ searchIndex });

    const result = await searchOwnNotes({
      container,
      input: { actorUserId: userId(1), keyword: "hello", limit: 10 },
    });

    expect(result.hits.map((h) => h.visibility)).toEqual([
      "public",
      "unlisted",
      "private",
    ]);
  });

  it("propagates SearchIndexUnavailableError from the index unchanged", async () => {
    const searchIndex = makeIndex(async () => {
      throw new SearchIndexUnavailableError("backend down");
    });
    const container = makeContainer({ searchIndex });

    await expect(
      searchOwnNotes({
        container,
        input: { actorUserId: userId(1), keyword: "k", limit: 5 },
      }),
    ).rejects.toBeInstanceOf(SearchIndexUnavailableError);
  });
});
