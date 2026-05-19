import { describe, expect, it } from "vitest";
import { FakeIdGenerator } from "@/core/application/__tests__/fakes/fakeIdGenerator";
import type {
  ExpectedVersion,
  Versioned,
} from "@/core/domain/common/transactionalRepository";
import { isBusinessRuleError } from "@/core/domain/error";
import type { UserId } from "@/core/domain/identity/valueObject";
import type { Note } from "@/core/domain/note/entity";
import type {
  NoteListOpts,
  NoteOwnerCountOpts,
  NoteOwnerListOpts,
  NoteRepository,
} from "@/core/domain/note/ports/noteRepository";
import type { NoteId, NoteSlug } from "@/core/domain/note/valueObject";
import type { TagId } from "@/core/domain/tag/valueObject";
import {
  type Directory,
  Directory as DirectoryFns,
  type RootDirectory,
} from "../entity";
import { DirectoryErrorCode } from "../errorCode";
import type { DirectoryRepository } from "../ports/directoryRepository";
import { DirectoryService } from "../service";
import { type DirectoryId, DirectoryName } from "../valueObject";

const T0 = new Date(0);
const at = (ms: number) => new Date(T0.getTime() + ms);

// `as` casts here express test-only branding without paying the runtime
// cost of a real UserId factory — the service treats UserId opaquely.
const OWNER_A = "owner-a" as unknown as UserId;
const OWNER_B = "owner-b" as unknown as UserId;

/**
 * Minimal in-memory `DirectoryRepository` for domain-service tests.
 *
 * Skips the OCC token contract that the real adapter enforces — the
 * service-level invariants we care about here (sibling-name uniqueness,
 * cycle detection, root idempotence, subtree delete walk order) are
 * orthogonal to OCC. Integration tests cover the OCC path against a real
 * D1 binding.
 */
class InMemoryDirectoryRepository implements DirectoryRepository {
  readonly rows = new Map<string, Directory>();

  add(dir: Directory): void {
    this.rows.set(dir.id as unknown as string, dir);
  }

  async findById(id: string): Promise<Versioned<Directory> | null> {
    const found = this.rows.get(id);
    if (found === undefined) return null;
    return {
      entity: found,
      expectedVersion: found.version as unknown as ExpectedVersion<Directory>,
    };
  }

  async insert(dir: Directory): Promise<void> {
    this.add(dir);
  }

  async save(
    dir: Directory,
    _expectedVersion: ExpectedVersion<Directory>,
  ): Promise<void> {
    this.add(dir);
  }

  async delete(
    id: string,
    _expectedVersion: ExpectedVersion<Directory>,
  ): Promise<void> {
    this.rows.delete(id);
  }

  async findRoot(ownerId: UserId): Promise<Directory | null> {
    for (const d of this.rows.values()) {
      if (d.ownerId === ownerId && d.parentId === null) return d;
    }
    return null;
  }

  async findChildren(parentId: DirectoryId): Promise<readonly Directory[]> {
    return [...this.rows.values()].filter(
      (d) => d.parentId === (parentId as unknown as string),
    );
  }

  async findTree(ownerId: UserId): Promise<readonly Directory[]> {
    return [...this.rows.values()].filter((d) => d.ownerId === ownerId);
  }

  async findAncestors(id: DirectoryId): Promise<readonly Directory[]> {
    const target = this.rows.get(id as unknown as string);
    if (target === undefined) return [];
    const chain: Directory[] = [];
    let current: string | null = target.parentId;
    const visited = new Set<string>([target.id as unknown as string]);
    while (current !== null && !visited.has(current)) {
      visited.add(current);
      const parent = this.rows.get(current);
      if (parent === undefined) break;
      chain.push(parent);
      current = parent.parentId;
    }
    return chain.reverse();
  }

  async findBySiblingName(
    parentId: DirectoryId | null,
    ownerId: UserId,
    name: DirectoryName,
  ): Promise<Directory | null> {
    for (const d of this.rows.values()) {
      if (d.ownerId !== ownerId) continue;
      const samePar =
        parentId === null
          ? d.parentId === null
          : d.parentId === (parentId as unknown as string);
      if (!samePar) continue;
      if (DirectoryName.equals(d.name, name)) return d;
    }
    return null;
  }
}

/**
 * Skeletal `NoteRepository` exposing only the two methods
 * `DirectoryService.deleteSubtree` actually exercises. All other methods
 * throw, so an accidental dependency on them surfaces immediately.
 */
