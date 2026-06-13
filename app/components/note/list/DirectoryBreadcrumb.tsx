import { Link } from "@tanstack/react-router";
import { ChevronRight, Folder } from "lucide-react";
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
 * cumulative-id keys, `{ ...HOME_SEARCH, directoryId }` links). The trailing
 * element differs: instead of a fixed note title it carries a "clear directory
 * filter" `×` button (Issue #710 ADR-001 / ADR-002).
 *
 * `segments` must be non-empty and root-free (the implicit `name === ""` root
 * is dropped by `directoryAncestorSegments`); the caller renders a generic
 * fallback when it cannot resolve any segment.
 */
export type DirectoryBreadcrumbProps = Readonly<{
  segments: readonly BreadcrumbSegment[];
  onClear: () => void;
}>;

const SEP = "inline-flex text-hairline-strong";
const CRUMB_LINK = "text-ink-tertiary hover:text-ink transition-colors";

export function DirectoryBreadcrumb({
  segments,
  onClear,
}: DirectoryBreadcrumbProps) {
  return (
    <nav
      aria-label="現在のディレクトリ"
      className="flex items-center gap-1.5 text-sm text-ink-tertiary flex-wrap mb-5 [overflow-wrap:anywhere]"
    >
      <span className={SEP} aria-hidden="true">
        <Icon icon={Folder} size={16} />
      </span>
      {segments.map((segment, index) => {
        // Cumulative id path is unique even when sibling/ancestor names repeat.
        const key = segments
          .slice(0, index + 1)
          .map((s) => s.id)
          .join("/");
        return (
          <span key={key} className="flex items-center gap-1.5">
            {index > 0 ? (
              <span className={SEP} aria-hidden="true">
                <Icon icon={ChevronRight} size={16} />
              </span>
            ) : null}
            <Link
              to="/"
              search={{ ...HOME_SEARCH, directoryId: segment.id }}
              className={CRUMB_LINK}
            >
              {segment.name}
            </Link>
          </span>
        );
      })}
      <button
        type="button"
        aria-label="ディレクトリフィルタを解除"
        onClick={onClear}
        className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full text-ink-tertiary hover:text-ink hover:bg-surface"
      >
        ×
      </button>
    </nav>
  );
}
