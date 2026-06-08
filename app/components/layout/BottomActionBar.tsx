import { BOTTOM_ACTION_BAR } from "./styles";

/**
 * Shared chrome for the mobile下部固定CTAバー. Provides the reusable frame
 * (`fixed` full-width, safe-area bottom padding, `--header-bg` + backdrop blur,
 * hairline top border, `lg:hidden`); each screen injects its CTA content via
 * `children`. The choice of which buttons to render — and how the desktop
 * header CTA is retired on mobile — is per-screen and handled in #588.
 *
 * Pure presentation, so no `"use client"` is needed.
 */
export function BottomActionBar({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return <div className={BOTTOM_ACTION_BAR}>{children}</div>;
}
