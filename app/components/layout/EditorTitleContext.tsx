"use client";

import { createContext, type ReactNode, useContext, useState } from "react";

/**
 * Editor-title plumbing for the mobile P12 orientation header (Issue #824).
 *
 * The note editor (`NoteEditor`, deep inside `<main>`) pushes the in-progress
 * title so the shared header can surface a simplified `.header-doc` label
 * while the body scrolls. Same shape as `DrawerCtx` (`AppShellDrawer.tsx`):
 * a client context mounted in `AppShellDrawer` and consumed by a client
 * island inside the `Header` RSC payload — context propagation is a runtime
 * React-tree concern, so an intervening server component is transparent and
 * no RSC boundary is crossed. SSR renders with `title === null`, so the
 * search box paints on the server and hydration stays consistent.
 *
 * The header label is a decorative orientation cue (`aria-hidden`); a11y is
 * carried by the editor's real title `<input>`, not this context.
 *
 * Value and setter live in separate contexts on purpose (ADR-003): the title
 * churns on every keystroke, so only the lightweight `HeaderCenter` reads the
 * value, while `NoteEditor` subscribes to the stable setter and is not
 * re-rendered by value churn.
 */
const EditorTitleValueCtx = createContext<string | null>(null);
const EditorTitleSetterCtx = createContext<(title: string | null) => void>(
  () => {},
);

type Props = { children: ReactNode };

/**
 * Owns the editor-title state and exposes it through split value/setter
 * contexts. Mounted in `AppShellDrawer` inside `DrawerCtx.Provider`.
 *
 * `children` (the `{header}` + `<main>` subtree) MUST be passed as a prop and
 * rendered here transparently (ADR-006, "children as prop" optimization): the
 * provider re-renders on every `setTitle`, but the `children` element
 * reference is created by `AppShellDrawer` and stays stable, so React skips
 * re-reconciling the whole `/_app` subtree. Inlining `{header}`/`{children}`
 * in this body would re-render every `/_app` page on each keystroke.
 */
export function EditorTitleProvider({ children }: Props) {
  const [title, setTitle] = useState<string | null>(null);
  return (
    <EditorTitleSetterCtx.Provider value={setTitle}>
      <EditorTitleValueCtx.Provider value={title}>
        {children}
      </EditorTitleValueCtx.Provider>
    </EditorTitleSetterCtx.Provider>
  );
}

/** Read the current editor title (or `null`). Consumed by `HeaderCenter`. */
export function useEditorTitle(): string | null {
  return useContext(EditorTitleValueCtx);
}

/** Read the stable setter used by `NoteEditor` to push the title. */
export function useSetEditorTitle(): (title: string | null) => void {
  return useContext(EditorTitleSetterCtx);
}
