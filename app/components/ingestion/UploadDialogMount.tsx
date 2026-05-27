"use client";

import { useLocation, useRouter } from "@tanstack/react-router";
import { useCallback } from "react";
import { UploadDialog } from "./UploadDialog";

const UPLOAD_HASH = "upload";
const UPLOAD_PAGE_PATHNAME = "/upload";

// Normalize pathname so trailing slashes and case differences do not
// bypass the `/upload` suppression. TanStack Router normalizes most
// inputs, but external links and future router-config changes can
// still produce variants — keep the guard robust by hand.
function normalizePathname(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, "");
  return (trimmed === "" ? "/" : trimmed).toLowerCase();
}

export function UploadDialogMount() {
  const router = useRouter();
  // Subscribe with selectors so unrelated location changes
  // (search-param updates, etc.) do not re-render the mount.
  const hash = useLocation({ select: (l) => l.hash });
  const pathname = useLocation({ select: (l) => l.pathname });

  const open =
    hash === UPLOAD_HASH &&
    normalizePathname(pathname) !== UPLOAD_PAGE_PATHNAME;

  const onClose = useCallback(() => {
    void router
      .navigate({
        to: ".",
        hash: () => "",
        replace: true,
      })
      .then(() => {
        if (typeof window !== "undefined" && window.location.hash !== "") {
          window.history.replaceState(
            null,
            "",
            window.location.pathname + window.location.search,
          );
        }
      });
  }, [router]);

  return <UploadDialog open={open} onClose={onClose} />;
}
