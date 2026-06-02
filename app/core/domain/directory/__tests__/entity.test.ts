import { describe, expect, it } from "vitest";
import { isBusinessRuleError, isRehydrationError } from "@/core/domain/error";
import type { UserId } from "@/core/domain/identity/valueObject";
import { Directory } from "../entity";
import { DirectoryErrorCode } from "../errorCode";
import {
  DirectoryDepth,
  DirectoryId,
  DirectoryName,
  MAX_DIRECTORY_DEPTH,
} from "../valueObject";

const T0 = new Date(0);
const at = (ms: number) => new Date(T0.getTime() + ms);

const ID_BASE = "00000000-0000-7000-8000-";
const rawId = (n: number) => `${ID_BASE}${n.toString(16).padStart(12, "0")}`;
const dirId = (n: number) => DirectoryId.create(rawId(n));

const OWNER = "owner-1" as unknown as UserId;

const root = Directory.createRoot({ id: rawId(1), ownerId: OWNER }, T0);

describe("Directory.createRoot", () => {
  it("produces a RootDirectory at depth 0 with no parent", () => {
    expect(Directory.isRoot(root)).toBe(true);
    expect(root.parentId).toBeNull();
    expect(root.depth as number).toBe(0);
    expect(root.name as unknown as string).toBe("");
    expect(root.slug as unknown as string).toBe("");
    expect(root.version).toBe(0);
    expect(root.createdAt.getTime()).toBe(T0.getTime());
    expect(root.updatedAt.getTime()).toBe(T0.getTime());
  });
});

describe("Directory.create", () => {
  it("produces a ChildDirectory whose depth is parent.depth + 1", () => {
    const name = DirectoryName.create("notes");
    const child = Directory.create(
      { id: rawId(2), ownerId: OWNER, parent: root, name },
      T0,
    );
    expect(Directory.isChild(child)).toBe(true);
    expect(child.parentId).toBe(root.id);
    expect(child.depth as number).toBe((root.depth as number) + 1);
    expect(child.name as unknown as string).toBe("notes");
    expect(child.slug as unknown as string).toBe("notes");
    expect(child.version).toBe(0);
    expect(child.createdAt.getTime()).toBe(T0.getTime());
    expect(child.updatedAt.getTime()).toBe(T0.getTime());
  });

  it("derives a kebab slug from the name", () => {
    const name = DirectoryName.create("Hello World");
    const child = Directory.create(
      { id: rawId(3), ownerId: OWNER, parent: root, name },
      T0,
    );
    expect(child.slug as unknown as string).toBe("hello-world");
  });

  it("throws TooDeep when parent is already at the cap", () => {
    // Build a synthetic ChildDirectory pinned at MAX_DIRECTORY_DEPTH to
    // drive the depth-cap rejection without standing up a 10-step chain.
    const deep = Directory.reconstruct({
      id: rawId(4),
      ownerId: OWNER as unknown as string,
      parentId: rawId(1),
      name: "deep",
      slug: "deep",
      depth: MAX_DIRECTORY_DEPTH,
      version: 0,
      createdAt: T0,
      updatedAt: T0,
    });
    const name = DirectoryName.create("over");
    try {
      Directory.create(
        { id: rawId(5), ownerId: OWNER, parent: deep, name },
        T0,
      );
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(DirectoryErrorCode.TooDeep);
      }
    }
  });
});

