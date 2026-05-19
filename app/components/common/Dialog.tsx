"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { dialog, dialogBackdrop } from "@/components/note/styles";

export type DialogProps = Readonly<{
  open: boolean;
  onClose: () => void;
  role?: "dialog" | "alertdialog";
  ariaLabel?: string | undefined;
  ariaLabelledBy?: string | undefined;
  ariaDescribedBy?: string | undefined;
  /**
   * When false, Esc key is ignored. Use `closable={!isPending}` to prevent
   * dismissing the dialog while an async operation is in flight.
   */
  closable?: boolean;
  children: React.ReactNode;
}>;

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable]:not([contenteditable="false"])';

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
  children,
}: DialogInnerProps) {
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const previousActiveRef = useRef<HTMLElement | null>(null);
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
      const focusables =
        panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
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
    <div className={dialogBackdrop}>
      {/* biome-ignore lint/a11y/useAriaPropsSupportedByRole: role is always "dialog" or "alertdialog", both of which support aria-modal; biome cannot infer this from a dynamic prop */}
      <div
        ref={panelRef}
        role={role}
        aria-modal="true"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        tabIndex={-1}
        className={dialog}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
