import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { HOME_SEARCH } from "@/components/auth/links";
import { Icon } from "@/components/common/Icon";
import type { BreadcrumbSegment } from "./directoryTree";

/**
 * Shared pure breadcrumb for the note pages (list P10 / detail P11).
 *
 * Renders a `<links…> › <current>` path where every `links` segment is a
 * `directoryId`-scoped home-list link and `current` is a non-link
 * `aria-current="page"` tail. The separator (›) is placed *between* display
 * elements only — never before the first — so a `links`-empty breadcrumb shows
 * just `current` with no leading separator. Keys use the cumulative id path so
 * repeated segment names render distinctly without React duplicate-key
 * warnings.
 *
 * Callers map their own shape onto this contract:
 *  - `DirectoryBreadcrumb` (P10): all-but-last segments as `links`, the last
 *    segment's name as `current`.
 *  - `NoteBreadcrumb` (P11): all segments as `links`, the note title as
 *    `current`.
 *
 * This consolidates the duplicated Separator / CRUMB_LINK / segment-map /
 * trailing-span / nav className that #743 left in both components (Issue #745,
 * superseding the #710 ADR-001 follow-up note).
 */
export type BreadcrumbProps = Readonly<{
  ariaLabel: string;
  links: readonly BreadcrumbSegment[];
  current: string;
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

export function Breadcrumb({ ariaLabel, links, current }: BreadcrumbProps) {
  return (
    <nav
      aria-label={ariaLabel}
      className="flex items-center gap-1.5 text-sm text-ink-tertiary flex-wrap mb-6 [overflow-wrap:anywhere]"
    >
      {links.map((segment, index) => {
        // Cumulative id path is unique even when sibling/ancestor names repeat.
        const key = links
          .slice(0, index + 1)
          .map((s) => s.id)
          .join("/");
        return (
          <span key={key} className="flex items-center gap-1.5">
            {index > 0 && <Separator />}
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
      {links.length > 0 && <Separator />}
      <span aria-current="page" className="text-ink-secondary">
        {current}
      </span>
    </nav>
  );
}
