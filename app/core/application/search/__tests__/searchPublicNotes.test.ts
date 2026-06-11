import { describe, expect, it, vi } from "vitest";
import type { RequestContainer } from "@/core/application/di/types";
import type { UnitOfWorkContext } from "@/core/application/execution/unitOfWork";
import type {
  ActiveUser,
  SuspendedUser,
  User,
} from "@/core/domain/identity/entity";
import {
  EmailAddress,
  type UserId,
  UserId as UserIdVO,
  Username,
} from "@/core/domain/identity/valueObject";
import { NoteId } from "@/core/domain/note/valueObject";
import type { SearchIndex } from "@/core/domain/search/ports/searchIndex";
import {
  type SearchHit,
  type SearchQuery,
  SearchScore,
  SearchSnippet,
  SearchTitle,
  Visibility,
} from "@/core/domain/search/valueObject";
import { isNotFoundError } from "../../errors";
import { searchPublicNotes } from "../searchPublicNotes";

const T0 = new Date(0);

const userId = (n: number): UserId =>
  UserIdVO.create(
    `00000000-0000-7000-9000-${n.toString(16).padStart(12, "0")}`,
  );
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
  userRepository?: UnitOfWorkContext["userRepository"];
}): RequestContainer {
  const uowCtx = {
    userRepository: parts.userRepository,
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
    visibility: Visibility.create("public"),
    updatedAt: T0,
    ...over,
  };
}

function makeUser(
  override: { status?: User["status"]; username?: string } = {},
): User {
  const status = override.status ?? "active";
  const base = {
    id: userId(42),
    username: Username.create(override.username ?? "alice"),
    email: EmailAddress.create("alice@example.test"),
    displayName: "Alice",
    bio: null,
    avatarMediaId: null,
    role: "member" as const,
    version: 0 as never,
    createdAt: T0,
    updatedAt: T0,
    lastUsernameChangedAt: null,
  };
  if (status === "active") return { ...base, status } as ActiveUser;
  if (status === "suspended") return { ...base, status } as SuspendedUser;
  return { ...base, status } as User;
}

describe("searchPublicNotes", () => {
  it("returns hits with the visibility filter locked to ['public'] for an anonymous viewer", async () => {
    let observed: SearchQuery | undefined;
    const searchIndex = makeIndex(async (q) => {
      observed = q;
      return { hits: [makeHit()], nextCursor: null };
    });
    const container = makeContainer({ searchIndex });

    const result = await searchPublicNotes({
      container,
      input: { viewerUserId: null, keyword: "anything", limit: 5 },
    });

    expect(result.hits).toHaveLength(1);
    expect(observed?.visibilityFilter).toEqual(["public"]);
    expect(observed?.ownerIdFilter).toBeNull();
  });

  it("projects each hit's visibility ('public') into the returned DTO", async () => {
    const searchIndex = makeIndex(async () => ({
      hits: [makeHit({ visibility: Visibility.create("public") })],
      nextCursor: null,
    }));
    const container = makeContainer({ searchIndex });

    const result = await searchPublicNotes({
      container,
      input: { viewerUserId: null, keyword: "anything", limit: 5 },
    });

    expect(result.hits.map((h) => h.visibility)).toEqual(["public"]);
  });

  it("resolves the username to a UserId and filters by ownerId when set", async () => {
    let observed: SearchQuery | undefined;
    const searchIndex = makeIndex(async (q) => {
      observed = q;
      return { hits: [], nextCursor: null };
    });
    const targetUser = makeUser({ username: "carol" });
    const userRepository = {
      findByUsername: vi.fn(async (u: Username) => {
        if ((u as unknown as string) === "carol") return targetUser;
        return null;
      }),
    } as unknown as UnitOfWorkContext["userRepository"];

    const container = makeContainer({ searchIndex, userRepository });
    await searchPublicNotes({
      container,
      input: {
        viewerUserId: null,
        keyword: "x",
        username: "carol",
        limit: 5,
      },
    });

    expect(observed?.ownerIdFilter).toBe(targetUser.id);
  });

  it("raises NotFoundError('user') when the username is unknown", async () => {
    const searchIndex = makeIndex(async () => ({ hits: [], nextCursor: null }));
    const userRepository = {
      findByUsername: vi.fn(async () => null),
    } as unknown as UnitOfWorkContext["userRepository"];
    const container = makeContainer({ searchIndex, userRepository });

    try {
      await searchPublicNotes({
        container,
        input: {
          viewerUserId: null,
          keyword: "x",
          username: "ghost",
          limit: 5,
        },
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isNotFoundError(error)).toBe(true);
    }
    expect(searchIndex.query).not.toHaveBeenCalled();
  });

  // The implementation treats deleted/suspended users as missing from the
  // public surface; testcases call this out explicitly as ResourceNotFoundError.
  it.each([
    "suspended",
    "deleted",
  ] as const)("raises NotFoundError('user') when the target user is %s", async (status) => {
    const searchIndex = makeIndex(async () => ({
      hits: [],
      nextCursor: null,
    }));
    const userRepository = {
      findByUsername: vi.fn(async () => makeUser({ status })),
    } as unknown as UnitOfWorkContext["userRepository"];
    const container = makeContainer({ searchIndex, userRepository });

    try {
      await searchPublicNotes({
        container,
        input: {
          viewerUserId: null,
          keyword: "x",
          username: "alice",
          limit: 5,
        },
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isNotFoundError(error)).toBe(true);
    }
  });
});
