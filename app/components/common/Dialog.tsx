"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { dialog, dialogBackdrop, dialogCloseButton } from "./styles";

export type DialogProps = Readonly<{
  open: boolean;
  onClose: () => void;
  role?: "dialog" | "alertdialog";
  ariaLabel?: string | undefined;
  ariaLabelledBy?: string | undefined;
  ariaDescribedBy?: string | undefined;
  /**
   * When false, Esc key is ignored. Also disables the opt-in close paths:
   * the × button (`showCloseButton`) is rendered with `disabled`, and the
   * backdrop click (`closeOnBackdropClick`) is a no-op. Use
   * `closable={!isPending}` to prevent dismissing the dialog while an async
   * operation is in flight.
   */
  closable?: boolean;
  /**
   * Opt-in: enable closing the dialog by clicking the backdrop. Defaults to
   * `false` to preserve existing behavior — consumers wired before this prop
   * existed continue to require Esc or an in-body Cancel button.
   *
   * When enabled, an "origin guard" runs: `onClose` only fires when *both*
   * the `mousedown` and the `click` originate on the backdrop element
   * itself. A drag that starts inside the panel (e.g. selecting text in a
   * `<textarea>`) and releases over the backdrop will *not* close — the
   * panel's own `mousedown` handler stops propagation to keep the origin
   * marker on the panel. This matches Radix UI / Headless UI behavior and
   * is the de-facto standard for modal dialogs.
   *
   * Ignored while `closable === false`.
   */
  closeOnBackdropClick?: boolean;
  /**
   * Opt-in: render an "×" close button at the top-right of the panel.
   * Defaults to `false`. The button:
   *   - carries `aria-label="閉じる"` and an `aria-hidden` glyph (U+00D7),
   *     so screen readers announce only the label;
   *   - is included in the Tab focus cycle when enabled (keyboard users can
   *     reach it) but is excluded from *initial* focus per WAI-ARIA Dialog
   *     guidance (initial focus should land on a meaningful control);
   *   - renders with the native `disabled` attribute while
   *     `closable === false`, so the browser blocks both pointer and
   *     keyboard activation and removes it from the tab order automatically.
   *
   * Whether to also keep an in-body Cancel button is a consumer decision —
   * this primitive only provides the close path, not the layout policy.
   *
   * Touch target size: the rendered button is 32×32px to stay consistent with
   * other pill-style controls (e.g. `pillBtn`); ensure dialog body content
   * (e.g. title) reserves right-padding (`pr-10` or similar) so it does not
   * visually collide with the absolute-positioned button.
   *
   * `showCloseButton` is also valid when `role="alertdialog"`. The button
   * stays in the Tab cycle but the initial focus still lands on the panel
   * itself (the alertdialog branch); whether to surface a × on alertdialog is
   * a consumer UX call.
   */
  showCloseButton?: boolean;
  children: React.ReactNode;
}>;

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable]:not([contenteditable="false"])';

// Variant used only when picking the *initial* focus target: the opt-in close
// button (marked with `data-dialog-close`) is intentionally skipped so that
// initial focus lands on a meaningful control even when the close button is
// the first focusable child. The Tab cycle still uses the unfiltered
// `FOCUSABLE_SELECTOR` so the close button remains reachable by keyboard.
//
// Implementation note: a comma-separated CSS selector list is *not*
// distributive — appending `:not(...)` to the full string only attaches it
// to the last selector. We therefore append the filter to every clause
// individually so the close button is excluded across all focusable kinds.
const INITIAL_FOCUS_SELECTOR = FOCUSABLE_SELECTOR.split(", ")
  .map((s) => `${s}:not([data-dialog-close])`)
  .join(", ");

// Module-scope counter for body scroll lock. Multiple concurrent dialogs
// (e.g. a Confirm rendered on top of another Dialog) share the lock so the
// outermost dialog restores the original overflow value on close. Client-only:
// untouched in the SSR path because all reads/writes happen inside `useEffect`.
// Dev-only caveat: Vite HMR re-evaluates this module, resetting both vars to
// their initial values; a dialog open across an HMR boundary can leave
// `overflow: hidden` stuck. Restart the dev server if it happens.
let bodyScrollLockCount = 0;
let bodyScrollLockPrevious = "";

