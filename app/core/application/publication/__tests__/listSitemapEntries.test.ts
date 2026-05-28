import { describe, expect, it, vi } from "vitest";
import type { RequestContainer } from "@/core/application/di/types";
import type { UnitOfWorkContext } from "@/core/application/execution/unitOfWork";
import type { ActiveUser, User } from "@/core/domain/identity/entity";
import {
  EmailAddress,
  type UserId,
  UserId as UserIdVO,
  Username,
} from "@/core/domain/identity/valueObject";
import type { Note } from "@/core/domain/note/entity";
import {
  NoteId,
  type NoteId as NoteIdT,
  NoteSlug,
} from "@/core/domain/note/valueObject";
import { listSitemapEntries } from "../listSitemapEntries";

const T0 = new Date("2025-01-01T00:00:00.000Z");

const userId = (n: number): UserId =>
  UserIdVO.create(
    `00000000-0000-7000-9000-${n.toString(16).padStart(12, "0")}`,
  );
const noteId = (n: number): NoteIdT =>
  NoteId.create(`00000000-0000-7000-8000-${n.toString(16).padStart(12, "0")}`);

function makeUser(
  override: { id?: UserId; username?: string; status?: User["status"] } = {},
): User {
  const status = override.status ?? "active";
  const base = {
    id: override.id ?? userId(1),
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
  return { ...base, status } as User;
}

function makeNote(
  override: {
    id?: NoteIdT;
    ownerId?: UserId;
    slug?: string;
    updatedAt?: Date;
    status?: Note["status"];
  } = {},
): Note {
  const status = override.status ?? "active";
  return {
    id: override.id ?? noteId(1),
    ownerId: override.ownerId ?? userId(1),
    directoryId: "dir-1",
    slug: NoteSlug.create(override.slug ?? "hello"),
    title: "Hello",
    contentHtml: "<p>body</p>",
    frontMatter: {},
    tagIds: [],
    internalLinkRefs: [],
    mediaRefs: [],
    editLock: null,
    version: 0,
    createdAt: T0,
    updatedAt: override.updatedAt ?? T0,
    status,
    trashedAt: status === "trashed" ? T0 : null,
  } as unknown as Note;
}

type RepoSpec = {
  publicRefs: readonly { ownerId: UserId; noteId: NoteIdT }[];
  notes: readonly Note[];
  users: readonly User[];
};

function makeContainer(spec: RepoSpec): RequestContainer {
  const uowCtx = {
    publicationStateRepository: {
      findAllPublic: vi.fn(async () => spec.publicRefs),
    },
    noteRepository: {
      findByIds: vi.fn(async () => spec.notes),
    },
    userRepository: {
      findByIds: vi.fn(async () => spec.users),
    },
  } as unknown as UnitOfWorkContext;
  return {
    unitOfWorkProvider: {
      async run<T>(fn: (ctx: UnitOfWorkContext) => Promise<T>): Promise<T> {
        return fn(uowCtx);
      },
    },
  } as unknown as RequestContainer;
}

describe("listSitemapEntries", () => {
  it("returns an empty result when no public notes exist", async () => {
    const container = makeContainer({ publicRefs: [], notes: [], users: [] });
    const { entries } = await listSitemapEntries({ container } as never);
    expect(entries).toEqual([]);
  });

  it("emits one owner-top entry and one note entry per public note for a single owner", async () => {
    const owner = makeUser({ username: "alice" });
    const n1 = makeNote({
      id: noteId(1),
      ownerId: owner.id,
      slug: "first",
      updatedAt: new Date("2025-03-01T00:00:00.000Z"),
    });
    const n2 = makeNote({
      id: noteId(2),
      ownerId: owner.id,
      slug: "second",
      updatedAt: new Date("2025-03-02T00:00:00.000Z"),
    });
    const container = makeContainer({
      publicRefs: [
        { ownerId: owner.id, noteId: n1.id },
        { ownerId: owner.id, noteId: n2.id },
      ],
      notes: [n1, n2],
      users: [owner],
    });

    const { entries } = await listSitemapEntries({ container } as never);

    expect(entries).toEqual([
      { path: "/u/alice" },
      {
        path: "/u/alice/first",
        lastmod: "2025-03-01T00:00:00.000Z",
      },
      {
        path: "/u/alice/second",
        lastmod: "2025-03-02T00:00:00.000Z",
      },
    ]);
  });

  it("skips notes whose owner is suspended or deleted", async () => {
    const live = makeUser({ id: userId(1), username: "alive" });
    const suspended = makeUser({
      id: userId(2),
      username: "ghost",
      status: "suspended",
    });
    const deleted = makeUser({
      id: userId(3),
      username: "gone",
      status: "deleted",
    });
    const aliveNote = makeNote({ id: noteId(1), ownerId: live.id, slug: "ok" });
    const suspendedNote = makeNote({
      id: noteId(2),
      ownerId: suspended.id,
      slug: "hidden",
    });
    const deletedNote = makeNote({
      id: noteId(3),
      ownerId: deleted.id,
      slug: "purged",
    });

    const container = makeContainer({
      publicRefs: [
        { ownerId: live.id, noteId: aliveNote.id },
        { ownerId: suspended.id, noteId: suspendedNote.id },
        { ownerId: deleted.id, noteId: deletedNote.id },
      ],
      notes: [aliveNote, suspendedNote, deletedNote],
      users: [live, suspended, deleted],
    });

    const { entries } = await listSitemapEntries({ container } as never);
    expect(entries.map((e) => e.path)).toEqual(["/u/alive", "/u/alive/ok"]);
  });

  it("skips notes whose status is not active (e.g. trashed)", async () => {
    const owner = makeUser({ username: "alice" });
    const active = makeNote({
      id: noteId(1),
      ownerId: owner.id,
      slug: "live",
    });
    const trashed = makeNote({
      id: noteId(2),
      ownerId: owner.id,
      slug: "dead",
      status: "trashed",
    });
    const container = makeContainer({
      publicRefs: [
        { ownerId: owner.id, noteId: active.id },
        { ownerId: owner.id, noteId: trashed.id },
      ],
      notes: [active, trashed],
      users: [owner],
    });

    const { entries } = await listSitemapEntries({ container } as never);
    expect(entries.map((e) => e.path)).toEqual(["/u/alice", "/u/alice/live"]);
  });

  it("emits one owner-top entry per unique owner across multiple notes", async () => {
    const alice = makeUser({ id: userId(1), username: "alice" });
    const bob = makeUser({ id: userId(2), username: "bob" });
    const aliceNote = makeNote({
      id: noteId(1),
      ownerId: alice.id,
      slug: "a",
    });
    const bobNote1 = makeNote({ id: noteId(2), ownerId: bob.id, slug: "b1" });
    const bobNote2 = makeNote({ id: noteId(3), ownerId: bob.id, slug: "b2" });

    const container = makeContainer({
      publicRefs: [
        { ownerId: alice.id, noteId: aliceNote.id },
        { ownerId: bob.id, noteId: bobNote1.id },
        { ownerId: bob.id, noteId: bobNote2.id },
      ],
      notes: [aliceNote, bobNote1, bobNote2],
      users: [alice, bob],
    });

    const { entries } = await listSitemapEntries({ container } as never);
    expect(entries.map((e) => e.path)).toEqual([
      "/u/alice",
      "/u/alice/a",
      "/u/bob",
      "/u/bob/b1",
      "/u/bob/b2",
    ]);
  });

  it("requests at most 1000 public notes from the publication repository", async () => {
    const owner = makeUser({ username: "alice" });
    const findAllPublic = vi.fn(async () => []);
    const uowCtx = {
      publicationStateRepository: { findAllPublic },
      noteRepository: { findByIds: vi.fn(async () => []) },
      userRepository: { findByIds: vi.fn(async () => [owner]) },
    } as unknown as UnitOfWorkContext;
    const container = {
      unitOfWorkProvider: {
        async run<T>(fn: (ctx: UnitOfWorkContext) => Promise<T>): Promise<T> {
          return fn(uowCtx);
        },
      },
    } as unknown as RequestContainer;

    await listSitemapEntries({ container } as never);
    expect(findAllPublic).toHaveBeenCalledWith({ limit: 1000 });
  });
});
