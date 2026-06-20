import { Breadcrumb } from "../Breadcrumb";
import type { BreadcrumbSegment } from "../directoryTree";

/**
 * Directory breadcrumb for the note list page (P10).
 *
 * A thin wrapper over the shared {@link Breadcrumb}: the ancestor segments are
 * `directoryId`-scoped links and the **last** segment (the current directory)
 * is the non-link `aria-current="page"` tail — so the active directory reads
 * as "where you are", a location rather than a filter chip, matching the
 * detail-page `NoteBreadcrumb` tail.
 *
 * `segments` must be non-empty and root-free (the implicit `name === ""` root
 * is dropped by `directoryAncestorSegments`); the caller renders a generic
 * fallback when it cannot resolve any segment, so the empty case never reaches
 * here.
 *
 * Pure display component with no client state (#743 ADR-002, superseding #710
 * ADR-001 / ADR-002; breadcrumb rendering unified in #745).
 */
export type DirectoryBreadcrumbProps = Readonly<{
  segments: readonly BreadcrumbSegment[];
}>;

export function DirectoryBreadcrumb({ segments }: DirectoryBreadcrumbProps) {
  return (
    <Breadcrumb
      ariaLabel="現在のディレクトリ"
      links={segments.slice(0, -1)}
      current={segments[segments.length - 1]?.name ?? ""}
    />
  );
}
