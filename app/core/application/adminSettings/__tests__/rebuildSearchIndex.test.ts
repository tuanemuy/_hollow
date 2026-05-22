import { describe, expect, it, vi } from "vitest";
import { FakeIdGenerator } from "@/core/application/__tests__/fakes";
import type { RequestContainer } from "@/core/application/di/types";
import { isForbiddenError } from "@/core/application/errors";
import type {
  UnitOfWorkContext,
  UnitOfWorkProvider,
} from "@/core/application/execution/unitOfWork";
import type { Clock } from "@/core/application/ports/clock";
import type { Directory } from "@/core/domain/directory/entity";
import type { DirectoryRepository } from "@/core/domain/directory/ports/directoryRepository";
import type { DirectoryId } from "@/core/domain/directory/valueObject";
import { User as UserEntity } from "@/core/domain/identity/entity";
import type { UserRepository } from "@/core/domain/identity/ports/userRepository";
import { UserId } from "@/core/domain/identity/valueObject";
import type { Note } from "@/core/domain/note/entity";
import type {
  HtmlSanitizer,
  SanitizeResult,
} from "@/core/domain/note/ports/htmlSanitizer";
import type { NoteRepository } from "@/core/domain/note/ports/noteRepository";
import { NoteId } from "@/core/domain/note/valueObject";
import type { PublicationState } from "@/core/domain/publication/entity";
import type { PublicationStateRepository } from "@/core/domain/publication/ports/publicationStateRepository";
import type { SearchDocument } from "@/core/domain/search/entity";
import {
  type SearchIndex,
  SearchIndexUnavailableError,
} from "@/core/domain/search/ports/searchIndex";
import type { Tag } from "@/core/domain/tag/entity";
import type { TagRepository } from "@/core/domain/tag/ports/tagRepository";
import type { TagId } from "@/core/domain/tag/valueObject";
import { rebuildSearchIndex } from "../rebuildSearchIndex";

const T0 = new Date("2026-01-01T00:00:00.000Z");
const T1 = new Date("2026-01-01T00:00:30.000Z");

const userId = (n: number): UserId =>
  UserId.create(`00000000-0000-7000-9000-${n.toString(16).padStart(12, "0")}`);
const noteId = (n: number): NoteId =>
  NoteId.create(`00000000-0000-7000-8000-${n.toString(16).padStart(12, "0")}`);
const directoryId = (n: number): DirectoryId =>
  `00000000-0000-7000-a000-${n.toString(16).padStart(12, "0")}` as DirectoryId;
const tagId = (n: number): TagId =>
  `00000000-0000-7000-b000-${n.toString(16).padStart(12, "0")}` as TagId;

function fakeUser(
  id: UserId,
  over: Partial<{
    role: "admin" | "member";
    status: "active" | "deleted" | "pending" | "suspended";
  }> = {},
): UserEntity {
  const role = over.role ?? "admin";
  const status = over.status ?? "active";
  // Build a User via reconstruct to satisfy domain invariants.
  return UserEntity.reconstruct({
    id: id as unknown as string,
    username: `user-${(id as string).slice(-4)}`,
    email: `${id}@example.com`,
    displayName: "Display",
    bio: null,
    avatarMediaId: null,
    role,
    status,
    version: 0,
    createdAt: T0,
    updatedAt: T0,
    lastUsernameChangedAt: null,
  });
}

function fakeNote(params: {
  id: NoteId;
  ownerId: UserId;
  directoryId: DirectoryId;
  title?: string;
  tagIds?: readonly TagId[];
  frontMatter?: Record<string, unknown>;
  updatedAt?: Date;
}): Note {
  return {
    id: params.id,
    ownerId: params.ownerId,
    directoryId: params.directoryId,
    slug: `n-${(params.id as string).slice(-4)}` as Note["slug"],
    title: (params.title ?? "Title") as Note["title"],
    contentHtml: "<p>body</p>" as Note["contentHtml"],
    frontMatter: (params.frontMatter ?? {}) as Note["frontMatter"],
    tagIds: params.tagIds ?? [],
    internalLinkRefs: [],
    mediaRefs: [],
    status: "active",
    trashedAt: null,
    editLock: null,
    version: 0 as Note["version"],
    createdAt: T0,
    updatedAt: params.updatedAt ?? T0,
  } as Note;
}

