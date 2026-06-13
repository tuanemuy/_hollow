// @vitest-environment node

import { describe, expect, it } from "vitest";
import {
  clearNoteUnsaved,
  markNoteUnsaved,
  readNoteUnsaved,
} from "../unsavedFlag";

/**
 * Issue #583 ADR-001: in a server (no `window`) environment the wrapper is a
 * safe no-op — read yields `false`, mark / clear do nothing and never throw —
 * so SSR never touches sessionStorage.
 */

describe("unsavedFlag (SSR / no window)", () => {
  it("readNoteUnsaved returns false without window", () => {
    expect(typeof window).toBe("undefined");
    expect(readNoteUnsaved("note-1")).toBe(false);
  });

  it("markNoteUnsaved / clearNoteUnsaved are no-ops without window", () => {
    expect(() => markNoteUnsaved("note-1")).not.toThrow();
    expect(() => clearNoteUnsaved("note-1")).not.toThrow();
  });
});