class StubNoteRepository implements NoteRepository {
  private readonly notesByDirectory = new Map<string, NoteId[]>();

  setNotes(directoryId: DirectoryId, ids: NoteId[]): void {
    this.notesByDirectory.set(directoryId as unknown as string, ids);
  }

  async trashByDirectory(directoryId: DirectoryId): Promise<readonly NoteId[]> {
    const ids = this.notesByDirectory.get(directoryId as unknown as string);
    if (ids === undefined) return [];
    // Mimic real semantics: subsequent calls find nothing.
    this.notesByDirectory.delete(directoryId as unknown as string);
    return ids;
  }

  findById(_id: NoteId): Promise<Versioned<Note> | null> {
    throw new Error("not implemented");
  }
  insert(_n: Note): Promise<void> {
    throw new Error("not implemented");
  }
  save(_n: Note, _v: ExpectedVersion<Note>): Promise<void> {
    throw new Error("not implemented");
  }
  delete(_id: string, _v: ExpectedVersion<Note>): Promise<void> {
    throw new Error("not implemented");
  }
  findByOwnerAndSlug(_o: UserId, _s: NoteSlug): Promise<Note | null> {
    throw new Error("not implemented");
  }
  findByDirectory(_d: DirectoryId, _o: NoteListOpts): Promise<readonly Note[]> {
    throw new Error("not implemented");
  }
  findByOwner(_o: UserId, _opts: NoteOwnerListOpts): Promise<readonly Note[]> {
    throw new Error("not implemented");
  }
  searchByTitlePrefix(
    _o: UserId,
    _p: string,
    _l: number,
  ): Promise<readonly Note[]> {
    throw new Error("not implemented");
  }
  findTrashedOlderThan(_o: UserId, _b: Date): Promise<readonly Note[]> {
    throw new Error("not implemented");
  }
  findReferrers(_n: NoteId): Promise<readonly Note[]> {
    throw new Error("not implemented");
  }
  purge(_id: NoteId): Promise<void> {
    throw new Error("not implemented");
  }
  countByOwner(_o: UserId, _opts?: NoteOwnerCountOpts): Promise<number> {
    throw new Error("not implemented");
  }

  // Unused helper kept to silence unused-parameter lint on the `TagId`
  // import path, which would otherwise be dropped to no effect.
  static _tagIdAcceptor(_: TagId): void {}
}

function seedRoot(
  repo: InMemoryDirectoryRepository,
  owner: UserId,
): RootDirectory {
  const idGen = new FakeIdGenerator();
  const r = DirectoryFns.createRoot({ id: idGen.next(), ownerId: owner }, T0);
  repo.add(r);
  return r;
}

describe("DirectoryService.assertSiblingNameUnique", () => {
  it("passes when no sibling shares the name", async () => {
    const repo = new InMemoryDirectoryRepository();
    const root = seedRoot(repo, OWNER_A);
    await expect(
      DirectoryService.assertSiblingNameUnique(
        root.id,
        OWNER_A,
        DirectoryName.create("notes"),
        null,
        repo,
      ),
    ).resolves.toBeUndefined();
  });

  it("throws NameConflict when a sibling shares the name (case-insensitive)", async () => {
    const repo = new InMemoryDirectoryRepository();
    const root = seedRoot(repo, OWNER_A);
    repo.add(
      DirectoryFns.create(
        {
          id: "f0000000-0000-7000-8000-000000000001",
          ownerId: OWNER_A,
          parent: root,
          name: DirectoryName.create("Notes"),
        },
        T0,
      ),
    );
    try {
      await DirectoryService.assertSiblingNameUnique(
        root.id,
        OWNER_A,
        DirectoryName.create("notes"),
        null,
        repo,
      );
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(DirectoryErrorCode.NameConflict);
      }
    }
  });

  it("passes when the matching sibling is the entity itself (exceptId)", async () => {
    const repo = new InMemoryDirectoryRepository();
    const root = seedRoot(repo, OWNER_A);
    const me = DirectoryFns.create(
      {
        id: "f0000000-0000-7000-8000-000000000002",
        ownerId: OWNER_A,
        parent: root,
        name: DirectoryName.create("notes"),
      },
      T0,
    );
    repo.add(me);
    await expect(
      DirectoryService.assertSiblingNameUnique(
        root.id,
        OWNER_A,
        DirectoryName.create("notes"),
        me.id,
        repo,
      ),
    ).resolves.toBeUndefined();
  });
});