function fakeDirectory(id: DirectoryId, ownerId: UserId): Directory {
  return {
    id,
    ownerId,
    parentId: null,
    name: "" as Directory["name"],
    slug: "" as Directory["slug"],
    depth: 0 as Directory["depth"],
    version: 0 as Directory["version"],
    createdAt: T0,
    updatedAt: T0,
  } as Directory;
}

function fakePublicationState(params: {
  noteId: NoteId;
  ownerId: UserId;
  visibility: "private" | "unlisted" | "public";
}): PublicationState {
  return {
    noteId: params.noteId,
    ownerId: params.ownerId,
    visibility: params.visibility,
    publishedAt: params.visibility === "public" ? T0 : null,
    updatedAt: T0,
    version: 0 as PublicationState["version"],
  } as PublicationState;
}

class FakeUnitOfWorkProvider implements UnitOfWorkProvider {
  constructor(private readonly ctx: UnitOfWorkContext) {}
  async run<T>(fn: (ctx: UnitOfWorkContext) => Promise<T>): Promise<T> {
    return fn(this.ctx);
  }
}

const passthroughSanitizer: HtmlSanitizer = {
  sanitize: (raw: string): SanitizeResult => ({
    html: raw as SanitizeResult["html"],
    removed: [],
  }),
  toPlainText: (html) => (html as string).replace(/<[^>]+>/g, ""),
};

type UserRepoStub = UserRepository & {
  listAll: ReturnType<typeof vi.fn>;
  findById: ReturnType<typeof vi.fn>;
};

function makeUserRepo(users: readonly UserEntity[]): UserRepoStub {
  const byId = new Map<string, UserEntity>(users.map((u) => [u.id, u]));
  return {
    findById: vi.fn(async (id: string) => {
      const u = byId.get(id);
      if (u === undefined) return null;
      return { entity: u, expectedVersion: 0 as never };
    }),
    findByUsername: vi.fn(),
    findByEmail: vi.fn(),
    countAdmins: vi.fn(),
    listAll: vi.fn(async (opts: { limit: number; cursor?: UserId }) => {
      const startIdx =
        opts.cursor === undefined
          ? 0
          : users.findIndex((u) => u.id === opts.cursor) + 1;
      return users.slice(startIdx, startIdx + opts.limit);
    }),
    insert: vi.fn(),
    save: vi.fn(),
    delete: vi.fn(),
  } as unknown as UserRepoStub;
}

type NoteRepoStub = NoteRepository & {
  findByOwner: ReturnType<typeof vi.fn>;
};

function makeNoteRepo(
  notesByOwner: Map<string, readonly Note[]>,
): NoteRepoStub {
  return {
    findByOwner: vi.fn(
      async (
        owner: UserId,
        opts: { limit: number; offset: number; status?: string },
      ) => {
        const all = notesByOwner.get(owner) ?? [];
        const filtered =
          opts.status === undefined
            ? all
            : all.filter((n) => n.status === opts.status);
        return filtered.slice(opts.offset, opts.offset + opts.limit);
      },
    ),
  } as unknown as NoteRepoStub;
}

function makeDirRepo(dirs: readonly Directory[]): DirectoryRepository {
  const byId = new Map<string, Directory>(dirs.map((d) => [d.id, d]));
  return {
    findById: vi.fn(async (id: DirectoryId) => {
      const d = byId.get(id);
      if (d === undefined) return null;
      return { entity: d, expectedVersion: 0 as never };
    }),
    findAncestors: vi.fn(async () => []),
  } as unknown as DirectoryRepository;
}

function makeTagRepo(tags: readonly Tag[]): TagRepository {
  return {
    findByIds: vi.fn(async (ids: readonly TagId[]) => {
      const set = new Set<string>(ids);
      return tags.filter((t) => set.has(t.id));
    }),
  } as unknown as TagRepository;
}

function makePubStateRepo(
  states: readonly PublicationState[],
): PublicationStateRepository {
  return {
    findByNoteIds: vi.fn(async (ids: readonly NoteId[]) => {
      const set = new Set<string>(ids);
      return states.filter((s) => set.has(s.noteId));
    }),
  } as unknown as PublicationStateRepository;
}

