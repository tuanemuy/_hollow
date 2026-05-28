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
 *   (16 / 20 / 24) and is forwarded to lucide's `size` prop (which lucide
 *   internally maps to both `width` and `height`).
 * - `strokeWidth` is fixed at `1.5` (the line-art stroke the spec mandates).
 * - When `label` is a non-empty string, the SVG is exposed to assistive tech
 *   as `role="img"` with `aria-label={label}`. When `label` is omitted or an
 *   empty string, the SVG is marked `aria-hidden="true"` and treated as
 *   decorative (an empty `aria-label` would produce an invalid accessible
 *   name, so we normalize it to the decorative path).
 * - `className` may be used for color inheritance (`text-*` tokens) and for
 *   positioning utilities (`absolute`, `left-*`, `top-*`, `translate-*`,
 *   `pointer-events-none`, `block`, `mx-auto`, `mb-*` etc.). Do not pass
 *   `w-*` / `h-*` here — the `size` prop is the single source of truth for
 *   dimensions.
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
  if (label !== undefined && label !== "") {
    return (
      <IconComponent
        size={size}
        strokeWidth={1.5}
        className={className}
        role="img"
        aria-label={label}
      />
    );
  }
  return (
    <IconComponent
      size={size}
      strokeWidth={1.5}
      className={className}
      aria-hidden="true"
    />
  );
}
