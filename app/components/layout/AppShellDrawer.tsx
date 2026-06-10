"use client";

import { useLocation } from "@tanstack/react-router";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  APP_LAYOUT_WITH_SIDEBAR,
  APP_MAIN,
  APP_SIDEBAR,
  SIDEBAR_BACKDROP,
} from "./styles";

type DrawerContextValue = Readonly<{
  open: boolean;
  toggle: () => void;
  close: () => void;
}>;

const DrawerCtx = createContext<DrawerContextValue | null>(null);

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Read the off-canvas drawer controls. Consumed by the header's
 * `MenuButton` client island, which lives inside the `Header` RSC payload
 * rendered as a child of this provider (Issue #354 ADR-002).
 */
export function useDrawer(): DrawerContextValue {
  const value = useContext(DrawerCtx);
  if (value === null) {
    throw new Error("useDrawer must be used inside <AppShellDrawer>");
  }
  return value;
}

type Props = {
  header: ReactNode;
  sidebar: ReactNode;
  settingsSidebar?: ReactNode;
  children: ReactNode;
};

/**
 * Client wrapper that owns the mobile sidebar drawer's open state and
 * composes the RSC `header` / `sidebar` payloads with the routed
 * `children`. Kept as a thin client island so `AppShellFrame` (and its
 * server-only side-effect imports) stay on the server (ADR-002).
 *
 * Below `lg` the sidebar is a modal off-canvas drawer, so it gets the same
 * a11y treatment as `common/Dialog`: focus moves in on open, Tab is trapped
 * inside, focus returns to the trigger on close, and the off-screen sidebar
 * is `inert` while closed. At `lg` and up the sidebar is an in-flow column,
 * so none of that applies.
 */
export function AppShellDrawer({
  header,
  sidebar,
  settingsSidebar,
  children,
}: Props) {
  const [open, setOpen] = useState(false);
  // Resolved after mount so SSR/first paint assumes the desktop (in-flow)
  // sidebar and never marks it inert before hydration.
  const [isMobile, setIsMobile] = useState(false);
  const asideRef = useRef<HTMLElement | null>(null);
  const previousActiveRef = useRef<HTMLElement | null>(null);

  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((v) => !v), []);

  // Close on route change so tapping a nav link inside the drawer dismisses
  // it.
  const pathname = useLocation({ select: (l) => l.pathname });
  const inSettings = pathname.startsWith("/settings");
  // biome-ignore lint/correctness/useExhaustiveDependencies: closing keys off the pathname change, not `close` identity.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // While the modal drawer is open: lock background scroll, trap focus, and
  // close on Escape or once the viewport reaches `lg` (where the sidebar
  // becomes an in-flow column, so the scroll lock must never stick).
  useEffect(() => {
    if (!open || !isMobile) return;
    const aside = asideRef.current;
    const active = document.activeElement;
    previousActiveRef.current = active instanceof HTMLElement ? active : null;

    const focusFirst = () => {
      const target =
        aside?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR) ?? aside;
      target?.focus();
    };
    const raf = requestAnimationFrame(focusFirst);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Let a popover layered inside the drawer (e.g. the sidebar-foot user
        // menu, #628 ADR-003) consume Escape first: both its `usePopover`
        // handler and this one listen on `document`, and `stopPropagation`
        // does not stop a sibling listener on the same target. An *open*
        // `usePopover` trigger carries both `aria-haspopup` and
        // `aria-expanded="true"` (React has not re-rendered within this
        // dispatch, so the check is order-independent). The `aria-haspopup`
        // qualifier is required: directory tree nodes also use bare
        // `aria-expanded` for expand/collapse (DirectoryTree) but are not
        // popovers, so matching `aria-expanded` alone would wrongly block the
        // drawer's own Escape whenever a directory is expanded. When a popover
        // is open, skip closing the drawer so only the popover dismisses; the
        // next Escape closes the drawer.
        if (aside?.querySelector('[aria-haspopup][aria-expanded="true"]')) {
          return;
        }
        setOpen(false);
        return;
      }
      if (e.key !== "Tab" || aside === null) return;
      const focusables =
        aside.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (first === undefined || last === undefined) {
        e.preventDefault();
        aside.focus();
        return;
      }
      const el = document.activeElement;
      const outside = !aside.contains(el) || el === aside;
      if (e.shiftKey) {
        if (el === first || outside) {
          e.preventDefault();
          last.focus();
        }
      } else if (el === last || outside) {
        e.preventDefault();
        first.focus();
      }
    };

    const lg = window.matchMedia("(min-width: 1024px)");
    const onLg = () => {
      if (lg.matches) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    lg.addEventListener("change", onLg);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKey);
      lg.removeEventListener("change", onLg);
      document.body.style.overflow = prevOverflow;
      const prev = previousActiveRef.current;
      if (prev?.isConnected) prev.focus();
    };
  }, [open, isMobile]);

  const value = useMemo<DrawerContextValue>(
    () => ({ open, toggle, close }),
    [open, toggle, close],
  );

  // `inert` keeps the off-screen drawer out of the tab order / a11y tree
  // while closed on mobile; never inert on desktop where it is in-flow.
  const inert = isMobile && !open;

  return (
    <DrawerCtx.Provider value={value}>
      {header}
      <button
        type="button"
        aria-label="メニューを閉じる"
        tabIndex={open ? 0 : -1}
        data-open={open || undefined}
        onClick={close}
        className={SIDEBAR_BACKDROP}
      />
      <div className={APP_LAYOUT_WITH_SIDEBAR}>
        <aside
          ref={asideRef}
          className={APP_SIDEBAR}
          data-open={open || undefined}
          aria-label="サイドバー"
          tabIndex={-1}
          {...(isMobile ? { role: "dialog", "aria-modal": open } : {})}
          {...(inert ? { inert: true } : {})}
        >
          {inSettings && settingsSidebar ? settingsSidebar : sidebar}
        </aside>
        <main className={APP_MAIN}>{children}</main>
      </div>
    </DrawerCtx.Provider>
  );
}
