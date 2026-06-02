import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import * as schema from "@/core/adapters/d1/schema";
import type { TestContainer } from "@/core/application/__tests__/helpers";
import { setupTestContainer } from "@/core/application/__tests__/helpers";
import { isBusinessRuleError } from "@/core/domain/error";
import { isForbiddenError, isNotFoundError } from "../../errors";
import { createDirectory } from "../createDirectory";
import { deleteDirectory } from "../deleteDirectory";
import { getDirectoryTree } from "../getDirectoryTree";
import { moveDirectory } from "../moveDirectory";
import { renameDirectory } from "../renameDirectory";

// Per-process monotonic counter used to mint unique user identities for
// every `seedUser` call. The shared D1 isolate's `beforeEach` TRUNCATE
// resets the rows table-by-table, but rolling our own non-clashing
// `username` / `email` strings is the only way to insulate this file
// from any future cleanup-order regression.
let userSeq = 0;
function nextUserSuffix(): string {
  userSeq += 1;
  // 12-char hex tail matches the UUIDv7 layout adapters validate against.
  return userSeq.toString(16).padStart(12, "0");
}

/**
 * Mints a unique user row and returns its id. Directories FK to
 * `users.id` with `ON DELETE CASCADE`, so the setup file's TRUNCATE on
 * `users` is what keeps row count bounded between tests; the unique
 * suffix here only protects against per-test ordering quirks.
 */
async function seedUser(container: TestContainer): Promise<string> {
  const suffix = nextUserSuffix();
  const userId = `019d0000-0000-7000-8000-${suffix}`;
  const now = new Date().toISOString();
  await container.db.insert(schema.users).values({
    id: userId,
    name: `user-${suffix}`,
    email: `user-${suffix}@example.test`,
    emailVerified: 1,
    username: `user_${suffix}`,
    createdAt: now,
    updatedAt: now,
  });
  return userId;
}

