import { describe, expect, it } from "vitest";
import type { SerializedError } from "@/core/presentation/errorResponse";
import {
  createInitialEditorState,
  type EditorState,
  editorReducer,
  parseTagInput,
  snapshotForSubmit,
  stringifyFrontMatter,
} from "../editorState";

const baseInit = {
  title: "Hello",
  contentHtml: "<p>hi</p>",
  frontMatter: {} as Record<string, unknown>,
  directoryId: null,
  tagNames: ["draft"],
};

function freshState(): EditorState {
  return createInitialEditorState(baseInit);
}

describe("createInitialEditorState", () => {
  it("seeds visible fields from init and starts idle", () => {
    const s = freshState();
    expect(s.title).toBe("Hello");
    expect(s.contentHtml).toBe("<p>hi</p>");
    expect(s.tagInput).toBe("draft");
    expect(s.frontMatterRawJson).toBe("{}");
    expect(s.dirtyKeys.size).toBe(0);
    expect(s.autosave.kind).toBe("idle");
    expect(s.editLock.state).toBe("unknown");
    expect(s.mode).toBe("html");
    expect(s.frontMatterMode).toBe("structured");
  });

  it("serialises a non-empty frontMatter for raw view", () => {
    const s = createInitialEditorState({
      ...baseInit,
      frontMatter: { title: "x" },
    });
    expect(s.frontMatterRawJson).toContain(`"title"`);
  });
});