describe("DirectoryService.assertNotCyclicMove", () => {
  it("throws CyclicMove when moving onto itself", async () => {
    const repo = new InMemoryDirectoryRepository();
    const root = seedRoot(repo, OWNER_A);
    const a = DirectoryFns.create(
      {
        id: "f0000000-0000-7000-8000-00000000000a",
        ownerId: OWNER_A,
        parent: root,
        name: DirectoryName.create("a"),
      },
      T0,
    );
    repo.add(a);
    try {
      await DirectoryService.assertNotCyclicMove(a, a, repo);
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(DirectoryErrorCode.CyclicMove);
      }
    }
  });

  it("throws CyclicMove when moving under one of its descendants", async () => {
    const repo = new InMemoryDirectoryRepository();
    const root = seedRoot(repo, OWNER_A);
    const a = DirectoryFns.create(
      {
        id: "f0000000-0000-7000-8000-0000000000a1",
        ownerId: OWNER_A,
        parent: root,
        name: DirectoryName.create("a"),
      },
      T0,
    );
    repo.add(a);
    const b = DirectoryFns.create(
      {
        id: "f0000000-0000-7000-8000-0000000000b1",
        ownerId: OWNER_A,
        parent: a,
        name: DirectoryName.create("b"),
      },
      T0,
    );
    repo.add(b);
    try {
      await DirectoryService.assertNotCyclicMove(a, b, repo);
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(DirectoryErrorCode.CyclicMove);
      }
    }
  });

  it("passes when newParent is unrelated", async () => {
    const repo = new InMemoryDirectoryRepository();
    const root = seedRoot(repo, OWNER_A);
    const a = DirectoryFns.create(
      {
        id: "f0000000-0000-7000-8000-0000000000a2",
        ownerId: OWNER_A,
        parent: root,
        name: DirectoryName.create("a"),
      },
      T0,
    );
    const c = DirectoryFns.create(
      {
        id: "f0000000-0000-7000-8000-0000000000c2",
        ownerId: OWNER_A,
        parent: root,
        name: DirectoryName.create("c"),
      },
      T0,
    );
    repo.add(a);
    repo.add(c);
    await expect(
      DirectoryService.assertNotCyclicMove(a, c, repo),
    ).resolves.toBeUndefined();
  });
});

describe("DirectoryService.computePath", () => {
  it("returns '/' for the root directory", async () => {
    const repo = new InMemoryDirectoryRepository();
    const root = seedRoot(repo, OWNER_A);
    const path = await DirectoryService.computePath(root, repo);
    expect(path as unknown as string).toBe("/");
  });

  it("walks ancestors and joins their slugs", async () => {
    const repo = new InMemoryDirectoryRepository();
    const root = seedRoot(repo, OWNER_A);
    const a = DirectoryFns.create(
      {
        id: "f0000000-0000-7000-8000-0000000000a3",
        ownerId: OWNER_A,
        parent: root,
        name: DirectoryName.create("alpha"),
      },
      T0,
    );
    repo.add(a);
    const b = DirectoryFns.create(
      {
        id: "f0000000-0000-7000-8000-0000000000b3",
        ownerId: OWNER_A,
        parent: a,
        name: DirectoryName.create("beta"),
      },
      T0,
    );
    repo.add(b);
    const path = await DirectoryService.computePath(b, repo);
    expect(path as unknown as string).toBe("/alpha/beta");
  });
});

describe("DirectoryService.ensureRoot", () => {
  it("creates a root when none exists and persists it via the repo", async () => {
    const repo = new InMemoryDirectoryRepository();
    const idGen = new FakeIdGenerator();
    const root = await DirectoryService.ensureRoot(OWNER_A, T0, idGen, repo);
    expect(root.parentId).toBeNull();
    expect(repo.rows.size).toBe(1);
    const fetched = await repo.findRoot(OWNER_A);
    expect(fetched?.id).toBe(root.id);
  });

  it("returns the existing root without minting a new id", async () => {
    const repo = new InMemoryDirectoryRepository();
    const idGen = new FakeIdGenerator();
    const first = await DirectoryService.ensureRoot(OWNER_A, T0, idGen, repo);
    const second = await DirectoryService.ensureRoot(
      OWNER_A,
      at(10),
      idGen,
      repo,
    );
    expect(second.id).toBe(first.id);
    expect(repo.rows.size).toBe(1);
  });

  it("scopes roots per owner", async () => {
    const repo = new InMemoryDirectoryRepository();
    const idGen = new FakeIdGenerator();
    const rA = await DirectoryService.ensureRoot(OWNER_A, T0, idGen, repo);
    const rB = await DirectoryService.ensureRoot(OWNER_B, T0, idGen, repo);
    expect(rA.id).not.toBe(rB.id);
    expect(repo.rows.size).toBe(2);
  });
});

