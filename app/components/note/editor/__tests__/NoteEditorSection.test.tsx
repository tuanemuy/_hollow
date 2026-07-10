import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { UserDTO } from "@/core/application/dto/identity";

/**
 * Issue #819 (AC-2): while the editor data resolves, the section streams the
 * `NoteEditorSkeleton` as its Suspense fallback — the same "skeleton first,
 * real UI after" contract the detail route already has.
 */

// `SectionErrorBoundary` is a `"use client"` component that pulls router /
// server-fn hooks; stub it to a passthrough so this test focuses on the
// Suspense fallback.
vi.mock("@/components/common/SectionErrorBoundary", () => ({
  SectionErrorBoundary: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

// Suspend forever so the Suspense fallback is what renders.
vi.mock("../NoteEditorLoader", () => ({
  NoteEditorLoader: () => {
    throw new Promise<void>(() => {});
  },
}));

const { NoteEditorSection } = await import("../NoteEditorSection");

const user = { id: "user-1" } as unknown as UserDTO;

describe("NoteEditorSection", () => {
  it("renders the NoteEditorSkeleton while the loader is pending", () => {
    const html = renderToStaticMarkup(
      <NoteEditorSection user={user} noteId="note-1" />,
    );
    // The skeleton owns the announcing status region with its label.
    expect(html).toContain('role="status"');
    expect(html).toContain("エディタを読み込み中");
    expect(html).toContain('aria-busy="true"');
  });
});