type SearchIndexSpy = SearchIndex & {
  bulkRebuildFromSnapshots: ReturnType<typeof vi.fn>;
};

function makeSearchIndex(over: Partial<SearchIndex> = {}): SearchIndexSpy {
  return {
    upsert: vi.fn(async () => {}),
    delete: vi.fn(async () => {}),
    query: vi.fn(async () => ({ hits: [], nextCursor: null })),
    bulkRebuildFromSnapshots: vi.fn(
      async (docs: AsyncIterable<SearchDocument>) => {
        for await (const _doc of docs) {
          // drain
        }
      },
    ),
    ...over,
  } as SearchIndexSpy;
}

function buildContainer(opts: {
  ctx: UnitOfWorkContext;
  searchIndex: SearchIndex;
  htmlSanitizer?: HtmlSanitizer;
  clock?: Clock;
}): RequestContainer {
  const clock: Clock = opts.clock ?? {
    now: (() => {
      let calls = 0;
      return () => {
        calls += 1;
        return calls === 1 ? T0 : T1;
      };
    })(),
  };
  return {
    clock,
    idGenerator: new FakeIdGenerator(1),
    unitOfWorkProvider: new FakeUnitOfWorkProvider(opts.ctx),
    searchIndex: opts.searchIndex,
    htmlSanitizer: opts.htmlSanitizer ?? passthroughSanitizer,
  } as unknown as RequestContainer;
}