/**
 * Modal dialog wrapper with focus trap, Esc-to-close, and Portal rendering.
 *
 * The component is split into an outer `Dialog` (gates on `open`) and an
 * inner `DialogInner` (owns all hooks). This guarantees the inner effects
 * are mounted/unmounted on each open transition, so cleanup runs reliably
 * and hooks order never depends on `open`.
 *
 * The Dialog renders its own backdrop and panel divs; callers should pass
 * only the dialog body (typically a `<form>`) as `children` without applying
 * the `dialog` / `dialogBackdrop` classes themselves. `aria-modal="true"` is
 * always set internally — this wrapper is modal by design.
 *
 * ### Opt-in close paths
 *
 * Both `closeOnBackdropClick` and `showCloseButton` default to `false`, so
 * existing consumers see no behavioral change. When enabled:
 *
 * - `closeOnBackdropClick` only triggers `onClose` when the `mousedown` *and*
 *   the `click` both originate on the backdrop element — panel-originated
 *   drags that release over the backdrop are ignored.
 * - `showCloseButton` adds an "×" button at the top-right. It participates
 *   in the Tab focus cycle but is excluded from *initial* focus, so the
 *   first meaningful control inside the panel still receives focus on open.
 *
 * Both paths honor `closable === false`: the × button is rendered with the
 * native `disabled` attribute, and the backdrop click handler short-circuits.
 * The runtime `closableRef` check inside the × button's `onClick` is defense
 * in depth — the disabled attribute alone prevents the click in practice,
 * but the ref guard covers the race where `closable` flips to `false`
 * between the pointerdown and click events.
 */
export function Dialog(props: DialogProps) {
  if (!props.open) return null;
  const { open: _open, ...inner } = props;
  return <DialogInner {...inner} />;
}

type DialogInnerProps = Omit<DialogProps, "open">;

