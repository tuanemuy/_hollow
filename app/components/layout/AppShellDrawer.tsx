"use client";

import { useLocation } from "@tanstack/react-router";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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
  children: ReactNode;
};

/**
 * Client wrapper that owns the mobile sidebar drawer's open state and
 * composes the RSC `header` / `sidebar` payloads with the routed
 * `children`. Kept as a thin client island so `AppShellFrame` (and its
 * server-only side-effect imports) stay on the server (ADR-002).
 */
export function AppShellDrawer({ header, sidebar, children }: Props) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((v) => !v), []);

  // Close on route change so tapping a nav link inside the drawer dismisses
  // it.
  const pathname = useLocation({ select: (l) => l.pathname });
  // biome-ignore lint/correctness/useExhaustiveDependencies: closing keys off the pathname change, not `close` identity.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // While the drawer is open, trap background scroll, allow Escape to
  // dismiss it, and close once the viewport grows to `lg` (where the
  // sidebar becomes an in-flow column) so the scroll lock never sticks.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
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
      document.removeEventListener("keydown", onKey);
      lg.removeEventListener("change", onLg);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  const value = useMemo<DrawerContextValue>(
    () => ({ open, toggle, close }),
    [open, toggle, close],
  );

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
        <aside className={APP_SIDEBAR} data-open={open || undefined}>
          {sidebar}
        </aside>
        <main className={APP_MAIN}>{children}</main>
      </div>
    </DrawerCtx.Provider>
  );
}