describe("editorReducer setters", () => {
  it("setTitle marks `title` dirty and bumps autosave to dirty", () => {
    const s = editorReducer(freshState(), { type: "setTitle", value: "New" });
    expect(s.title).toBe("New");
    expect(s.dirtyKeys.has("title")).toBe(true);
    expect(s.autosave.kind).toBe("dirty");
  });

  it("setTitle with identical value is a referential no-op", () => {
    const s0 = freshState();
    const s1 = editorReducer(s0, { type: "setTitle", value: s0.title });
    expect(s1).toBe(s0);
  });

  it("setContent marks `content` dirty", () => {
    const s = editorReducer(freshState(), {
      type: "setContent",
      value: "<p>new</p>",
    });
    expect(s.contentHtml).toBe("<p>new</p>");
    expect(s.dirtyKeys.has("content")).toBe(true);
  });

  it("setFrontMatterField updates the parsed object and re-serialises raw", () => {
    const s = editorReducer(freshState(), {
      type: "setFrontMatterField",
      key: "title",
      value: "From FM",
    });
    expect(s.frontMatter.title).toBe("From FM");
    expect(s.frontMatterRawJson).toContain(`"title"`);
    expect(s.dirtyKeys.has("frontMatter")).toBe(true);
    expect(s.frontMatterJsonError).toBe(null);
  });

  it("setFrontMatterField with `undefined` removes the key", () => {
    const s0 = editorReducer(freshState(), {
      type: "setFrontMatterField",
      key: "x",
      value: 1,
    });
    const s1 = editorReducer(s0, {
      type: "setFrontMatterField",
      key: "x",
      value: undefined,
    });
    expect("x" in s1.frontMatter).toBe(false);
  });

  it("setFrontMatterRawJson records the error and keeps the raw text on invalid JSON", () => {
    const s = editorReducer(freshState(), {
      type: "setFrontMatterRawJson",
      value: "{not json",
    });
    expect(s.frontMatterJsonError).not.toBe(null);
    expect(s.frontMatterRawJson).toBe("{not json");
    expect(s.dirtyKeys.has("frontMatter")).toBe(true);
  });

  it("setFrontMatterRawJson rejects arrays / primitives", () => {
    const arr = editorReducer(freshState(), {
      type: "setFrontMatterRawJson",
      value: "[1, 2]",
    });
    expect(arr.frontMatterJsonError).not.toBe(null);
    const prim = editorReducer(freshState(), {
      type: "setFrontMatterRawJson",
      value: "42",
    });
    expect(prim.frontMatterJsonError).not.toBe(null);
  });

  it("setFrontMatterRawJson on valid object updates parsed view", () => {
    const s = editorReducer(freshState(), {
      type: "setFrontMatterRawJson",
      value: `{ "title": "x" }`,
    });
    expect(s.frontMatter.title).toBe("x");
    expect(s.frontMatterJsonError).toBe(null);
  });

  it("setFrontMatterRawJson with empty string is treated as `{}`", () => {
    const s = editorReducer(freshState(), {
      type: "setFrontMatterRawJson",
      value: "   ",
    });
    expect(s.frontMatterJsonError).toBe(null);
    expect(s.frontMatter).toEqual({});
  });

  it("toggleFrontMatterMode flips the mode and re-syncs the raw text from parsed", () => {
    const s0 = editorReducer(freshState(), {
      type: "setFrontMatterField",
      key: "title",
      value: "x",
    });
    const s1 = editorReducer(s0, { type: "toggleFrontMatterMode" });
    expect(s1.frontMatterMode).toBe("raw");
    expect(s1.frontMatterRawJson).toContain("x");
  });

  it("toggleFrontMatterMode back to structured commits valid raw to parsed", () => {
    const s0 = editorReducer(freshState(), { type: "toggleFrontMatterMode" });
    const s1 = editorReducer(s0, {
      type: "setFrontMatterRawJson",
      value: `{ "k": 1 }`,
    });
    const s2 = editorReducer(s1, { type: "toggleFrontMatterMode" });
    expect(s2.frontMatterMode).toBe("structured");
    expect(s2.frontMatter.k).toBe(1);
  });

  it("toggleFrontMatterMode back to structured surfaces the parse error and stays in raw payload", () => {
    const s0 = editorReducer(freshState(), { type: "toggleFrontMatterMode" });
    const s1 = editorReducer(s0, {
      type: "setFrontMatterRawJson",
      value: "{nope",
    });
    const s2 = editorReducer(s1, { type: "toggleFrontMatterMode" });
    expect(s2.frontMatterMode).toBe("structured");
    expect(s2.frontMatterJsonError).not.toBe(null);
  });

  it("setDirectory updates the directory and clears any pending name", () => {
    const s0 = editorReducer(freshState(), {
      type: "setPendingDirectoryName",
      value: "Inbox",
    });
    const s1 = editorReducer(s0, {
      type: "setDirectory",
      directoryId: "dir-1",
    });
    expect(s1.directoryId).toBe("dir-1");
    expect(s1.pendingDirectoryName).toBe(null);
    expect(s1.dirtyKeys.has("directory")).toBe(true);
  });

  it("setPendingDirectoryName clears the existing directoryId", () => {
    const s0 = editorReducer(freshState(), {
      type: "setDirectory",
      directoryId: "dir-1",
    });
    const s1 = editorReducer(s0, {
      type: "setPendingDirectoryName",
      value: "Inbox",
    });
    expect(s1.directoryId).toBe(null);
    expect(s1.pendingDirectoryName).toBe("Inbox");
  });

  // W-013: same-value writes are referential no-ops for both directory
  // setters. This keeps the reducer from churning `dirtyKeys` (and
  // bouncing autosave) when a controlled input re-emits the current
  // value during re-render.
  it("setDirectory with the same directoryId is a referential no-op", () => {
    const s0 = editorReducer(freshState(), {
      type: "setDirectory",
      directoryId: "dir-1",
    });
    const s1 = editorReducer(s0, {
      type: "setDirectory",
      directoryId: "dir-1",
    });
    expect(s1).toBe(s0);
  });

  it("setDirectory with the same null directoryId is a referential no-op", () => {
    const s0 = freshState();
    const s1 = editorReducer(s0, {
      type: "setDirectory",
      directoryId: null,
    });
    expect(s1).toBe(s0);
  });

  it("setPendingDirectoryName with the same value is a referential no-op", () => {
    const s0 = editorReducer(freshState(), {
      type: "setPendingDirectoryName",
      value: "Inbox",
    });
    const s1 = editorReducer(s0, {
      type: "setPendingDirectoryName",
      value: "Inbox",
    });
    expect(s1).toBe(s0);
  });

  it("setPendingDirectoryName with the same null value is a referential no-op", () => {
    const s0 = freshState();
    const s1 = editorReducer(s0, {
      type: "setPendingDirectoryName",
      value: null,
    });
    expect(s1).toBe(s0);
  });

  it("setMode no-ops on `wysiwyg-disabled`", () => {
    const s0 = freshState();
    const s1 = editorReducer(s0, {
      type: "setMode",
      mode: "wysiwyg-disabled",
    });
    expect(s1).toBe(s0);
  });

  it("setMode switches between html and frontMatter", () => {
    const s = editorReducer(freshState(), {
      type: "setMode",
      mode: "frontMatter",
    });
    expect(s.mode).toBe("frontMatter");
  });

  it("setTagInput updates the raw tag string and marks tags dirty", () => {
    const s = editorReducer(freshState(), {
      type: "setTagInput",
      value: "a, b",
    });
    expect(s.tagInput).toBe("a, b");
    expect(s.dirtyKeys.has("tags")).toBe(true);
  });
});

