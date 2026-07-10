"use client";

import { useEffect } from "react";
import { useSetEditorTitle } from "@/components/layout/EditorTitleContext";

/**
 * Push the editor's in-progress title into the shared header context so the
 * mobile P12 orientation label (`.header-doc`) tracks it (Issue #824,
 * ADR-005). Split out of the heavy `NoteEditor` body as a thin harness so the
 * orientation plumbing stays testable without a full editor mount.
 *
 * The setter reference is stable (ADR-003), so the effect re-runs only when
 * `title` changes. On mount an edit-mode note pushes its `initialTitle`
 * immediately (AC-1); on unmount the title is cleared to `null` so the label
 * does not leak into other `/_app` pages (AC-6).
 */
export function useEditorTitleSync(title: string | null): void {
  const setHeaderTitle = useSetEditorTitle();
  useEffect(() => {
    setHeaderTitle(title);
  }, [title, setHeaderTitle]);
  useEffect(() => () => setHeaderTitle(null), [setHeaderTitle]);
}
