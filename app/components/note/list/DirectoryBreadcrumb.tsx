import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { HOME_SEARCH } from "@/components/auth/links";
import { Icon } from "@/components/common/Icon";
import type { BreadcrumbSegment } from "../directoryTree";

/**
 * Directory breadcrumb for the note list page (P10).
 *
 * Renders the root→current directory path (e.g. "Documents › Research") as a
 * navigation breadcrumb so the active directory reads as "where you are" — a
 * location, not a filter chip — matching the detail-page `NoteBreadcrumb`
 * pattern (Separator = ChevronRight, separators between elements only,
 * cumulative-id keys, `{ ...HOME_SEARCH, directoryId }` ancestor links). The
 * trailing element (the current directory) is rendered as an `aria-current=
 * "page"` non-link `<span>`, exactly like `NoteBreadcrumb`'s note-title tail.
 *
 * `segments` must be non-empty and root-free (the implicit `name === ""` root
 * is dropped by `directoryAncestorSegments`); the caller renders a generic
 * fallback when it cannot resolve any segment.
 *
 * The tail is a non-link `aria-current` span (full-reset is left to the global
 * clear-all), there is no root crumb or leading icon, and the `nav` owns its
 * own `mb-6` so it sits above the heading symmetrically with the detail page.
 * This is a pure display component with no client state (#743 ADR-002,
 * superseding #710 ADR-001 / ADR-002).
 */
export type DirectoryBreadcrumbProps = Readonly<{
  segments: readonly BreadcrumbSegment[];
}>;

const SEP = "inline-flex text-hairline-strong";
const CRUMB_LINK = "text-ink-tertiary hover:text-ink transition-colors";

function Separator() {
  return (
    <span className={SEP} aria-hidden="true">
      <Icon icon={ChevronRight} size={16} />
    </span>
  );
}

export function DirectoryBreadcrumb({ segments }: DirectoryBreadcrumbProps) {
  return (
    <nav
      aria-label="現在のディレクトリ"
      className="flex items-center gap-1.5 text-sm text-ink-tertiary flex-wrap mb-6 [overflow-wrap:anywhere]"
    >
      {segments.map((segment, index) => {
        // Cumulative id path is unique even when sibling/ancestor names repeat.
        const key = segments
          .slice(0, index + 1)
          .map((s) => s.id)
          .join("/");
        const isLast = index === segments.length - 1;
        return (
          <span key={key} className="flex items-center gap-1.5">
            {index > 0 && <Separator />}
            {isLast ? (
              <span aria-current="page" className="text-ink-secondary">
                {segment.name}
              </span>
            ) : (
              <Link
                to="/"
                search={{ ...HOME_SEARCH, directoryId: segment.id }}
                className={CRUMB_LINK}
              >
                {segment.name}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