describe("editorReducer autosave actions", () => {
  it("autosaveStart transitions to saving", () => {
    const s = editorReducer(freshState(), { type: "autosaveStart" });
    expect(s.autosave.kind).toBe("saving");
  });

  it("autosaveSuccess clears dirty keys and records the timestamp", () => {
    const s0 = editorReducer(freshState(), { type: "setTitle", value: "x" });
    const s1 = editorReducer(s0, { type: "autosaveStart" });
    const s2 = editorReducer(s1, { type: "autosaveSuccess", at: 1700 });
    expect(s2.dirtyKeys.size).toBe(0);
    expect(s2.autosave).toEqual({ kind: "saved", savedAt: 1700 });
  });

  it("autosaveError surfaces the SerializedError without clearing dirty", () => {
    const s0 = editorReducer(freshState(), { type: "setTitle", value: "x" });
    const err: SerializedError = {
      kind: "system",
      code: null,
      message: "boom",
    };
    const s1 = editorReducer(s0, { type: "autosaveError", error: err });
    expect(s1.autosave.kind).toBe("error");
    expect(s1.dirtyKeys.has("title")).toBe(true);
  });

  it("a field setter during `saving` leaves autosave on `saving`", () => {
    const s0 = editorReducer(freshState(), { type: "autosaveStart" });
    const s1 = editorReducer(s0, { type: "setTitle", value: "x" });
    expect(s1.autosave.kind).toBe("saving");
    expect(s1.dirtyKeys.has("title")).toBe(true);
  });

  // W-001: every dirty-marking setter must preserve `saving` so an
  // in-flight autosave is not retroactively downgraded to `dirty` by a
  // user keystroke landing mid-flight.
  it.each([
    {
      label: "setContent",
      action: { type: "setContent", value: "<p>new</p>" } as const,
    },
    {
      label: "setFrontMatterField",
      action: {
        type: "setFrontMatterField",
        key: "k",
        value: 1,
      } as const,
    },
    {
      label: "setFrontMatterRawJson",
      action: {
        type: "setFrontMatterRawJson",
        value: `{ "k": 1 }`,
      } as const,
    },
    {
      label: "setTagInput",
      action: { type: "setTagInput", value: "a, b" } as const,
    },
    {
      label: "setDirectory",
      action: { type: "setDirectory", directoryId: "dir-1" } as const,
    },
    {
      label: "setPendingDirectoryName",
      action: {
        type: "setPendingDirectoryName",
        value: "Inbox",
      } as const,
    },
  ])("$label during `saving` leaves autosave on `saving`", ({ action }) => {
    const s0 = editorReducer(freshState(), { type: "autosaveStart" });
    expect(s0.autosave.kind).toBe("saving");
    const s1 = editorReducer(s0, action);
    expect(s1.autosave.kind).toBe("saving");
  });
});