describe("DirectoryService.deleteSubtree", () => {
  it("throws CannotDeleteRoot when invoked on the root", async () => {
    const repo = new InMemoryDirectoryRepository();
    const root = seedRoot(repo, OWNER_A);
    const noteRepo = new StubNoteRepository();
    try {
      await DirectoryService.deleteSubtree(root, T0, {
        dirRepo: repo,
        noteRepo,
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(DirectoryErrorCode.CannotDeleteRoot);
      }
    }
  });

  it("deletes a single empty directory", async () => {
    const repo = new InMemoryDirectoryRepository();
    const root = seedRoot(repo, OWNER_A);
    const a = DirectoryFns.create(
      {
        id: "f0000000-0000-7000-8000-0000000000a4",
        ownerId: OWNER_A,
        parent: root,
        name: DirectoryName.create("a"),
      },
      T0,
    );
    repo.add(a);
    const noteRepo = new StubNoteRepository();

    const result = await DirectoryService.deleteSubtree(a, T0, {
      dirRepo: repo,
      noteRepo,
    });
    expect(result.deletedDirectoryIds).toEqual([a.id]);
    expect(result.trashedNoteIds).toEqual([]);
    expect(repo.rows.has(a.id as unknown as string)).toBe(false);
    // Root remains.
    expect(repo.rows.has(root.id as unknown as string)).toBe(true);
  });

  it("recursively deletes children before the parent (post-order)", async () => {
    const repo = new InMemoryDirectoryRepository();
    const root = seedRoot(repo, OWNER_A);
    const a = DirectoryFns.create(
      {
        id: "f0000000-0000-7000-8000-0000000000a5",
        ownerId: OWNER_A,
        parent: root,
        name: DirectoryName.create("a"),
      },
      T0,
    );
    repo.add(a);
    const b = DirectoryFns.create(
      {
        id: "f0000000-0000-7000-8000-0000000000b5",
        ownerId: OWNER_A,
        parent: a,
        name: DirectoryName.create("b"),
      },
      T0,
    );
    repo.add(b);
    const c = DirectoryFns.create(
      {
        id: "f0000000-0000-7000-8000-0000000000c5",
        ownerId: OWNER_A,
        parent: b,
        name: DirectoryName.create("c"),
      },
      T0,
    );
    repo.add(c);

    const noteRepo = new StubNoteRepository();
    const result = await DirectoryService.deleteSubtree(a, T0, {
      dirRepo: repo,
      noteRepo,
    });

    // Every node from `a` downward is gone; root remains.
    expect(repo.rows.has(a.id as unknown as string)).toBe(false);
    expect(repo.rows.has(b.id as unknown as string)).toBe(false);
    expect(repo.rows.has(c.id as unknown as string)).toBe(false);
    expect(repo.rows.has(root.id as unknown as string)).toBe(true);

    expect(result.deletedDirectoryIds).toHaveLength(3);
    // Deepest (`c`) must precede its parent (`b`) which precedes `a`.
    const order = result.deletedDirectoryIds.map(
      (id) => id as unknown as string,
    );
    expect(order.indexOf(c.id as unknown as string)).toBeLessThan(
      order.indexOf(b.id as unknown as string),
    );
    expect(order.indexOf(b.id as unknown as string)).toBeLessThan(
      order.indexOf(a.id as unknown as string),
    );
  });

  it("returns the ids of notes that were trashed during the walk", async () => {
    const repo = new InMemoryDirectoryRepository();
    const root = seedRoot(repo, OWNER_A);
    const a = DirectoryFns.create(
      {
        id: "f0000000-0000-7000-8000-0000000000a6",
        ownerId: OWNER_A,
        parent: root,
        name: DirectoryName.create("a"),
      },
      T0,
    );
    repo.add(a);
    const n1 = "note-1" as unknown as NoteId;
    const n2 = "note-2" as unknown as NoteId;
    const noteRepo = new StubNoteRepository();
    noteRepo.setNotes(a.id, [n1, n2]);

    const result = await DirectoryService.deleteSubtree(a, T0, {
      dirRepo: repo,
      noteRepo,
    });
    expect(result.trashedNoteIds).toEqual([n1, n2]);
  });
});
