"use client";

import { useRouter } from "@tanstack/react-router";
import { ChevronLeft, RefreshCw } from "lucide-react";
import { Icon } from "@/components/common/Icon";
import { BACK_LINK, PILL_BTN } from "./styles";

/**
 * Client islands for the P34 error page's history-driven controls. Only the
 * "一つ前に戻る" back link (all variants) and the 500 reload button need an
 * `onClick` handler, so they live here while the rest of `ErrorPage` (static
 * `<Link>`s, copy, search box) stays a server component for SSR/SEO.
 */

/** 500-only primary action: reloads the current page. Placed inside `err-actions`. */
export function ReloadButton() {
  return (
    <button
      type="button"
      className={PILL_BTN}
      data-primary=""
      onClick={() => location.reload()}
    >
      <Icon icon={RefreshCw} size={16} />
      再読み込み
    </button>
  );
}

/** Back link shown on every variant, beneath `err-actions`. */
export function BackLink() {
  const router = useRouter();
  return (
    <button
      type="button"
      className={BACK_LINK}
      onClick={() => router.history.back()}
    >
      <Icon icon={ChevronLeft} size={16} />
      一つ前に戻る
    </button>
  );
}
