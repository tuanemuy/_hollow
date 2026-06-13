// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearNoteUnsaved,
  markNoteUnsaved,
  readNoteUnsaved,
} from "../unsavedFlag";

/**
 * Issue #583 ADR-001: the sessionStorage wrapper round-trips the per-note
 * unsaved flag, isolates notes by key, and survives a throwing / absent
 * storage by degrading to `false` (no warning).
 */

beforeEach(() => {
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  window.sessionStorage.clear();
});

describe("unsavedFlag", () => {
  it("mark → read = true, clear → read = false", () => {
    expect(readNoteUnsaved("note-1")).toBe(false);
    markNoteUnsaved("note-1");
    expect(window.sessionStorage.getItem("hollow3:note:note-1:dirty")).toBe(
      "1",
    );
    expect(readNoteUnsaved("note-1")).toBe(true);
    clearNoteUnsaved("note-1");
    expect(readNoteUnsaved("note-1")).toBe(false);
  });

  it("returns false when nothing is stored", () => {
    expect(readNoteUnsaved("note-x")).toBe(false);
  });

  it("isolates notes by key (no cross-note bleed)", () => {
    markNoteUnsaved("note-a");
    expect(readNoteUnsaved("note-a")).toBe(true);
    expect(readNoteUnsaved("note-b")).toBe(false);
    clearNoteUnsaved("note-a");
    markNoteUnsaved("note-b");
    expect(readNoteUnsaved("note-a")).toBe(false);
    expect(readNoteUnsaved("note-b")).toBe(true);
  });

  it("treats a non-'1' stored value as false", () => {
    window.sessionStorage.setItem("hollow3:note:note-1:dirty", "0");
    expect(readNoteUnsaved("note-1")).toBe(false);
  });

  it("does not crash and returns false when getItem throws", () => {
    vi.spyOn(window.sessionStorage, "getItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });
    expect(readNoteUnsaved("note-1")).toBe(false);
  });

  it("does not crash when setItem / removeItem throw", () => {
    vi.spyOn(window.sessionStorage, "setItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });
    vi.spyOn(window.sessionStorage, "removeItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });
    expect(() => markNoteUnsaved("note-1")).not.toThrow();
    expect(() => clearNoteUnsaved("note-1")).not.toThrow();
  });
});