describe("rebuildSearchIndex", () => {
  it("rejects non-admin actors with ForbiddenError", async () => {
    const actor = fakeUser(userId(1), { role: "member" });
    const userRepo = makeUserRepo([actor]);
    const ctx = {
      userRepository: userRepo,
      noteRepository: makeNoteRepo(new Map()),
      directoryRepository: makeDirRepo([]),
      tagRepository: makeTagRepo([]),
      publicationStateRepository: makePubStateRepo([]),
      collectEvents: () => {},
    } as unknown as UnitOfWorkContext;
    const container = buildContainer({
      ctx,
      searchIndex: makeSearchIndex(),
    });

    let caught: unknown;
    try {
      await rebuildSearchIndex({
        container,
        input: { actorUserId: actor.id as unknown as string },
      });
      expect.fail("should have thrown");
    } catch (error) {
      caught = error;
    }
    expect(isForbiddenError(caught)).toBe(true);
  });

  it("returns processedCount=0 when no users exist", async () => {
    // No actor — supply one admin solely for the auth check.
    const admin = fakeUser(userId(1), { role: "admin" });
    const userRepo = makeUserRepo([admin]);
    // listAll returns [admin] then []; the admin has no notes.
    const ctx = {
      userRepository: userRepo,
      noteRepository: makeNoteRepo(new Map()),
      directoryRepository: makeDirRepo([]),
      tagRepository: makeTagRepo([]),
      publicationStateRepository: makePubStateRepo([]),
      collectEvents: () => {},
    } as unknown as UnitOfWorkContext;
    const searchIndex = makeSearchIndex();
    const container = buildContainer({ ctx, searchIndex });

    const result = await rebuildSearchIndex({
      container,
      input: { actorUserId: admin.id as unknown as string },
    });

    expect(result.processedCount).toBe(0);
    expect(searchIndex.bulkRebuildFromSnapshots).toHaveBeenCalledTimes(1);
    expect(result.startedAt).toBeInstanceOf(Date);
    expect(result.finishedAt).toBeInstanceOf(Date);
  });

  it("yields snapshots for every active note across multiple users with correct projections", async () => {
    const admin = fakeUser(userId(1), { role: "admin" });
    const otherOwner = fakeUser(userId(2), { role: "member" });

    const dirA = fakeDirectory(directoryId(1), admin.id);
    const dirB = fakeDirectory(directoryId(2), otherOwner.id);

    const tagA = { id: tagId(1), name: "alpha" } as unknown as Tag;
    const tagB = { id: tagId(2), name: "beta" } as unknown as Tag;

    const adminNote = fakeNote({
      id: noteId(1),
      ownerId: admin.id,
      directoryId: dirA.id,
      title: "Admin Note",
      tagIds: [tagA.id, tagB.id],
      frontMatter: { date: "2026-03-14T00:00:00.000Z" },
      updatedAt: new Date("2026-02-01T00:00:00.000Z"),
    });
    const ownerPublic = fakeNote({
      id: noteId(2),
      ownerId: otherOwner.id,
      directoryId: dirB.id,
      title: "Public Note",
      tagIds: [],
    });
    const ownerPrivate = fakeNote({
      id: noteId(3),
      ownerId: otherOwner.id,
      directoryId: dirB.id,
      title: "Private Note",
    });

    const userRepo = makeUserRepo([admin, otherOwner]);
    const noteRepo = makeNoteRepo(
      new Map<string, readonly Note[]>([
        [admin.id, [adminNote]],
        [otherOwner.id, [ownerPublic, ownerPrivate]],
      ]),
    );
    const ctx = {
      userRepository: userRepo,
      noteRepository: noteRepo,
      directoryRepository: makeDirRepo([dirA, dirB]),
      tagRepository: makeTagRepo([tagA, tagB]),
      publicationStateRepository: makePubStateRepo([
        fakePublicationState({
          noteId: ownerPublic.id,
          ownerId: otherOwner.id,
          visibility: "public",
        }),
      ]),
      collectEvents: () => {},
    } as unknown as UnitOfWorkContext;

    const captured: SearchDocument[] = [];
    const searchIndex = makeSearchIndex({
      bulkRebuildFromSnapshots: vi.fn(
        async (docs: AsyncIterable<SearchDocument>) => {
          for await (const doc of docs) captured.push(doc);
        },
      ) as unknown as SearchIndex["bulkRebuildFromSnapshots"],
    });
    const container = buildContainer({ ctx, searchIndex });

    const result = await rebuildSearchIndex({
      container,
      input: { actorUserId: admin.id as unknown as string },
    });

    expect(result.processedCount).toBe(3);
    expect(captured).toHaveLength(3);

    const byNoteId = new Map(captured.map((d) => [d.noteId, d]));
    const adminDoc = byNoteId.get(adminNote.id);
    expect(adminDoc).toBeDefined();
    expect(adminDoc?.title as unknown as string).toBe("Admin Note");
    expect(adminDoc?.tagNames.slice().sort()).toEqual(["alpha", "beta"]);
    expect(adminDoc?.visibility).toBe("private");
    expect(adminDoc?.directoryPath as unknown as string).toBe("/");
    expect(adminDoc?.dateForCalendar.toISOString()).toBe(
      "2026-03-14T00:00:00.000Z",
    );

    const publicDoc = byNoteId.get(ownerPublic.id);
    expect(publicDoc).toBeDefined();
    expect(publicDoc?.visibility).toBe("public");

    const privateDoc = byNoteId.get(ownerPrivate.id);
    expect(privateDoc).toBeDefined();
    expect(privateDoc?.visibility).toBe("private");
  });

  it("excludes trashed notes (delegated via the status='active' filter)", async () => {
    const admin = fakeUser(userId(1), { role: "admin" });
    const dir = fakeDirectory(directoryId(1), admin.id);
    const active = fakeNote({
      id: noteId(1),
      ownerId: admin.id,
      directoryId: dir.id,
    });

    const userRepo = makeUserRepo([admin]);
    const findByOwner = vi.fn(
      async (
        _owner: UserId,
        opts: { limit: number; offset: number; status?: string },
      ) => {
        expect(opts.status).toBe("active");
        return opts.offset === 0 ? [active] : [];
      },
    );
    const noteRepo = {
      findByOwner,
    } as unknown as NoteRepository;
    const ctx = {
      userRepository: userRepo,
      noteRepository: noteRepo,
      directoryRepository: makeDirRepo([dir]),
      tagRepository: makeTagRepo([]),
      publicationStateRepository: makePubStateRepo([]),
      collectEvents: () => {},
    } as unknown as UnitOfWorkContext;
    const searchIndex = makeSearchIndex();
    const container = buildContainer({ ctx, searchIndex });

    const result = await rebuildSearchIndex({
      container,
      input: { actorUserId: admin.id as unknown as string },
    });

    expect(result.processedCount).toBe(1);
    expect(findByOwner).toHaveBeenCalled();
  });

  it("propagates SearchIndexUnavailableError raised by the adapter", async () => {
    const admin = fakeUser(userId(1), { role: "admin" });
    const userRepo = makeUserRepo([admin]);
    const ctx = {
      userRepository: userRepo,
      noteRepository: makeNoteRepo(new Map()),
      directoryRepository: makeDirRepo([]),
      tagRepository: makeTagRepo([]),
      publicationStateRepository: makePubStateRepo([]),
      collectEvents: () => {},
    } as unknown as UnitOfWorkContext;
    const searchIndex = makeSearchIndex({
      bulkRebuildFromSnapshots: vi.fn(async () => {
        throw new SearchIndexUnavailableError("index down");
      }) as unknown as SearchIndex["bulkRebuildFromSnapshots"],
    });
    const container = buildContainer({ ctx, searchIndex });

    await expect(
      rebuildSearchIndex({
        container,
        input: { actorUserId: admin.id as unknown as string },
      }),
    ).rejects.toBeInstanceOf(SearchIndexUnavailableError);
  });
});

