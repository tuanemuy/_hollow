import { describe, expect, it } from "vitest";
import type { SerializedError } from "@/core/presentation/errorResponse";
import {
  createInitialEditorState,
  type EditorState,
  editorReducer,
  parseTagInput,
  resolveTagNames,
  snapshotForSubmit,
  stringifyFrontMatter,
} from "../editorState";

const baseInit = {
  surface: "edit" as const,
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
    expect(s.tagNames).toEqual(["draft"]);
    expect(s.tagDraft).toBe("");
    expect(s.frontMatterRawJson).toBe("{}");
    expect(s.dirtyKeys.size).toBe(0);
    expect(s.autosave.kind).toBe("idle");
    expect(s.editLock.state).toBe("unknown");
    expect(s.frontMatterMode).toBe("structured");
  });

  // Issue #233 ADR-001: `surface` picks the initial mode so new notes
  // start on the WYSIWYG canvas (spec C1) and edits open in the
  // structure-preserving inline editor (spec C2).
  it("starts in wysiwyg when surface = new", () => {
    const s = createInitialEditorState({ ...baseInit, surface: "new" });
    expect(s.mode).toBe("wysiwyg");
  });

  it("starts in inline when surface = edit", () => {
    const s = createInitialEditorState({ ...baseInit, surface: "edit" });
    expect(s.mode).toBe("inline");
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

  it("setMode transitions to wysiwyg without marking dirty", () => {
    const s0 = freshState();
    const s1 = editorReducer(s0, { type: "setMode", mode: "wysiwyg" });
    expect(s1.mode).toBe("wysiwyg");
    expect(s1.dirtyKeys.size).toBe(0);
    expect(s1.autosave.kind).toBe("idle");
  });

  it("setMode with the same mode is a referential no-op", () => {
    const s0 = freshState();
    const s1 = editorReducer(s0, { type: "setMode", mode: s0.mode });
    expect(s1).toBe(s0);
  });

  // Issue #233: `inline` is a first-class mode reachable from any
  // other mode and back.
  it("setMode transitions inline ⇄ html ⇄ wysiwyg without dirty", () => {
    const s0 = createInitialEditorState({ ...baseInit, surface: "edit" });
    expect(s0.mode).toBe("inline");
    const s1 = editorReducer(s0, { type: "setMode", mode: "html" });
    expect(s1.mode).toBe("html");
    const s2 = editorReducer(s1, { type: "setMode", mode: "wysiwyg" });
    expect(s2.mode).toBe("wysiwyg");
    const s3 = editorReducer(s2, { type: "setMode", mode: "inline" });
    expect(s3.mode).toBe("inline");
    expect(s3.dirtyKeys.size).toBe(0);
    expect(s3.autosave.kind).toBe("idle");
  });

  it("setMode to inline preserves in-flight autosave and dirty keys", () => {
    let s: EditorState = editorReducer(freshState(), {
      type: "setTitle",
      value: "draft",
    });
    s = editorReducer(s, { type: "autosaveStart" });
    expect(s.autosave.kind).toBe("saving");
    expect(s.dirtyKeys.has("title")).toBe(true);
    const next = editorReducer(s, { type: "setMode", mode: "inline" });
    expect(next.mode).toBe("inline");
    expect(next.autosave.kind).toBe("saving");
    expect(next.dirtyKeys.has("title")).toBe(true);
  });

  it("setMode preserves an in-flight autosave and existing dirty keys (W-014)", () => {
    // Mode switching must never restart or clear an in-progress autosave
    // — that would either lose a save attempt or strand the indicator.
    // Likewise dirty fields stay dirty until autosaveSuccess clears them.
    let s: EditorState = editorReducer(freshState(), {
      type: "setTitle",
      value: "draft",
    });
    s = editorReducer(s, { type: "autosaveStart" });
    expect(s.autosave.kind).toBe("saving");
    expect(s.dirtyKeys.has("title")).toBe(true);

    const next = editorReducer(s, { type: "setMode", mode: "wysiwyg" });
    expect(next.mode).toBe("wysiwyg");
    expect(next.autosave.kind).toBe("saving");
    expect(next.dirtyKeys.has("title")).toBe(true);
  });

  it("addTag commits a draft, trims, de-dupes and marks tags dirty", () => {
    const s = editorReducer(freshState(), {
      type: "addTag",
      value: "  alpha  ",
    });
    expect(s.tagNames).toEqual(["draft", "alpha"]);
    expect(s.tagDraft).toBe("");
    expect(s.dirtyKeys.has("tags")).toBe(true);
  });

  it("addTag splits a comma-separated chunk and de-dupes against existing", () => {
    const s = editorReducer(freshState(), {
      type: "addTag",
      value: "x, draft, y, x",
    });
    expect(s.tagNames).toEqual(["draft", "x", "y"]);
  });

  it("addTag of an empty / all-duplicate value only clears the draft", () => {
    const s0 = editorReducer(freshState(), {
      type: "setTagDraft",
      value: "draft",
    });
    const s1 = editorReducer(s0, { type: "addTag", value: "draft" });
    expect(s1.tagNames).toEqual(["draft"]);
    expect(s1.tagDraft).toBe("");
    expect(s1.dirtyKeys.has("tags")).toBe(false);
  });

  it("removeTag drops a chip by name and marks tags dirty", () => {
    const s0 = editorReducer(freshState(), { type: "addTag", value: "alpha" });
    const s1 = editorReducer(s0, { type: "removeTag", name: "draft" });
    expect(s1.tagNames).toEqual(["alpha"]);
    expect(s1.dirtyKeys.has("tags")).toBe(true);
  });

  it("removeTag of an absent name is a no-op (same reference)", () => {
    const s = freshState();
    expect(editorReducer(s, { type: "removeTag", name: "nope" })).toBe(s);
  });

  it("setTagDraft updates the buffer without marking tags dirty", () => {
    const s = editorReducer(freshState(), {
      type: "setTagDraft",
      value: "wip",
    });
    expect(s.tagDraft).toBe("wip");
    expect(s.dirtyKeys.has("tags")).toBe(false);
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

  // Issue #286: the mode-switch "discard" path resets autosave to idle
  // without clearing dirtyKeys. Pins the transition matrix exhaustively.
  describe("autosaveDiscarded", () => {
    it("transitions dirty → idle and preserves dirtyKeys", () => {
      // After an autosaveSuccess the indicator briefly returns to
      // `dirty` (see the field-setter pinning in this describe block).
      // Discard from that state must still land in idle.
      const s0 = editorReducer(freshState(), { type: "setTitle", value: "x" });
      const s1 = editorReducer(s0, { type: "autosaveStart" });
      const s2 = editorReducer(s1, { type: "autosaveSuccess", at: 1700 });
      // Re-dirty after saved → state.autosave goes back to `dirty`
      const s3 = editorReducer(s2, { type: "setTitle", value: "y" });
      expect(s3.autosave.kind).toBe("dirty");
      const s4 = editorReducer(s3, { type: "autosaveDiscarded" });
      expect(s4.autosave).toEqual({ kind: "idle" });
      expect(s4.dirtyKeys.has("title")).toBe(true);
    });

    it("transitions saving → idle and preserves dirtyKeys", () => {
      const s0 = editorReducer(freshState(), { type: "setTitle", value: "x" });
      const s1 = editorReducer(s0, { type: "autosaveStart" });
      expect(s1.autosave.kind).toBe("saving");
      const s2 = editorReducer(s1, { type: "autosaveDiscarded" });
      expect(s2.autosave).toEqual({ kind: "idle" });
      expect(s2.dirtyKeys.has("title")).toBe(true);
    });

    it("transitions error → idle and preserves dirtyKeys", () => {
      const s0 = editorReducer(freshState(), { type: "setTitle", value: "x" });
      const err: SerializedError = {
        kind: "system",
        code: null,
        message: "boom",
      };
      const s1 = editorReducer(s0, { type: "autosaveError", error: err });
      const s2 = editorReducer(s1, { type: "autosaveDiscarded" });
      expect(s2.autosave).toEqual({ kind: "idle" });
      expect(s2.dirtyKeys.has("title")).toBe(true);
    });

    it("transitions saved → idle (no dirty before)", () => {
      const s0 = editorReducer(freshState(), { type: "setTitle", value: "x" });
      const s1 = editorReducer(s0, { type: "autosaveStart" });
      const s2 = editorReducer(s1, { type: "autosaveSuccess", at: 1700 });
      expect(s2.autosave.kind).toBe("saved");
      const s3 = editorReducer(s2, { type: "autosaveDiscarded" });
      expect(s3.autosave).toEqual({ kind: "idle" });
    });

    it("is a no-op (same state identity) when already idle", () => {
      const s0 = freshState();
      expect(s0.autosave.kind).toBe("idle");
      const s1 = editorReducer(s0, { type: "autosaveDiscarded" });
      expect(s1).toBe(s0);
    });
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
      label: "addTag",
      action: { type: "addTag", value: "a, b" } as const,
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

describe("editorReducer wysiwyg unsupported-tag warning (Issue #37)", () => {
  it("starts with an empty tag list and ack=false", () => {
    const s = freshState();
    expect(s.wysiwygUnsupportedTags).toEqual([]);
    expect(s.wysiwygUnsupportedAck).toBe(false);
  });

  it("wysiwygUnsupportedDetected with non-empty tags stores them sorted and leaves ack=false", () => {
    const s = editorReducer(freshState(), {
      type: "wysiwygUnsupportedDetected",
      tags: ["table", "mark", "kbd"],
    });
    expect(s.wysiwygUnsupportedTags).toEqual(["kbd", "mark", "table"]);
    expect(s.wysiwygUnsupportedAck).toBe(false);
    expect(s.dirtyKeys.size).toBe(0);
  });

  // ADR-005 latch: empty `tags` must never erase an existing warning.
  it("wysiwygUnsupportedDetected with [] is a no-op even after a warning is set", () => {
    const s0 = editorReducer(freshState(), {
      type: "wysiwygUnsupportedDetected",
      tags: ["mark"],
    });
    const s1 = editorReducer(s0, {
      type: "wysiwygUnsupportedDetected",
      tags: [],
    });
    expect(s1).toBe(s0);
  });

  it("wysiwygUnsupportedDetected with [] on initial state is a referential no-op", () => {
    const s0 = freshState();
    const s1 = editorReducer(s0, {
      type: "wysiwygUnsupportedDetected",
      tags: [],
    });
    expect(s1).toBe(s0);
  });

  it("wysiwygUnsupportedDetected with the same set (different order) is a referential no-op", () => {
    const s0 = editorReducer(freshState(), {
      type: "wysiwygUnsupportedDetected",
      tags: ["mark", "table"],
    });
    const s1 = editorReducer(s0, {
      type: "wysiwygUnsupportedDetected",
      tags: ["table", "mark"],
    });
    expect(s1).toBe(s0);
  });

  it("wysiwygUnsupportedDetected with a different set resets ack to false", () => {
    const s0 = editorReducer(freshState(), {
      type: "wysiwygUnsupportedDetected",
      tags: ["mark"],
    });
    const s1 = editorReducer(s0, { type: "wysiwygUnsupportedAck" });
    expect(s1.wysiwygUnsupportedAck).toBe(true);
    const s2 = editorReducer(s1, {
      type: "wysiwygUnsupportedDetected",
      tags: ["mark", "kbd"],
    });
    expect(s2.wysiwygUnsupportedTags).toEqual(["kbd", "mark"]);
    expect(s2.wysiwygUnsupportedAck).toBe(false);
  });

  it("wysiwygUnsupportedAck flips ack to true without touching the tag list", () => {
    const s0 = editorReducer(freshState(), {
      type: "wysiwygUnsupportedDetected",
      tags: ["mark"],
    });
    const s1 = editorReducer(s0, { type: "wysiwygUnsupportedAck" });
    expect(s1.wysiwygUnsupportedAck).toBe(true);
    expect(s1.wysiwygUnsupportedTags).toEqual(["mark"]);
    expect(s1.dirtyKeys.size).toBe(0);
  });

  it("wysiwygUnsupportedAck when already acked is a referential no-op", () => {
    const s0 = editorReducer(freshState(), {
      type: "wysiwygUnsupportedDetected",
      tags: ["mark"],
    });
    const s1 = editorReducer(s0, { type: "wysiwygUnsupportedAck" });
    const s2 = editorReducer(s1, { type: "wysiwygUnsupportedAck" });
    expect(s2).toBe(s1);
  });

  it("neither action mutates dirtyKeys nor autosave status", () => {
    let s: EditorState = freshState();
    s = editorReducer(s, {
      type: "wysiwygUnsupportedDetected",
      tags: ["mark"],
    });
    expect(s.dirtyKeys.size).toBe(0);
    expect(s.autosave.kind).toBe("idle");
    s = editorReducer(s, { type: "wysiwygUnsupportedAck" });
    expect(s.dirtyKeys.size).toBe(0);
    expect(s.autosave.kind).toBe("idle");
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
  it("serialises frontMatter to a JSON string and resolves committed tags", () => {
    const s0 = createInitialEditorState({ ...baseInit, tagNames: ["a", "b"] });
    const s1 = editorReducer(s0, {
      type: "setFrontMatterField",
      key: "title",
      value: "x",
    });
    const snap = snapshotForSubmit(s1);
    expect(snap.tagNames).toEqual(["a", "b"]);
    expect(JSON.parse(snap.frontMatterJson)).toEqual({ title: "x" });
  });

  it("folds a non-empty draft into the snapshot tag list (lockstep)", () => {
    const s = editorReducer(freshState(), {
      type: "setTagDraft",
      value: "uncommitted",
    });
    const snap = snapshotForSubmit(s);
    expect(snap.tagNames).toEqual(["draft", "uncommitted"]);
  });
});

describe("resolveTagNames", () => {
  it("returns the committed list unchanged when the draft is empty", () => {
    const names = ["a", "b"];
    expect(resolveTagNames({ tagNames: names, tagDraft: "  " })).toBe(names);
  });

  it("merges a non-empty draft, preserving order and de-duplicating", () => {
    expect(
      resolveTagNames({ tagNames: ["a", "b"], tagDraft: " c, a , d" }),
    ).toEqual(["a", "b", "c", "d"]);
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

describe("editorReducer FrontMatter arbitrary keys (Issue #230)", () => {
  it("preserves existing arbitrary keys loaded from a note across other edits", () => {
    const s0 = createInitialEditorState({
      ...baseInit,
      frontMatter: { mood: "tired", topic: "design" },
    });
    expect(s0.frontMatter).toEqual({ mood: "tired", topic: "design" });
    const s1 = editorReducer(s0, {
      type: "setFrontMatterField",
      key: "topic",
      value: "engineering",
    });
    expect(s1.frontMatter).toEqual({ mood: "tired", topic: "engineering" });
    const s2 = editorReducer(s1, {
      type: "setFrontMatterField",
      key: "new",
      value: "x",
    });
    expect(Object.keys(s2.frontMatter)).toEqual(["mood", "topic", "new"]);
    expect(s2.frontMatterRawJson).toContain(`"mood"`);
  });

  it("preserves legacy `frontMatter.tags` array through unrelated edits (ADR-002)", () => {
    const s0 = createInitialEditorState({
      ...baseInit,
      frontMatter: { tags: ["legacy"], other: "x" },
    });
    const s1 = editorReducer(s0, {
      type: "setFrontMatterField",
      key: "other",
      value: "y",
    });
    expect(s1.frontMatter.tags).toEqual(["legacy"]);
    const snap = snapshotForSubmit(s1);
    const parsed = JSON.parse(snap.frontMatterJson) as Record<string, unknown>;
    expect(parsed.tags).toEqual(["legacy"]);
  });

  it("renameFrontMatterKey preserves the original insertion order", () => {
    const s0 = createInitialEditorState({
      ...baseInit,
      frontMatter: { a: 1, b: 2, c: 3 },
    });
    const s1 = editorReducer(s0, {
      type: "renameFrontMatterKey",
      oldKey: "b",
      newKey: "bee",
    });
    expect(Object.keys(s1.frontMatter)).toEqual(["a", "bee", "c"]);
    expect(s1.frontMatter.bee).toBe(2);
    expect(s1.frontMatterJsonError).toBe(null);
  });

  it("renameFrontMatterKey to a duplicate key is a no-op + structured error", () => {
    const s0 = createInitialEditorState({
      ...baseInit,
      frontMatter: { a: 1, b: 2 },
    });
    const s1 = editorReducer(s0, {
      type: "renameFrontMatterKey",
      oldKey: "a",
      newKey: "b",
    });
    expect(s1.frontMatter).toEqual({ a: 1, b: 2 });
    expect(s1.frontMatterJsonError).toEqual({
      kind: "duplicateKey",
      key: "b",
    });
    // W-TS-002: rejected rename must NOT touch the raw-JSON mirror or
    // the dirtyKeys set (ADR-003 core invariant — pending operations do
    // not overwrite the in-sync representation, and they do not arm
    // autosave on a known-rejected change).
    expect(s1.frontMatterRawJson).toBe(s0.frontMatterRawJson);
    expect(s1.dirtyKeys).toBe(s0.dirtyKeys);
  });

  it("renameFrontMatterKey to an empty key surfaces an error", () => {
    const s0 = createInitialEditorState({
      ...baseInit,
      frontMatter: { a: 1 },
    });
    const s1 = editorReducer(s0, {
      type: "renameFrontMatterKey",
      oldKey: "a",
      newKey: "",
    });
    expect(s1.frontMatter).toEqual({ a: 1 });
    expect(s1.frontMatterJsonError).not.toBe(null);
  });

  it("renameFrontMatterKey when oldKey is missing is a no-op", () => {
    const s0 = createInitialEditorState({
      ...baseInit,
      frontMatter: { a: 1 },
    });
    const s1 = editorReducer(s0, {
      type: "renameFrontMatterKey",
      oldKey: "missing",
      newKey: "z",
    });
    expect(s1).toBe(s0);
  });

  it("renameFrontMatterKey resynchronises frontMatterRawJson", () => {
    const s0 = createInitialEditorState({
      ...baseInit,
      frontMatter: { a: 1 },
    });
    const s1 = editorReducer(s0, {
      type: "renameFrontMatterKey",
      oldKey: "a",
      newKey: "z",
    });
    expect(s1.frontMatterRawJson).toContain(`"z"`);
    expect(s1.frontMatterRawJson).not.toContain(`"a"`);
  });

  it("addFrontMatterKey appends a new empty-string key at the end", () => {
    const s0 = createInitialEditorState({
      ...baseInit,
      frontMatter: { a: 1 },
    });
    const s1 = editorReducer(s0, {
      type: "addFrontMatterKey",
      key: "b",
    });
    expect(Object.keys(s1.frontMatter)).toEqual(["a", "b"]);
    expect(s1.frontMatter.b).toBe("");
    expect(s1.dirtyKeys.has("frontMatter")).toBe(true);
  });

  it("addFrontMatterKey on a duplicate key is a no-op + structured error", () => {
    const s0 = createInitialEditorState({
      ...baseInit,
      frontMatter: { a: 1 },
    });
    const s1 = editorReducer(s0, {
      type: "addFrontMatterKey",
      key: "a",
    });
    expect(s1.frontMatter).toEqual({ a: 1 });
    expect(s1.frontMatterJsonError).toEqual({
      kind: "duplicateKey",
      key: "a",
    });
    // W-TS-002: rejected add must NOT touch the raw-JSON mirror or the
    // dirtyKeys set (ADR-003 core invariant).
    expect(s1.frontMatterRawJson).toBe(s0.frontMatterRawJson);
    expect(s1.dirtyKeys).toBe(s0.dirtyKeys);
  });

  it("structured ⇔ raw toggle preserves key insertion order", () => {
    const s0 = createInitialEditorState({
      ...baseInit,
      frontMatter: { z: 1, a: 2, m: 3 },
    });
    const s1 = editorReducer(s0, { type: "toggleFrontMatterMode" });
    expect(s1.frontMatterMode).toBe("raw");
    const s2 = editorReducer(s1, { type: "toggleFrontMatterMode" });
    expect(s2.frontMatterMode).toBe("structured");
    expect(Object.keys(s2.frontMatter)).toEqual(["z", "a", "m"]);
  });

  // W-TS-001: UI guards `addFrontMatterKey("")` from happening today
  // (the button is disabled and the commit helper short-circuits), but
  // the reducer is the unconditional contract — exercise the empty-key
  // and same-key paths directly so a UI regression cannot silently
  // bypass the reject + error contract.
  it('addFrontMatterKey("") surfaces an emptyKey error and leaves frontMatter untouched', () => {
    const s0 = createInitialEditorState({
      ...baseInit,
      frontMatter: { a: 1 },
    });
    const s1 = editorReducer(s0, { type: "addFrontMatterKey", key: "" });
    expect(s1.frontMatter).toEqual({ a: 1 });
    expect(s1.frontMatterJsonError).toEqual({ kind: "emptyKey" });
    expect(s1.frontMatterRawJson).toBe(s0.frontMatterRawJson);
    expect(s1.dirtyKeys).toBe(s0.dirtyKeys);
  });

  it("renameFrontMatterKey(oldKey === newKey) without a prior error is a referential no-op", () => {
    const s0 = createInitialEditorState({
      ...baseInit,
      frontMatter: { a: 1 },
    });
    const s1 = editorReducer(s0, {
      type: "renameFrontMatterKey",
      oldKey: "a",
      newKey: "a",
    });
    expect(s1).toBe(s0);
  });

  // W-ST-003: re-typing the original key after a duplicate rejection
  // must clear the stale error — otherwise the autosave gate stays
  // closed even though the FrontMatter is consistent.
  it("renameFrontMatterKey(oldKey === newKey) clears a residual duplicate-key error", () => {
    const s0 = createInitialEditorState({
      ...baseInit,
      frontMatter: { a: 1, b: 2 },
    });
    const rejected = editorReducer(s0, {
      type: "renameFrontMatterKey",
      oldKey: "a",
      newKey: "b",
    });
    expect(rejected.frontMatterJsonError).toEqual({
      kind: "duplicateKey",
      key: "b",
    });
    const recovered = editorReducer(rejected, {
      type: "renameFrontMatterKey",
      oldKey: "a",
      newKey: "a",
    });
    expect(recovered.frontMatterJsonError).toBe(null);
    expect(recovered.frontMatter).toEqual({ a: 1, b: 2 });
  });

  // W-ST-001: toggling structured → raw must NOT silently drop a
  // pending structured-mode rejection — ADR-003 makes commit failures
  // sticky so users see the recovery path. The raw text mirror still
  // re-syncs (so raw mode shows the actual in-sync object).
  it("toggleFrontMatterMode preserves a structured-mode error when switching to raw", () => {
    const s0 = createInitialEditorState({
      ...baseInit,
      frontMatter: { a: 1, b: 2 },
    });
    const rejected = editorReducer(s0, {
      type: "renameFrontMatterKey",
      oldKey: "a",
      newKey: "b",
    });
    const toggled = editorReducer(rejected, { type: "toggleFrontMatterMode" });
    expect(toggled.frontMatterMode).toBe("raw");
    expect(toggled.frontMatterJsonError).toEqual({
      kind: "duplicateKey",
      key: "b",
    });
  });

  // W-TS-003: the toggle path is intentionally asymmetric — structured
  // errors (`duplicateKey` / `emptyKey`) survive a mode switch (W-ST-001
  // above), but a `json`-kind error must be cleared when leaving raw
  // mode because the raw text is re-parsed from the in-sync parsed
  // object. Exercise the cleared side explicitly so a regression in the
  // `kind !== "json"` guard surfaces here.
  it("toggleFrontMatterMode clears a json-kind error and re-parses raw text when leaving raw", () => {
    // Start in raw mode and introduce a json error via invalid input,
    // then fix it: this leaves `kind: "json"` not the path. Instead,
    // construct a stale state directly — raw mode + valid raw text + a
    // residual json error — so the toggle is the action under test.
    const inRaw = editorReducer(freshState(), {
      type: "toggleFrontMatterMode",
    });
    const withValidRaw = editorReducer(inRaw, {
      type: "setFrontMatterRawJson",
      value: `{ "k": 1 }`,
    });
    const stale: EditorState = {
      ...withValidRaw,
      frontMatterJsonError: { kind: "json", message: "stale" },
    };
    const toggled = editorReducer(stale, { type: "toggleFrontMatterMode" });
    expect(toggled.frontMatterMode).toBe("structured");
    expect(toggled.frontMatterJsonError).toBe(null);
    expect(toggled.frontMatter).toEqual({ k: 1 });
  });

  it("clearFrontMatterError clears any pending error", () => {
    const s0 = createInitialEditorState({
      ...baseInit,
      frontMatter: { a: 1 },
    });
    const rejected = editorReducer(s0, { type: "addFrontMatterKey", key: "" });
    expect(rejected.frontMatterJsonError).not.toBe(null);
    const cleared = editorReducer(rejected, { type: "clearFrontMatterError" });
    expect(cleared.frontMatterJsonError).toBe(null);
  });

  it("clearFrontMatterError on a clean state is a referential no-op", () => {
    const s0 = freshState();
    const s1 = editorReducer(s0, { type: "clearFrontMatterError" });
    expect(s1).toBe(s0);
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