describe("Directory.rename", () => {
  it("returns the same instance when the new name is equal (case-insensitive)", () => {
    const name = DirectoryName.create("Notes");
    const child = Directory.create(
      { id: rawId(10), ownerId: OWNER, parent: root, name },
      T0,
    );
    const renamed = Directory.rename(
      child,
      DirectoryName.create("notes"),
      at(50),
    );
    expect(renamed).toBe(child);
    expect(renamed.version).toBe(child.version);
    expect(renamed.updatedAt.getTime()).toBe(child.updatedAt.getTime());
  });

  it("bumps version, refreshes updatedAt, and recomputes slug when the name actually changes", () => {
    const child = Directory.create(
      {
        id: rawId(11),
        ownerId: OWNER,
        parent: root,
        name: DirectoryName.create("old"),
      },
      T0,
    );
    const renamed = Directory.rename(
      child,
      DirectoryName.create("New Name"),
      at(7),
    );
    expect(renamed.name as unknown as string).toBe("New Name");
    expect(renamed.slug as unknown as string).toBe("new-name");
    expect(renamed.version).toBe(child.version + 1);
    expect(renamed.updatedAt.getTime()).toBe(at(7).getTime());
    expect(renamed.createdAt.getTime()).toBe(child.createdAt.getTime());
  });
});

describe("Directory.moveTo", () => {
  it("updates parentId, recomputes depth, and bumps version", () => {
    const child = Directory.create(
      {
        id: rawId(20),
        ownerId: OWNER,
        parent: root,
        name: DirectoryName.create("a"),
      },
      T0,
    );
    const otherParent = Directory.create(
      {
        id: rawId(21),
        ownerId: OWNER,
        parent: root,
        name: DirectoryName.create("b"),
      },
      T0,
    );
    const moved = Directory.moveTo(child, otherParent, at(99));
    expect(moved.parentId).toBe(otherParent.id);
    expect(moved.depth as number).toBe((otherParent.depth as number) + 1);
    expect(moved.version).toBe(child.version + 1);
    expect(moved.updatedAt.getTime()).toBe(at(99).getTime());
  });

  it("returns the same instance when moving to the current parent", () => {
    const child = Directory.create(
      {
        id: rawId(25),
        ownerId: OWNER,
        parent: root,
        name: DirectoryName.create("stay"),
      },
      T0,
    );
    // child.parentId === root.id, so re-parenting under root changes
    // nothing (depth is unchanged too).
    const moved = Directory.moveTo(child, root, at(99));
    expect(moved).toBe(child);
  });

  it("throws CyclicMove when the new parent is the entity itself", () => {
    const child = Directory.create(
      {
        id: rawId(22),
        ownerId: OWNER,
        parent: root,
        name: DirectoryName.create("self"),
      },
      T0,
    );
    try {
      Directory.moveTo(child, child, at(1));
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(DirectoryErrorCode.CyclicMove);
      }
    }
  });

  it("throws TooDeep when moving under a parent that is already at the cap", () => {
    const deep = Directory.reconstruct({
      id: rawId(23),
      ownerId: OWNER as unknown as string,
      parentId: rawId(1),
      name: "deep",
      slug: "deep",
      depth: MAX_DIRECTORY_DEPTH,
      version: 0,
      createdAt: T0,
      updatedAt: T0,
    });
    const child = Directory.create(
      {
        id: rawId(24),
        ownerId: OWNER,
        parent: root,
        name: DirectoryName.create("c"),
      },
      T0,
    );
    try {
      Directory.moveTo(child, deep, at(1));
      expect.fail("should have thrown");
    } catch (error) {
      expect(isBusinessRuleError(error)).toBe(true);
      if (isBusinessRuleError(error)) {
        expect(error.code).toBe(DirectoryErrorCode.TooDeep);
      }
    }
  });
});

describe("Directory.recomputeDepth", () => {
  it("returns the same instance when the depth is already correct", () => {
    const child = Directory.create(
      {
        id: rawId(30),
        ownerId: OWNER,
        parent: root,
        name: DirectoryName.create("x"),
      },
      T0,
    );
    const recomputed = Directory.recomputeDepth(child, root.depth, at(50));
    expect(recomputed).toBe(child);
    expect(recomputed.version).toBe(child.version);
    expect(recomputed.updatedAt.getTime()).toBe(child.updatedAt.getTime());
  });

  it("bumps version and updatedAt when depth changes", () => {
    const child = Directory.create(
      {
        id: rawId(31),
        ownerId: OWNER,
        parent: root,
        name: DirectoryName.create("y"),
      },
      T0,
    );
    const parentDepth = DirectoryDepth.create(2);
    const recomputed = Directory.recomputeDepth(child, parentDepth, at(11));
    expect(recomputed.depth as number).toBe(3);
    expect(recomputed.version).toBe(child.version + 1);
    expect(recomputed.updatedAt.getTime()).toBe(at(11).getTime());
  });
});

