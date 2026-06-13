import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { HOME_SEARCH } from "@/components/auth/links";
import { Icon } from "@/components/common/Icon";
import type { BreadcrumbSegment } from "../directoryTree";

/**
 * Pure breadcrumb for the note detail page (P11).
 *
 * Renders "すべてのノート › <dir segments…> › <noteTitle>" from the
 * structured `segments` list. Every directory segment carries its own id,
 * so each is linked to the home list scoped by `directoryId`.
 *
 * When `segments` is empty (root-level note) no directory segment is
 * rendered — passing the root directory id to the `directoryId` filter is
 * intentionally avoided (see Issue #356 ADR-002).
 */
export type NoteBreadcrumbProps = Readonly<{
  segments: readonly BreadcrumbSegment[];
  noteTitle: string;
}>;

const SEP = "inline-flex text-hairline-strong";
const CRUMB_LINK = "text-ink-tertiary hover:text-ink transition-colors";

export function NoteBreadcrumb({ segments, noteTitle }: NoteBreadcrumbProps) {
  return (
    <nav
      aria-label="パンくず"
      className="flex items-center gap-1.5 text-sm text-ink-tertiary flex-wrap mb-6 [overflow-wrap:anywhere]"
    >
      <Link to="/" search={HOME_SEARCH} className={CRUMB_LINK}>
        すべてのノート
      </Link>
      {segments.map((segment, index) => {
        // Cumulative id path is unique even when sibling/ancestor names repeat.
        const key = segments
          .slice(0, index + 1)
          .map((s) => s.id)
          .join("/");
        return (
          <span key={key} className="flex items-center gap-1.5">
            <span className={SEP} aria-hidden="true">
              <Icon icon={ChevronRight} size={16} />
            </span>
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
      <span className={SEP} aria-hidden="true">
        <Icon icon={ChevronRight} size={16} />
      </span>
      <span aria-current="page" className="text-ink-secondary">
        {noteTitle}
      </span>
    </nav>
  );
}
