"use client";

import { useLocation, useRouter } from "@tanstack/react-router";
import { useCallback } from "react";
import { UploadDialog } from "./UploadDialog";

const UPLOAD_HASH = "upload";
const UPLOAD_PAGE_PATHNAME = "/upload";

export function UploadDialogMount() {
  const router = useRouter();
  const { pathname, hash } = useLocation();

  const open = hash === UPLOAD_HASH && pathname !== UPLOAD_PAGE_PATHNAME;

  const onClose = useCallback(() => {
    void router.navigate({
      to: ".",
      hash: () => "",
      replace: true,
    });
    if (typeof window !== "undefined" && window.location.hash !== "") {
      window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search,
      );
    }
  }, [router]);

  return <UploadDialog open={open} onClose={onClose} />;
}
