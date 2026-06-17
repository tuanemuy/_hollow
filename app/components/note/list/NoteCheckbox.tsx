"use client";

import { Check } from "lucide-react";
import { Icon } from "@/components/common/Icon";

/**
 * Design-compliant selection checkbox (`spec/design/pages/P10-home.html`
 * `.note-check`). Rendered as a native `<button role="checkbox">` so
 * Space / Enter activation and `focus-visible` come for free, while the
 * visual is a styled circle that fills with the accent colour when
 * checked. Shared by the list / tile / calendar views (Issue #354).
 *
 * The design's hover-reveal (`opacity:0` until row hover) is intentionally
 * dropped: the checkbox only renders while selection mode is on, where it
 * must stay visible on touch devices that have no hover.
 *
 * Sized 20px desktop / 24px mobile per the mocks, and the 44px square touch
 * floor (`TOUCH_TARGET_SQUARE`) is intentionally NOT applied: the mock limits
 * the floor to pill/icon buttons so the circle is not stretched, and the whole
 * row is the effective tap target (#749 ADR-001). 24px still meets WCAG 2.5.8.
 */
const NOTE_CHECK =
  "inline-flex items-center justify-center w-5 h-5 max-sm:w-6 max-sm:h-6 rounded-full border-[1.5px] border-hairline-strong bg-transparent text-transparent transition-colors motion-reduce:transition-none hover:border-ink-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-2 data-[checked]:bg-accent data-[checked]:border-accent data-[checked]:text-white";

type Props = Readonly<{
  checked: boolean;
  onToggle: () => void;
  label: string;
}>;

export function NoteCheckbox({ checked, onToggle, label }: Props) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: a native checkbox cannot reproduce the design's styled circle; button + role="checkbox" keeps Space/Enter and focus-visible.
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      data-checked={checked || undefined}
      onClick={(e) => {
        // When nested inside a click-to-select row/card, keep the click
        // from bubbling to the parent toggle so it doesn't fire twice.
        e.stopPropagation();
        onToggle();
      }}
      className={NOTE_CHECK}
    >
      <Icon icon={Check} size={16} />
    </button>
  );
}