describe("createDirectory (integration)", () => {
  const getContainer = setupTestContainer();

  it("creates a directory under the user's root and commits in one batch", async () => {
    const container = getContainer();
    const userId = await seedUser(container);

    const { directory } = await createDirectory({
      container,
      input: { actorUserId: userId, parentId: null, name: "notes" },
    });

    expect(directory.name).toBe("notes");
    expect(directory.depth).toBe(1);
    expect(directory.parentId).not.toBeNull();
    // Both root and the created directory persisted.
    const rows = await container.db.select().from(schema.directories);
    expect(rows).toHaveLength(2);
  });

  it("throws NameConflict for a sibling with the same name (case-insensitive)", async () => {
    const container = getContainer();
    const userId = await seedUser(container);

    await createDirectory({
      container,
      input: { actorUserId: userId, parentId: null, name: "Notes" },
    });

    try {
      await createDirectory({
        container,
        input: { actorUserId: userId, parentId: null, name: "notes" },
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe("directory_name_conflict");
      }
    }
  });

  it("throws TooDeep when creating a directory at the 11th level", async () => {
    const container = getContainer();
    const userId = await seedUser(container);

    // depth 1..10 — the cap. Subsequent create should reject.
    let parentId: string | null = null;
    for (let i = 1; i <= 10; i += 1) {
      const { directory } = await createDirectory({
        container,
        input: { actorUserId: userId, parentId, name: `d${i}` },
      });
      parentId = directory.id as unknown as string;
    }

    try {
      await createDirectory({
        container,
        input: { actorUserId: userId, parentId, name: "over" },
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe("directory_too_deep");
      }
    }
  });

  it("throws Forbidden when parent belongs to another user", async () => {
    const container = getContainer();
    const userA = await seedUser(container);
    const userB = await seedUser(container);

    const { directory: aDir } = await createDirectory({
      container,
      input: { actorUserId: userA, parentId: null, name: "a-dir" },
    });

    try {
      await createDirectory({
        container,
        input: {
          actorUserId: userB,
          parentId: aDir.id as unknown as string,
          name: "intruder",
        },
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isForbiddenError(error)).toBe(true);
    }
  });

  it("rejects names with forbidden characters at the value-object boundary", async () => {
    const container = getContainer();
    const userId = await seedUser(container);

    try {
      await createDirectory({
        container,
        input: { actorUserId: userId, parentId: null, name: "bad/slash" },
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe("directory_name_forbidden_character");
      }
    }
  });

  it("throws NotFound when parentId does not exist", async () => {
    const container = getContainer();
    const userId = await seedUser(container);
    const missingParent = "019dffff-ffff-7fff-8fff-ffffffffffff";

    try {
      await createDirectory({
        container,
        input: { actorUserId: userId, parentId: missingParent, name: "x" },
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isNotFoundError(error)).toBe(true);
    }
  });
});

describe("renameDirectory (integration)", () => {
  const getContainer = setupTestContainer();

  it("renames a directory and bumps its version", async () => {
    const container = getContainer();
    const userId = await seedUser(container);
    const { directory } = await createDirectory({
      container,
      input: { actorUserId: userId, parentId: null, name: "old" },
    });

    const { directory: renamed } = await renameDirectory({
      container,
      input: {
        actorUserId: userId,
        directoryId: directory.id as unknown as string,
        newName: "new",
      },
    });

    expect(renamed.name).toBe("new");
    const rows = await container.db.select().from(schema.directories);
    const row = rows.find((r) => r.id === (directory.id as unknown as string));
    expect(row?.name).toBe("new");
    expect(row?.version).toBe(1);
  });

  it("throws CannotRenameRoot when targeting the root", async () => {
    const container = getContainer();
    const userId = await seedUser(container);
    // ensureRoot via a no-op createDirectory call.
    await createDirectory({
      container,
      input: { actorUserId: userId, parentId: null, name: "seed" },
    });

    // Filter by ownerId — the integration setup TRUNCATE order can leave
    // stale roots from earlier suites in the same file when the cleanup
    // batch hits a constraint, so we cannot rely on `parentId === null`
    // alone to land on *this* user's root.
    const rows = await container.db.select().from(schema.directories);
    const rootRow = rows.find(
      (r) => r.parentId === null && r.ownerId === userId,
    );
    expect(rootRow).toBeDefined();
    if (rootRow === undefined) return;

    try {
      await renameDirectory({
        container,
        input: {
          actorUserId: userId,
          directoryId: rootRow.id,
          newName: "anything",
        },
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe("cannot_rename_root");
      }
    }
  });

  it("throws NameConflict when a sibling already has the target name", async () => {
    const container = getContainer();
    const userId = await seedUser(container);
    await createDirectory({
      container,
      input: { actorUserId: userId, parentId: null, name: "alpha" },
    });
    const { directory: beta } = await createDirectory({
      container,
      input: { actorUserId: userId, parentId: null, name: "beta" },
    });

    try {
      await renameDirectory({
        container,
        input: {
          actorUserId: userId,
          directoryId: beta.id as unknown as string,
          newName: "alpha",
        },
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe("directory_name_conflict");
      }
    }
  });

  it("treats renaming to the same name (case-insensitive) as a no-op", async () => {
    const container = getContainer();
    const userId = await seedUser(container);
    const { directory } = await createDirectory({
      container,
      input: { actorUserId: userId, parentId: null, name: "Notes" },
    });

    const { directory: renamed } = await renameDirectory({
      container,
      input: {
        actorUserId: userId,
        directoryId: directory.id as unknown as string,
        newName: "notes",
      },
    });

    expect(renamed.name).toBe("Notes");
    const rows = await container.db.select().from(schema.directories);
    const row = rows.find((r) => r.id === (directory.id as unknown as string));
    expect(row?.version).toBe(0);
  });
});

describe("moveDirectory (integration)", () => {
  const getContainer = setupTestContainer();

  it("moves a directory under a new parent and recomputes its depth", async () => {
    const container = getContainer();
    const userId = await seedUser(container);
    const { directory: alpha } = await createDirectory({
      container,
      input: { actorUserId: userId, parentId: null, name: "alpha" },
    });
    const { directory: beta } = await createDirectory({
      container,
      input: { actorUserId: userId, parentId: null, name: "beta" },
    });
    const { directory: child } = await createDirectory({
      container,
      input: {
        actorUserId: userId,
        parentId: alpha.id as unknown as string,
        name: "child",
      },
    });
    // child currently sits at depth 2 under alpha.

    const { directory: moved } = await moveDirectory({
      container,
      input: {
        actorUserId: userId,
        directoryId: child.id as unknown as string,
        newParentId: beta.id as unknown as string,
      },
    });
    expect(moved.parentId).toBe(beta.id);
    expect(moved.depth).toBe(2);
  });

  it("recomputes depth of descendants after a move", async () => {
    const container = getContainer();
    const userId = await seedUser(container);

    const { directory: alpha } = await createDirectory({
      container,
      input: { actorUserId: userId, parentId: null, name: "alpha" },
    });
    const { directory: beta } = await createDirectory({
      container,
      input: { actorUserId: userId, parentId: null, name: "beta" },
    });
    const { directory: child } = await createDirectory({
      container,
      input: {
        actorUserId: userId,
        parentId: alpha.id as unknown as string,
        name: "child",
      },
    });
    const { directory: grand } = await createDirectory({
      container,
      input: {
        actorUserId: userId,
        parentId: child.id as unknown as string,
        name: "grand",
      },
    });
    // grand at depth 3.

    await moveDirectory({
      container,
      input: {
        actorUserId: userId,
        directoryId: child.id as unknown as string,
        // Moving child up to root level — its depth drops to 1; grand to 2.
        newParentId: null,
      },
    });

    const rows = await container.db.select().from(schema.directories);
    const childRow = rows.find((r) => r.id === (child.id as unknown as string));
    const grandRow = rows.find((r) => r.id === (grand.id as unknown as string));
    expect(childRow?.depth).toBe(1);
    expect(grandRow?.depth).toBe(2);
    // beta untouched.
    const betaRow = rows.find((r) => r.id === (beta.id as unknown as string));
    expect(betaRow?.depth).toBe(1);
  });

  it("throws CyclicMove when the new parent is a descendant of the target", async () => {
    const container = getContainer();
    const userId = await seedUser(container);
    const { directory: a } = await createDirectory({
      container,
      input: { actorUserId: userId, parentId: null, name: "a" },
    });
    const { directory: b } = await createDirectory({
      container,
      input: {
        actorUserId: userId,
        parentId: a.id as unknown as string,
        name: "b",
      },
    });

    try {
      await moveDirectory({
        container,
        input: {
          actorUserId: userId,
          directoryId: a.id as unknown as string,
          newParentId: b.id as unknown as string,
        },
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe("directory_cyclic_move");
      }
    }
  });

  it("throws NameConflict when destination already has a sibling with the same name", async () => {
    const container = getContainer();
    const userId = await seedUser(container);
    const { directory: alpha } = await createDirectory({
      container,
      input: { actorUserId: userId, parentId: null, name: "alpha" },
    });
    const { directory: beta } = await createDirectory({
      container,
      input: { actorUserId: userId, parentId: null, name: "beta" },
    });
    // Both alpha and beta have a "common" child.
    await createDirectory({
      container,
      input: {
        actorUserId: userId,
        parentId: alpha.id as unknown as string,
        name: "common",
      },
    });
    const { directory: bCommon } = await createDirectory({
      container,
      input: {
        actorUserId: userId,
        parentId: beta.id as unknown as string,
        name: "common",
      },
    });

    try {
      await moveDirectory({
        container,
        input: {
          actorUserId: userId,
          directoryId: bCommon.id as unknown as string,
          newParentId: alpha.id as unknown as string,
        },
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe("directory_name_conflict");
      }
    }
  });

  it("throws TooDeep when the destination would push the moved subtree past the cap", async () => {
    const container = getContainer();
    const userId = await seedUser(container);

    // Build a chain of depth 10 under root (root + 10 children = 11 nodes,
    // deepest child at depth 10).
    let chainParent: string | null = null;
    const chainIds: string[] = [];
    for (let i = 1; i <= 10; i += 1) {
      const { directory } = await createDirectory({
        container,
        input: {
          actorUserId: userId,
          parentId: chainParent,
          name: `c${i}`,
        },
      });
      chainParent = directory.id as unknown as string;
      chainIds.push(chainParent);
    }
    const deepest = chainIds[chainIds.length - 1] as string;

    // Sibling at depth 1.
    const { directory: sibling } = await createDirectory({
      container,
      input: { actorUserId: userId, parentId: null, name: "sibling" },
    });

    // Moving sibling under the deepest node would land it at depth 11.
    try {
      await moveDirectory({
        container,
        input: {
          actorUserId: userId,
          directoryId: sibling.id as unknown as string,
          newParentId: deepest,
        },
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe("directory_too_deep");
      }
    }
  });
});

describe("deleteDirectory (integration)", () => {
  const getContainer = setupTestContainer();

  it("deletes an empty directory and emits one directory.deleted event (Issue #181)", async () => {
    const container = getContainer();
    const userId = await seedUser(container);
    const { directory } = await createDirectory({
      container,
      input: { actorUserId: userId, parentId: null, name: "empty" },
    });

    const result = await deleteDirectory({
      container,
      input: {
        actorUserId: userId,
        directoryId: directory.id as unknown as string,
      },
    });

    expect(result.deletedDirectoryIds).toHaveLength(1);
    expect(result.trashedNoteIds).toHaveLength(0);

    const rows = await container.db
      .select()
      .from(schema.directories)
      .where(eq(schema.directories.id, directory.id as unknown as string));
    expect(rows).toHaveLength(0);

    // Issue #181: even an empty directory (no child notes → no note.trashed)
    // emits a directory.deleted so the view broken-marker path is reachable.
    const outboxAfter = await container.db.select().from(schema.outboxEvents);
    const directoryDeleted = outboxAfter.filter(
      (r) => r.eventType === "directory.deleted",
    );
    expect(directoryDeleted).toHaveLength(1);
    expect(directoryDeleted[0]?.aggregateId).toBe(
      directory.id as unknown as string,
    );
    expect(directoryDeleted[0]?.payload).toEqual({
      directoryId: directory.id as unknown as string,
      name: "empty",
    });
    expect(
      outboxAfter.filter((r) => r.eventType === "note.trashed"),
    ).toHaveLength(0);
  });

  it("recursively deletes child directories and emits one directory.deleted per removed node (Issue #181)", async () => {
    const container = getContainer();
    const userId = await seedUser(container);
    const { directory: a } = await createDirectory({
      container,
      input: { actorUserId: userId, parentId: null, name: "a" },
    });
    const { directory: b } = await createDirectory({
      container,
      input: {
        actorUserId: userId,
        parentId: a.id as unknown as string,
        name: "b",
      },
    });
    const { directory: c } = await createDirectory({
      container,
      input: {
        actorUserId: userId,
        parentId: b.id as unknown as string,
        name: "c",
      },
    });

    const result = await deleteDirectory({
      container,
      input: {
        actorUserId: userId,
        directoryId: a.id as unknown as string,
      },
    });
    expect(result.deletedDirectoryIds).toHaveLength(3);

    const remaining = await container.db.select().from(schema.directories);
    // Only the user's root remains.
    const ids = remaining.map((r) => r.id);
    expect(ids).not.toContain(a.id);
    expect(ids).not.toContain(b.id);
    expect(ids).not.toContain(c.id);

    // Issue #181: one directory.deleted per removed directory, addressed by
    // its own directoryId.
    const outboxAfter = await container.db.select().from(schema.outboxEvents);
    const deletedAggregateIds = outboxAfter
      .filter((r) => r.eventType === "directory.deleted")
      .map((r) => r.aggregateId);
    expect(deletedAggregateIds).toHaveLength(3);
    expect(new Set(deletedAggregateIds)).toEqual(
      new Set([
        a.id as unknown as string,
        b.id as unknown as string,
        c.id as unknown as string,
      ]),
    );
  });

  it("throws CannotDeleteRoot when targeting the root", async () => {
    const container = getContainer();
    const userId = await seedUser(container);
    // Ensure the root exists.
    await createDirectory({
      container,
      input: { actorUserId: userId, parentId: null, name: "seed" },
    });

    const rows = await container.db.select().from(schema.directories);
    const rootRow = rows.find(
      (r) => r.parentId === null && r.ownerId === userId,
    );
    expect(rootRow).toBeDefined();
    if (rootRow === undefined) return;

    try {
      await deleteDirectory({
        container,
        input: { actorUserId: userId, directoryId: rootRow.id },
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe("cannot_delete_root");
      }
    }
  });

  it("throws Forbidden when targeting another user's directory", async () => {
    const container = getContainer();
    const userA = await seedUser(container);
    const userB = await seedUser(container);
    const { directory } = await createDirectory({
      container,
      input: { actorUserId: userA, parentId: null, name: "mine" },
    });

    try {
      await deleteDirectory({
        container,
        input: {
          actorUserId: userB,
          directoryId: directory.id as unknown as string,
        },
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isForbiddenError(error)).toBe(true);
    }
  });
});

describe("getDirectoryTree (integration)", () => {
  const getContainer = setupTestContainer();

  it("returns the user's directory forest with nested children", async () => {
    const container = getContainer();
    const userId = await seedUser(container);
    const { directory: a } = await createDirectory({
      container,
      input: { actorUserId: userId, parentId: null, name: "alpha" },
    });
    const { directory: b } = await createDirectory({
      container,
      input: {
        actorUserId: userId,
        parentId: a.id as unknown as string,
        name: "beta",
      },
    });
    await createDirectory({
      container,
      input: { actorUserId: userId, parentId: null, name: "gamma" },
    });

    const { tree } = await getDirectoryTree({
      container,
      input: { actorUserId: userId },
    });

    // Top level: just the user's root.
    expect(tree).toHaveLength(1);
    const root = tree[0];
    expect(root).toBeDefined();
    if (root === undefined) return;
    expect(root.parentId).toBeNull();
    // Root has two children (alpha, gamma); alpha has one child (beta).
    expect(root.children).toHaveLength(2);
    const alphaNode = root.children.find(
      (n) => (n.id as unknown as string) === (a.id as unknown as string),
    );
    expect(alphaNode).toBeDefined();
    if (alphaNode === undefined) return;
    expect(alphaNode.children).toHaveLength(1);
    expect(alphaNode.children[0]?.id).toBe(b.id);
  });

  it("returns an empty forest for a brand-new user with no root yet", async () => {
    const container = getContainer();
    const userId = await seedUser(container);
    const { tree } = await getDirectoryTree({
      container,
      input: { actorUserId: userId },
    });
    // ensureRoot runs lazily on first write; readonly tree fetch should
    // simply yield an empty list.
    expect(tree).toHaveLength(0);
  });
});
