import { describe, expect, it } from "vitest";
import {
  createInitialEditorState,
  type EditorState,
  editorReducer,
} from "../editorState";
import {
  backoffWaitMs,
  isAutosaveExhausted,
  shouldFlushAutosave,
} from "../useAutosave";

const baseInit = {
  surface: "edit" as const,
  title: "Hello",
  contentHtml: "<p>hi</p>",
  frontMatter: {} as Record<string, unknown>,
  directoryId: null,
  tagNames: ["draft"],
};

function withDirtyTitle(state: EditorState, value = "x"): EditorState {
  return editorReducer(state, { type: "setTitle", value });
}

describe("backoffWaitMs", () => {
  it("returns BACKOFF_BASE_MS for the first attempt", () => {
    expect(backoffWaitMs(1)).toBe(500);
  });

  it("doubles for the second attempt", () => {
    expect(backoffWaitMs(2)).toBe(1000);
  });

  it("doubles again for the third attempt", () => {
    expect(backoffWaitMs(3)).toBe(2000);
  });

  it("collapses to 0 for attempt 0", () => {
    expect(backoffWaitMs(0)).toBe(0);
  });

  it("collapses to 0 for negative attempts", () => {
    expect(backoffWaitMs(-1)).toBe(0);
    expect(backoffWaitMs(-100)).toBe(0);
  });
});

describe("isAutosaveExhausted", () => {
  it("is false before any retry", () => {
    expect(isAutosaveExhausted(0)).toBe(false);
  });

  it("is false at attempt 1", () => {
    expect(isAutosaveExhausted(1)).toBe(false);
  });

  it("is false at attempt 2 (still inside the ladder)", () => {
    expect(isAutosaveExhausted(2)).toBe(false);
  });

  it("flips to true at MAX_ATTEMPTS (3)", () => {
    expect(isAutosaveExhausted(3)).toBe(true);
  });

  it("stays true beyond MAX_ATTEMPTS", () => {
    expect(isAutosaveExhausted(4)).toBe(true);
    expect(isAutosaveExhausted(99)).toBe(true);
  });
});

describe("shouldFlushAutosave", () => {
  it("returns false when noteId is null (new-note mode)", () => {
    const s = withDirtyTitle(createInitialEditorState(baseInit));
    expect(shouldFlushAutosave(s, null)).toBe(false);
  });

  it("returns false when nothing is dirty", () => {
    const s = createInitialEditorState(baseInit);
    expect(shouldFlushAutosave(s, "note-1")).toBe(false);
  });

  it("returns false when FrontMatter raw JSON is invalid", () => {
    let s = createInitialEditorState(baseInit);
    s = editorReducer(s, {
      type: "setFrontMatterRawJson",
      value: "{not json",
    });
    expect(s.frontMatterJsonError).not.toBe(null);
    expect(s.dirtyKeys.size).toBeGreaterThan(0);
    expect(shouldFlushAutosave(s, "note-1")).toBe(false);
  });

  it("returns false in WYSIWYG mode with unacknowledged unsupported tags", () => {
    let s = createInitialEditorState(baseInit);
    s = editorReducer(s, { type: "setMode", mode: "wysiwyg" });
    s = withDirtyTitle(s);
    s = editorReducer(s, {
      type: "wysiwygUnsupportedDetected",
      tags: ["mark"],
    });
    expect(shouldFlushAutosave(s, "note-1")).toBe(false);
  });

  it("returns true in WYSIWYG mode once unsupported tags are acknowledged", () => {
    let s = createInitialEditorState(baseInit);
    s = editorReducer(s, { type: "setMode", mode: "wysiwyg" });
    s = withDirtyTitle(s);
    s = editorReducer(s, {
      type: "wysiwygUnsupportedDetected",
      tags: ["mark"],
    });
    s = editorReducer(s, { type: "wysiwygUnsupportedAck" });
    expect(shouldFlushAutosave(s, "note-1")).toBe(true);
  });

  it("returns true in WYSIWYG mode when no unsupported tags were detected", () => {
    let s = createInitialEditorState(baseInit);
    s = editorReducer(s, { type: "setMode", mode: "wysiwyg" });
    s = withDirtyTitle(s);
    expect(shouldFlushAutosave(s, "note-1")).toBe(true);
  });

  // ADR-002: HTML mode is *not* gated by the warning — users must be
  // able to keep saving via the HTML tab while the WYSIWYG warning
  // banner is up.
  it("returns true in HTML mode even when unsupported tags are detected and unacked", () => {
    let s = createInitialEditorState(baseInit);
    s = editorReducer(s, { type: "setMode", mode: "html" });
    s = withDirtyTitle(s);
    s = editorReducer(s, {
      type: "wysiwygUnsupportedDetected",
      tags: ["mark"],
    });
    expect(s.mode).toBe("html");
    expect(shouldFlushAutosave(s, "note-1")).toBe(true);
  });

  // Issue #233 ADR-006: `inline` mode is not gated either — the
  // structure-preserving MutationObserver makes silent data loss
  // impossible, so autosave passes through.
  it("returns true in inline mode when dirty and FrontMatter is valid", () => {
    let s = createInitialEditorState({ ...baseInit, surface: "edit" });
    expect(s.mode).toBe("inline");
    s = withDirtyTitle(s);
    expect(shouldFlushAutosave(s, "note-1")).toBe(true);
  });

  it("returns true in inline mode even when unsupported tags are detected", () => {
    let s = createInitialEditorState({ ...baseInit, surface: "edit" });
    s = withDirtyTitle(s);
    s = editorReducer(s, {
      type: "wysiwygUnsupportedDetected",
      tags: ["mark"],
    });
    expect(s.mode).toBe("inline");
    expect(shouldFlushAutosave(s, "note-1")).toBe(true);
  });

  // FrontMatter is no longer a body mode (Issue #697) — it is permanently
  // mounted and always serialized via `snapshotForSubmit`, so the
  // unsupported-tag ack gate only applies to the `wysiwyg` body mode. Any
  // non-wysiwyg body mode (here `inline`) flushes regardless of ack.
  it("returns true in inline mode even when unsupported tags are unacked", () => {
    let s = createInitialEditorState(baseInit);
    s = editorReducer(s, { type: "setMode", mode: "inline" });
    s = withDirtyTitle(s);
    s = editorReducer(s, {
      type: "wysiwygUnsupportedDetected",
      tags: ["mark"],
    });
    expect(shouldFlushAutosave(s, "note-1")).toBe(true);
  });
});
