import { Breadcrumb } from "../Breadcrumb";
import type { BreadcrumbSegment } from "../directoryTree";

/**
 * Pure breadcrumb for the note detail page (P11).
 *
 * A thin wrapper over the shared {@link Breadcrumb}: every directory segment is
 * a `directoryId`-scoped link and `noteTitle` is the non-link
 * `aria-current="page"` tail. When `segments` is empty (root-level note) only
 * the title renders with no leading separator — passing the root directory id
 * to the `directoryId` filter is intentionally avoided (Issue #356 ADR-002).
 *
 * Breadcrumb rendering unified in #745.
 */
export type NoteBreadcrumbProps = Readonly<{
  segments: readonly BreadcrumbSegment[];
  noteTitle: string;
}>;

export function NoteBreadcrumb({ segments, noteTitle }: NoteBreadcrumbProps) {
  return (
    <Breadcrumb ariaLabel="パンくず" links={segments} current={noteTitle} />
  );
}