describe("parseFrontMatterDate (via NoteSnapshot projection)", () => {
  // Indirect coverage: feed varying frontMatter['date'] values and check
  // that `dateForCalendar` resolves to `updatedAt` for invalid inputs and
  // to the parsed `Date` for valid ones.
  const updatedAt = new Date("2026-05-22T00:00:00.000Z");

  async function project(rawDate: unknown): Promise<{ dateForCalendar: Date }> {
    const admin = fakeUser(userId(1), { role: "admin" });
    const dir = fakeDirectory(directoryId(1), admin.id);
    const note = fakeNote({
      id: noteId(1),
      ownerId: admin.id,
      directoryId: dir.id,
      frontMatter: { date: rawDate },
      updatedAt,
    });

    const userRepo = makeUserRepo([admin]);
    const ctx = {
      userRepository: userRepo,
      noteRepository: makeNoteRepo(
        new Map<string, readonly Note[]>([[admin.id, [note]]]),
      ),
      directoryRepository: makeDirRepo([dir]),
      tagRepository: makeTagRepo([]),
      publicationStateRepository: makePubStateRepo([]),
      collectEvents: () => {},
    } as unknown as UnitOfWorkContext;
    const captured: SearchDocument[] = [];
    const searchIndex = makeSearchIndex({
      bulkRebuildFromSnapshots: vi.fn(
        async (docs: AsyncIterable<SearchDocument>) => {
          for await (const doc of docs) captured.push(doc);
        },
      ) as unknown as SearchIndex["bulkRebuildFromSnapshots"],
    });
    const container = buildContainer({ ctx, searchIndex });

    await rebuildSearchIndex({
      container,
      input: { actorUserId: admin.id as unknown as string },
    });
    expect(captured).toHaveLength(1);
    const doc = captured[0];
    if (doc === undefined) throw new Error("missing doc");
    return { dateForCalendar: doc.dateForCalendar };
  }

  it("resolves a valid ISO date string", async () => {
    const { dateForCalendar } = await project("2026-03-14T00:00:00.000Z");
    expect(dateForCalendar.toISOString()).toBe("2026-03-14T00:00:00.000Z");
  });

  it("falls back to updatedAt on null", async () => {
    const { dateForCalendar } = await project(null);
    expect(dateForCalendar.toISOString()).toBe(updatedAt.toISOString());
  });

  it("falls back to updatedAt on malformed string", async () => {
    const { dateForCalendar } = await project("not-a-date");
    expect(dateForCalendar.toISOString()).toBe(updatedAt.toISOString());
  });

  it("accepts a Date instance verbatim", async () => {
    const d = new Date("2026-04-01T00:00:00.000Z");
    const { dateForCalendar } = await project(d);
    expect(dateForCalendar.toISOString()).toBe("2026-04-01T00:00:00.000Z");
  });

  it("falls back to updatedAt on boolean / array", async () => {
    const { dateForCalendar: t1 } = await project(true);
    expect(t1.toISOString()).toBe(updatedAt.toISOString());
    const { dateForCalendar: t2 } = await project([2026, 1, 1]);
    expect(t2.toISOString()).toBe(updatedAt.toISOString());
  });
});
