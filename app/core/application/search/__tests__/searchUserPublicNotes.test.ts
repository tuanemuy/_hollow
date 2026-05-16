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
import type { SearchIndex } from "@/core/domain/search/ports/searchIndex";
import type { SearchQuery } from "@/core/domain/search/valueObject";
import { isNotFoundError } from "../../errors";
import { searchUserPublicNotes } from "../searchUserPublicNotes";

const T0 = new Date(0);

const userId = (n: number): UserId =>
  UserIdVO.create(
    `00000000-0000-7000-9000-${n.toString(16).padStart(12, "0")}`,
  );

function makeIndex(
  query: (
    q: SearchQuery,
  ) => Promise<{ hits: readonly never[]; nextCursor: string | null }>,
): SearchIndex & {
  query: ReturnType<typeof vi.fn>;
} {
  return {
    upsert: vi.fn(async () => {}),
    delete: vi.fn(async () => {}),
    query: vi.fn(query),
    bulkRebuildFromSnapshots: vi.fn(async () => {}),
  } as unknown as SearchIndex & { query: ReturnType<typeof vi.fn> };
}

function makeContainer(parts: {
  searchIndex: SearchIndex;
  userRepository: UnitOfWorkContext["userRepository"];
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

function makeUser(
  override: { status?: User["status"]; username?: string } = {},
): User {
  const status = override.status ?? "active";
  const base = {
    id: userId(7),
    username: Username.create(override.username ?? "alice"),
    email: EmailAddress.create("a@example.test"),
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

describe("searchUserPublicNotes", () => {
  it("returns the target author's public notes with visibilityFilter=['public']", async () => {
    let observed: SearchQuery | undefined;
    const target = makeUser({ username: "carol" });
    const searchIndex = makeIndex(async (q) => {
      observed = q;
      return { hits: [], nextCursor: null };
    });
    const userRepository = {
      findByUsername: vi.fn(async (u: Username) =>
        (u as unknown as string) === "carol" ? target : null,
      ),
    } as unknown as UnitOfWorkContext["userRepository"];

    const container = makeContainer({ searchIndex, userRepository });
    const result = await searchUserPublicNotes({
      container,
      input: {
        targetUsername: "carol",
        viewerUserId: null,
        keyword: "find me",
        limit: 5,
      },
    });

    expect(result.hits).toEqual([]);
    expect(observed?.visibilityFilter).toEqual(["public"]);
    expect(observed?.ownerIdFilter).toBe(target.id);
    expect(observed?.keyword as unknown as string).toBe("find me");
  });

  // Empty keyword falls back to "*" so the call still satisfies
  // SearchKeyword.create's 1-char minimum.
  it("falls back to '*' when the keyword is empty", async () => {
    let observed: SearchQuery | undefined;
    const searchIndex = makeIndex(async (q) => {
      observed = q;
      return { hits: [], nextCursor: null };
    });
    const userRepository = {
      findByUsername: vi.fn(async () => makeUser({ username: "alice" })),
    } as unknown as UnitOfWorkContext["userRepository"];
    const container = makeContainer({ searchIndex, userRepository });

    await searchUserPublicNotes({
      container,
      input: {
        targetUsername: "alice",
        viewerUserId: null,
        keyword: "   ",
        limit: 5,
      },
    });

    expect(observed?.keyword as unknown as string).toBe("*");
  });

  it.each([
    "suspended",
    "deleted",
  ] as const)("raises NotFoundError('user') when the target user is %s", async (status) => {
    const searchIndex = makeIndex(async () => ({
      hits: [],
      nextCursor: null,
    }));
    const userRepository = {
      findByUsername: vi.fn(async () =>
        makeUser({ status, username: "alice" }),
      ),
    } as unknown as UnitOfWorkContext["userRepository"];
    const container = makeContainer({ searchIndex, userRepository });

    try {
      await searchUserPublicNotes({
        container,
        input: {
          targetUsername: "alice",
          viewerUserId: null,
          limit: 5,
        },
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isNotFoundError(error)).toBe(true);
    }
    expect(searchIndex.query).not.toHaveBeenCalled();
  });
});
