"use client";

import { getRouteApi, useRouter } from "@tanstack/react-router";
import { EyeOff } from "lucide-react";
import { Icon } from "@/components/common/Icon";
import { pillBtn, pillBtnPrimary } from "@/components/common/styles";
import type { UploadSearch } from "./uploadSearch";

const uploadRoute = getRouteApi("/_app/upload/");

/**
 * Client-only toggle for the upload queue's "show discarded" filter.
 *
 * Standalone by design: it reads `includeDiscarded` from the route search
 * itself (no props from the server component `UploadPage`, so no
 * serialization-boundary callbacks). Flipping it navigates the URL —
 * `loaderDeps: ({ search }) => search` makes the loader re-stream the RSC
 * with the new filter, and `UploadPage` keys `IngestionQueue` on the
 * value so the polling client state is rebuilt cleanly. OFF drops the
 * param entirely to keep the URL clean (Issue #215). `replace: true`
 * keeps a filter flip out of the back-button history.
 */
export function DiscardedToggle() {
  const router = useRouter();
  const active = uploadRoute.useSearch({
    select: (s: UploadSearch) => s.includeDiscarded ?? false,
  });

  const toggle = () => {
    const next = !active;
    router.navigate({
      to: "/upload",
      replace: true,
      search: (prev) => ({
        ...(prev as Partial<UploadSearch>),
        includeDiscarded: next ? true : undefined,
      }),
    });
  };

  return (
    <button
      type="button"
      aria-pressed={active}
      data-primary={active || undefined}
      className={`${pillBtn} ${pillBtnPrimary}`}
      onClick={toggle}
    >
      <Icon icon={EyeOff} />
      破棄済みを表示
    </button>
  );
}
