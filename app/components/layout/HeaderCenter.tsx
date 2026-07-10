"use client";

import type { ReactNode } from "react";
import { useEditorTitle } from "./EditorTitleContext";
import { HEADER_DOC, SEARCH_BOX_WRAPPER } from "./styles";

type Props = { children: ReactNode };

/**
 * Central header column: the server-rendered search form passes through as
 * `children`, and this thin client island overlays the mobile P12 editor
 * orientation label when a title is being edited (Issue #824). Same pattern as
 * `MenuButton` — a client island inside the `Header` RSC payload reading
 * `AppShellDrawer`'s context — so the search input keeps server-rendering and
 * other `/_app` pages stay unchanged (title === null → search only).
 *
 * `data-doc` marks the search wrapper hidden on mobile while a title is present
 * (`data-[doc]:max-sm:hidden`), so the title replaces search rather than
 * stacking with it — the attribute sits on the element that consumes it, per
 * the `data-*` convention (#818 ADR-004), avoiding `group-data-*`.
 *
 * `min-w-0` on the root (the central grid item) is load-bearing: `APP_HEADER`'s
 * `1fr` track is `minmax(auto,1fr)`, so without it the nowrap title's
 * min-content would grow the track and push the header wider (ADR-004).
 */
export function HeaderCenter({ children }: Props) {
  const title = useEditorTitle();
  const hasTitle = title !== null && title.trim() !== "";
  return (
    <div className={`${SEARCH_BOX_WRAPPER} min-w-0`}>
      {hasTitle ? (
        <div aria-hidden="true" className={HEADER_DOC}>
          {title}
        </div>
      ) : null}
      <div
        data-doc={hasTitle || undefined}
        className="data-[doc]:max-sm:hidden"
      >
        {children}
      </div>
    </div>
  );
}