describe("Directory.isRoot / isChild", () => {
  it("narrows roots and children correctly", () => {
    expect(Directory.isRoot(root)).toBe(true);
    expect(Directory.isChild(root)).toBe(false);

    const child = Directory.create(
      {
        id: rawId(40),
        ownerId: OWNER,
        parent: root,
        name: DirectoryName.create("c"),
      },
      T0,
    );
    expect(Directory.isRoot(child)).toBe(false);
    expect(Directory.isChild(child)).toBe(true);
  });
});

describe("Directory.reconstruct", () => {
  const validRoot = () => ({
    id: rawId(50),
    ownerId: "owner-1",
    parentId: null,
    name: "",
    slug: "",
    depth: 0,
    version: 2,
    createdAt: T0,
    updatedAt: at(5),
  });
  const validChild = () => ({
    id: rawId(51),
    ownerId: "owner-1",
    parentId: rawId(50),
    name: "child",
    slug: "child",
    depth: 1,
    version: 3,
    createdAt: T0,
    updatedAt: at(5),
  });

  it("rebuilds a RootDirectory from a well-formed row", () => {
    const r = Directory.reconstruct(validRoot());
    expect(Directory.isRoot(r)).toBe(true);
    expect(r.version).toBe(2);
  });

  it("rebuilds a ChildDirectory from a well-formed row", () => {
    const c = Directory.reconstruct(validChild());
    expect(Directory.isChild(c)).toBe(true);
    if (!Directory.isChild(c)) return;
    expect(c.parentId as unknown as string).toBe(rawId(50));
    expect(c.depth as number).toBe(1);
  });

  it("throws RehydrationError when root row has non-zero depth", () => {
    try {
      Directory.reconstruct({ ...validRoot(), depth: 2 });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isRehydrationError(error)).toBe(true);
      expect(isBusinessRuleError(error)).toBe(false);
    }
  });

  it("throws RehydrationError when non-root row has depth 0", () => {
    try {
      Directory.reconstruct({ ...validChild(), depth: 0 });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isRehydrationError(error)).toBe(true);
    }
  });

  it("throws RehydrationError when stored name is empty for a non-root row", () => {
    try {
      Directory.reconstruct({ ...validChild(), name: "" });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isRehydrationError(error)).toBe(true);
    }
  });

  it("throws RehydrationError when stored slug is malformed for a non-root row", () => {
    try {
      Directory.reconstruct({ ...validChild(), slug: "Not Valid" });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isRehydrationError(error)).toBe(true);
    }
  });

  it("throws RehydrationError when version is negative", () => {
    try {
      Directory.reconstruct({ ...validChild(), version: -1 });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isRehydrationError(error)).toBe(true);
    }
  });

  it("throws RehydrationError when depth exceeds the cap", () => {
    try {
      Directory.reconstruct({
        ...validChild(),
        depth: MAX_DIRECTORY_DEPTH + 1,
      });
      expect.fail("should have thrown");
    } catch (error) {
      expect(isRehydrationError(error)).toBe(true);
    }
  });
});

// Trivial smoke for `dirId` helper so unused-imports lint stays clean and to
// document its intended use in service / property tests downstream.
describe("dirId helper", () => {
  it("returns a branded DirectoryId from a UUIDv7-shaped string", () => {
    const id = dirId(99);
    expect(id as unknown as string).toBe(rawId(99));
  });
});