function DialogInner({
  onClose,
  role = "dialog",
  ariaLabel,
  ariaLabelledBy,
  ariaDescribedBy,
  closable = true,
  closeOnBackdropClick = false,
  showCloseButton = false,
  children,
}: DialogInnerProps) {
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const previousActiveRef = useRef<HTMLElement | null>(null);
  // Track which element received `mousedown` on the backdrop so the click
  // handler can confirm the gesture started and ended on the backdrop. A
  // drag that starts inside the panel never updates this ref because the
  // panel stops propagation of its own `mousedown`.
  const mousedownTargetRef = useRef<EventTarget | null>(null);
  // Read latest `closable` / `onClose` from a ref so the keydown listener can
  // be attached once and avoid churn when `isPending` toggles each render.
  const closableRef = useRef(closable);
  const onCloseRef = useRef(onClose);
  closableRef.current = closable;
  onCloseRef.current = onClose;

  // SSR guard: `"use client"` still goes through the SSR pass in TanStack
  // Start, so we defer `document` access until after hydration.
  useEffect(() => {
    setMounted(true);
  }, []);

  // Save the previously focused element so we can restore focus on close.
  // Guard against StrictMode double-invocation: if the active element is
  // already inside the panel, do not overwrite the saved value.
  useEffect(() => {
    const activeEl = document.activeElement;
    if (activeEl instanceof HTMLElement) {
      if (panelRef.current?.contains(activeEl)) return;
      previousActiveRef.current = activeEl;
    }
    return () => {
      const prev = previousActiveRef.current;
      if (prev instanceof HTMLElement && prev.isConnected) {
        prev.focus();
      }
    };
  }, []);

  // Lock body scroll while the dialog is mounted. Multiple concurrent dialogs
  // share a module-scope counter so the outermost dialog restores the original
  // overflow value on close.
  useEffect(() => {
    if (bodyScrollLockCount === 0) {
      bodyScrollLockPrevious = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    bodyScrollLockCount += 1;
    return () => {
      bodyScrollLockCount -= 1;
      if (bodyScrollLockCount === 0) {
        document.body.style.overflow = bodyScrollLockPrevious;
      }
    };
  }, []);

  // Esc to close + Tab/Shift+Tab focus trap.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        // Ignore Esc during IME composition (e.g. Japanese 変換 cancel) —
        // otherwise users would lose in-progress form input when cancelling
        // an IME conversion. Scoped to Esc only so Tab trap stays active.
        if (event.isComposing || event.keyCode === 229) return;
        // Consume the Esc event whether or not we close, so upstream listeners
        // (route-level shortcuts, parent modals) don't act on a modal Esc.
        event.preventDefault();
        event.stopPropagation();
        if (closableRef.current) onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const panel = panelRef.current;
      if (panel === null) return;
      const focusables =
        panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      if (focusables.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (first === undefined || last === undefined) return;
      const active = document.activeElement;
      // `Node.contains(self)` returns true, so the panel itself (tabIndex=-1,
      // outside the tab cycle) must be treated as "outside" to keep the trap
      // closed when initial focus lands on the panel — e.g. alertdialog.
      const activeIsOutside = !panel.contains(active) || active === panel;
      if (event.shiftKey) {
        if (active === first || activeIsOutside) {
          event.preventDefault();
          last.focus();
        }
      } else {
        if (active === last || activeIsOutside) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
    };
  }, []);

  // Initial focus: alertdialog focuses the panel itself; otherwise focus
  // the first focusable element inside the panel. Use rAF so the panel is
  // committed to the DOM before we try to focus into it. Depends on `mounted`
  // because the portal (and thus panelRef) is not attached until then.
  useEffect(() => {
    if (!mounted) return;
    const raf = requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (panel === null) return;
      if (role === "alertdialog") {
        panel.focus();
        return;
      }
      // Use the initial-focus variant so the opt-in × close button (when
      // present) is skipped as the initial focus target.
      const focusables = panel.querySelectorAll<HTMLElement>(
        INITIAL_FOCUS_SELECTOR,
      );
      const first = focusables[0];
      if (first !== undefined) {
        first.focus();
      } else {
        panel.focus();
      }
    });
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [mounted, role]);

  if (!mounted) return null;

  return createPortal(
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop is intentionally a non-interactive div; the dialog itself owns the role and provides keyboard close via Esc handled in the document-level keydown listener
    // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard close is delivered via the document-level Esc handler — backdrop pointer interaction is an additional opt-in path for pointer users and has no keyboard equivalent by design (a backdrop is not focusable)
    <div
      className={dialogBackdrop}
      onMouseDown={(e) => {
        mousedownTargetRef.current = e.target;
      }}
      onClick={(e) => {
        // Snapshot then clear the ref up-front so every return path leaves
        // it null. Without this, a script-driven `element.click()` on the
        // backdrop with no preceding mousedown could observe a stale value
        // from an earlier interaction.
        const mousedownTarget = mousedownTargetRef.current;
        mousedownTargetRef.current = null;
        if (!closeOnBackdropClick) return;
        if (!closableRef.current) return;
        // Both the press and the release must have happened on the backdrop
        // itself. `e.target !== e.currentTarget` rejects clicks that bubbled
        // from inside the panel; the mousedown check rejects panel-originated
        // drags that release on the backdrop. The panel's own onMouseDown
        // stops propagation so the ref never sees panel-originated presses.
        if (
          e.target !== e.currentTarget ||
          mousedownTarget !== e.currentTarget
        ) {
          return;
        }
        onCloseRef.current();
      }}
    >
      {/* biome-ignore lint/a11y/useAriaPropsSupportedByRole: role is always "dialog" or "alertdialog", both of which support aria-modal; biome cannot infer this from a dynamic prop */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: the dynamic `role` prop (dialog | alertdialog) makes both roles count as "static" to biome's analysis; the onMouseDown only stops propagation to keep the backdrop origin guard intact, it does not introduce a new user-facing interaction */}
      <div
        ref={panelRef}
        role={role}
        aria-modal="true"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        tabIndex={-1}
        className={dialog}
        onMouseDown={(e) => {
          // Prevent panel-originated mousedown from reaching the backdrop,
          // so the backdrop's origin guard cannot be tricked by a drag that
          // starts inside the panel (e.g. text selection in a textarea).
          e.stopPropagation();
        }}
      >
        {showCloseButton && (
          <button
            type="button"
            aria-label="閉じる"
            data-dialog-close=""
            onClick={() => {
              // Defense-in-depth: the `disabled` attribute already blocks
              // the click in practice, but the ref guards against the race
              // where `closable` flips to `false` between pointerdown and
              // click.
              if (closableRef.current) onCloseRef.current();
            }}
            disabled={!closable}
            className={dialogCloseButton}
          >
            <span aria-hidden="true">×</span>
          </button>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}