describe("editorReducer edit-lock actions", () => {
  it("acquired sets state and propagates id / expiresAt", () => {
    const s = editorReducer(freshState(), {
      type: "editLockAcquired",
      lockId: "lock-1",
      expiresAt: 9999,
    });
    expect(s.editLock).toEqual({
      state: "acquired",
      lockId: "lock-1",
      expiresAt: 9999,
    });
  });

  it("denied keeps expiresAt for banner display but nulls the id", () => {
    const s = editorReducer(freshState(), {
      type: "editLockDenied",
      expiresAt: 9999,
    });
    expect(s.editLock).toEqual({
      state: "denied",
      lockId: null,
      expiresAt: 9999,
    });
  });

  it("released collapses to the canonical released sentinel", () => {
    const s0 = editorReducer(freshState(), {
      type: "editLockAcquired",
      lockId: "lock-1",
      expiresAt: 1,
    });
    const s1 = editorReducer(s0, { type: "editLockReleased" });
    expect(s1.editLock).toEqual({
      state: "released",
      lockId: null,
      expiresAt: null,
    });
  });

  // W-002: the lock hook can drive the reducer through every legal
  // transition during a single mount. We exercise the explicit edges so
  // a regression in one branch surfaces as a focused failure.
  it("released → acquired", () => {
    const s0 = editorReducer(freshState(), { type: "editLockReleased" });
    expect(s0.editLock.state).toBe("released");
    const s1 = editorReducer(s0, {
      type: "editLockAcquired",
      lockId: "lock-1",
      expiresAt: 1000,
    });
    expect(s1.editLock).toEqual({
      state: "acquired",
      lockId: "lock-1",
      expiresAt: 1000,
    });
  });

  it("released → denied", () => {
    const s0 = editorReducer(freshState(), { type: "editLockReleased" });
    const s1 = editorReducer(s0, {
      type: "editLockDenied",
      expiresAt: 5000,
    });
    expect(s1.editLock).toEqual({
      state: "denied",
      lockId: null,
      expiresAt: 5000,
    });
  });

  it("denied → acquired (promotion)", () => {
    const s0 = editorReducer(freshState(), {
      type: "editLockDenied",
      expiresAt: 5000,
    });
    const s1 = editorReducer(s0, {
      type: "editLockAcquired",
      lockId: "lock-promoted",
      expiresAt: 9000,
    });
    expect(s1.editLock).toEqual({
      state: "acquired",
      lockId: "lock-promoted",
      expiresAt: 9000,
    });
  });

  it("acquired → acquired updates expiresAt and produces a new state object", () => {
    const s0 = editorReducer(freshState(), {
      type: "editLockAcquired",
      lockId: "lock-1",
      expiresAt: 1000,
    });
    const s1 = editorReducer(s0, {
      type: "editLockAcquired",
      lockId: "lock-1",
      expiresAt: 2000,
    });
    expect(s1.editLock.state).toBe("acquired");
    expect(s1.editLock.expiresAt).toBe(2000);
    // The reducer always allocates a new EditLockState on acquire so
    // React detects the change; referential inequality is the contract.
    expect(s1.editLock).not.toBe(s0.editLock);
    expect(s1).not.toBe(s0);
  });
});

describe("editorReducer media insertions", () => {
  it("mediaInsertionAdded appends to the insertion history", () => {
    const s0 = editorReducer(freshState(), {
      type: "mediaInsertionAdded",
      insertion: { id: "m1", url: "/media/m1" },
    });
    const s1 = editorReducer(s0, {
      type: "mediaInsertionAdded",
      insertion: { id: "m2", url: "/media/m2" },
    });
    expect(s1.mediaInsertions).toHaveLength(2);
    expect(s1.mediaInsertions[1]?.id).toBe("m2");
  });
});

describe("snapshotForSubmit", () => {
  it("serialises frontMatter to a JSON string and de-duplicates tag input", () => {
    const s0 = editorReducer(freshState(), {
      type: "setTagInput",
      value: " a, b , a",
    });
    const s1 = editorReducer(s0, {
      type: "setFrontMatterField",
      key: "title",
      value: "x",
    });
    const snap = snapshotForSubmit(s1);
    expect(snap.tagNames).toEqual(["a", "b"]);
    expect(JSON.parse(snap.frontMatterJson)).toEqual({ title: "x" });
  });
});

describe("parseTagInput", () => {
  it("trims, de-duplicates and drops empty tokens", () => {
    expect(parseTagInput(" a, b ,a ,  ,c ")).toEqual(["a", "b", "c"]);
  });

  it("returns [] for an empty string", () => {
    expect(parseTagInput("")).toEqual([]);
  });
});

describe("stringifyFrontMatter", () => {
  it("returns `{}` for an empty record", () => {
    expect(stringifyFrontMatter({})).toBe("{}");
  });

  it("pretty-prints non-empty values", () => {
    const s = stringifyFrontMatter({ a: 1 });
    expect(s).toContain('"a": 1');
    expect(s.includes("\n")).toBe(true);
  });
});
