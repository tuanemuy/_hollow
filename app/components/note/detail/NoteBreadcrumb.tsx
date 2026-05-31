import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { HOME_SEARCH } from "@/components/auth/links";
import { Icon } from "@/components/common/Icon";

/**
 * Pure breadcrumb for the note detail page (P11).
 *
 * Renders "すべてのノート › <dir segments…> › <noteTitle>" from the flat
 * `directoryPath` string. Intermediate directory segments are plain text
 * because the DTO does not carry their ids; only the leaf directory is
 * linked, scoping the home list by `directoryId`.
 *
 * When `directoryPath === "/"` (root-level note) the segment list is empty,
 * so no leaf link is rendered — passing the root directory id to the
 * `directoryId` filter is intentionally avoided (see Issue #356 ADR-002).
 */
export type NoteBreadcrumbProps = Readonly<{
  directoryPath: string;
  directoryId: string;
  noteTitle: string;
}>;

const SEP = "inline-flex text-hairline-strong";
const CRUMB_LINK = "text-ink-tertiary hover:text-ink transition-colors";

export function NoteBreadcrumb({
  directoryPath,
  directoryId,
  noteTitle,
}: NoteBreadcrumbProps) {
  const segments = directoryPath.split("/").filter(Boolean);
  const lastIndex = segments.length - 1;

  return (
    <nav
      aria-label="パンくず"
      className="flex items-center gap-1.5 text-[13px] text-ink-tertiary flex-wrap mb-6 [overflow-wrap:anywhere]"
    >
      <Link to="/" search={HOME_SEARCH} className={CRUMB_LINK}>
        すべてのノート
      </Link>
      {segments.map((segment, index) => {
        const isLeaf = index === lastIndex;
        // Cumulative path is unique even when sibling/ancestor names repeat.
        const key = segments.slice(0, index + 1).join("/");
        return (
          <span key={key} className="flex items-center gap-1.5">
            <span className={SEP} aria-hidden="true">
              <Icon icon={ChevronRight} size={16} />
            </span>
            {isLeaf ? (
              <Link
                to="/"
                search={{ ...HOME_SEARCH, directoryId }}
                className={CRUMB_LINK}
              >
                {segment}
              </Link>
            ) : (
              <span>{segment}</span>
            )}
          </span>
        );
      })}
      <span className={SEP} aria-hidden="true">
        <Icon icon={ChevronRight} size={16} />
      </span>
      <span aria-current="page" className="text-ink-secondary">
        {noteTitle}
      </span>
    </nav>
  );
}
