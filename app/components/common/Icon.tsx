import type { LucideIcon } from "lucide-react";

type IconSize = 16 | 20 | 24;

type IconProps = {
  icon: LucideIcon;
  size?: IconSize;
  label?: string;
  className?: string;
};

/**
 * Thin wrapper around `lucide-react` icons enforcing the design-system contract
 * from `spec/design/index.md` §7.
 *
 * - `size` is restricted at the type level to the three allowed values
 *   (16 / 20 / 24) and is applied to both `width` and `height`.
 * - `strokeWidth` is fixed at `1.5` (the line-art stroke the spec mandates).
 * - When `label` is provided, the SVG is exposed to assistive tech as
 *   `role="img"` with `aria-label={label}`. When omitted, the SVG is marked
 *   `aria-hidden="true"` and treated as decorative.
 * - `className` is intended only for color inheritance via Tailwind `text-*`
 *   tokens (icons inherit `currentColor`). Do not pass `w-*` / `h-*` here —
 *   the size prop is the single source of truth for dimensions.
 *
 * NOTE: when an icon is the sole visible child of a `<button>`, omit `label`
 * and place `aria-label` on the parent `<button>` instead. Providing both
 * would double-up the accessible name.
 */
export function Icon({
  icon: IconComponent,
  size = 16,
  label,
  className,
}: IconProps) {
  if (label !== undefined) {
    return (
      <IconComponent
        width={size}
        height={size}
        strokeWidth={1.5}
        className={className}
        role="img"
        aria-label={label}
      />
    );
  }
  return (
    <IconComponent
      width={size}
      height={size}
      strokeWidth={1.5}
      className={className}
      aria-hidden="true"
    />
  );
}
