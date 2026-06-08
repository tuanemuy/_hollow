import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { BrandLockup } from "@/components/common/BrandLogo";
import { HOME_SEARCH } from "../links";

type AuthHeaderProps = {
  /** Right-side action element. Defaults to the login entry link. */
  rightSlot?: ReactNode;
};

export function AuthHeader({ rightSlot }: AuthHeaderProps) {
  return (
    <header className="sticky top-0 z-50 h-[var(--header-height)] flex items-center justify-between gap-5 border-b border-hairline bg-[var(--header-bg)] px-[var(--container-padding)] supports-[backdrop-filter]:backdrop-blur-xl supports-[backdrop-filter]:[backdrop-filter:saturate(180%)_blur(20px)]">
      <Link to="/" search={HOME_SEARCH} className="text-ink">
        <BrandLockup />
      </Link>
      {rightSlot ?? (
        <Link
          to="/login"
          className="text-sm text-ink-secondary px-3 py-2 rounded-md transition-colors motion-reduce:transition-none hover:text-ink hover:bg-surface"
        >
          ログイン
        </Link>
      )}
    </header>
  );
}
