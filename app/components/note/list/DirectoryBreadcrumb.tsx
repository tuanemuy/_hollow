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
 *
 * The separate-row spacing (`mb-*`) is owned by the caller's row wrapper, not
 * this `nav`, so the breadcrumb and the fallback chip share one spacing source
 * and cannot drift apart.
 */
export type DirectoryBreadcrumbProps = Readonly<{
  segments: readonly BreadcrumbSegment[];
  onClear: () => void;
}>;

const SEP = "inline-flex text-hairline-strong";
// The leading folder icon signals "this is a directory location", so it carries
// the nav's own ink tone rather than the separators' weakest hairline tone.
const LEADING_ICON = "inline-flex text-ink-tertiary";
const CRUMB_LINK = "text-ink-tertiary hover:text-ink transition-colors";
// Inline clear × in the breadcrumb row. The pseudo-element extends the effective
// tap target to ~44px below `sm` without altering layout — mirrors `filterClearX`
// (list/styles.ts) so the breadcrumb's × meets the same mobile touch floor as the
// chips' remove buttons.
const CLEAR_BUTTON =
  "ml-1 relative inline-flex items-center justify-center w-4 h-4 rounded-full text-ink-tertiary hover:text-ink hover:bg-surface max-sm:after:absolute max-sm:after:content-[''] max-sm:after:-inset-y-[14px] max-sm:after:-inset-x-[14px]";

export function DirectoryBreadcrumb({
  segments,
  onClear,
}: DirectoryBreadcrumbProps) {
  return (
    <nav
      aria-label="現在のディレクトリ"
      className="flex items-center gap-1.5 text-sm text-ink-tertiary flex-wrap [overflow-wrap:anywhere]"
    >
      <span className={LEADING_ICON} aria-hidden="true">
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
        className={CLEAR_BUTTON}
      >
        ×
      </button>
    </nav>
  );
}
