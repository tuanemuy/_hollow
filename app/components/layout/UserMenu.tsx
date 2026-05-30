"use client";

import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import type { UserDTO } from "@/core/application/dto";
import { logOutFn } from "./action";
import {
  AVATAR,
  USER_MENU_INFO,
  USER_MENU_INFO_EMAIL,
  USER_MENU_INFO_NAME,
  USER_MENU_INFO_ROLE,
  USER_MENU_ITEM,
  USER_MENU_PANEL,
  USER_MENU_WRAPPER,
} from "./styles";

type Props = {
  user: UserDTO;
};

function initials(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) return "?";
  return trimmed.slice(0, 1).toUpperCase();
}

const ROLE_LABEL: Record<UserDTO["role"], string> = {
  member: "メンバー",
  admin: "管理者",
};

/**
 * Header avatar dropdown. The avatar trigger opens a WAI-ARIA menu that
 * surfaces the current user's identity plus navigation to `/settings` and a
 * logout action. Implements the same roving-tabindex / keyboard-nav / dismiss
 * behavior as `directory/DirectoryActionsMenu` (ADR-003 / #289), kept inline
 * because this is the sole consumer; a general Popover primitive is a
 * follow-up.
 */
export function UserMenu({ user }: Props) {
  const router = useRouter();
  const logOut = useServerFn(logOutFn);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPending, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

  const items: ReadonlyArray<{
    label: string;
    onSelect: () => void;
    danger?: boolean;
  }> = [
    {
      label: "設定",
      onSelect: () => {
        router.navigate({ to: "/settings" });
      },
    },
    {
      label: "ログアウト",
      danger: true,
      onSelect: () => {
        startTransition(async () => {
          await logOut({ data: undefined });
          // 認証状態が変わるため _app loader の userDto キャッシュを破棄し、
          // /login へ遷移させる（LoginForm と対称。ADR-001）。
          await router.invalidate();
          await router.navigate({ to: "/login" });
        });
      },
    },
  ];

  // Roving tabindex: exactly one menuitem carries tabIndex=0 + DOM focus.
  useEffect(() => {
    if (!open) return;
    const menuitems =
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]');
    menuitems?.[activeIndex]?.focus();
  }, [open, activeIndex]);

  const onMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const count = items.length;
    let next: number | null = null;
    if (event.key === "ArrowDown") next = (activeIndex + 1) % count;
    else if (event.key === "ArrowUp") next = (activeIndex - 1 + count) % count;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = count - 1;
    if (next === null) return;
    event.preventDefault();
    setActiveIndex(next);
  };

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (event: MouseEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        containerRef.current !== null &&
        containerRef.current.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const runAndClose = (fn: () => void) => () => {
    triggerRef.current?.focus();
    setOpen(false);
    fn();
  };

  const onFocusOut = (event: React.FocusEvent<HTMLDivElement>) => {
    if (!open) return;
    const next = event.relatedTarget;
    if (next instanceof Node && containerRef.current?.contains(next)) return;
    setOpen(false);
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: wrapper only listens for blur bubbling out of its button + menu children; semantics live on the trigger button and `role="menu"`.
    <div ref={containerRef} className={USER_MENU_WRAPPER} onBlur={onFocusOut}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`${user.displayName} のメニュー`}
        title={user.displayName}
        className={AVATAR}
        onClick={() => {
          if (!open) setActiveIndex(0);
          setOpen((prev) => !prev);
        }}
      >
        {initials(user.displayName)}
      </button>
      {open ? (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          className={USER_MENU_PANEL}
          onKeyDown={onMenuKeyDown}
          onMouseDown={(event) => {
            event.preventDefault();
          }}
        >
          <div className={USER_MENU_INFO}>
            <span className={USER_MENU_INFO_NAME}>{user.displayName}</span>
            <span className={USER_MENU_INFO_EMAIL}>{user.email}</span>
            <span className={USER_MENU_INFO_ROLE}>{ROLE_LABEL[user.role]}</span>
          </div>
          {items.map((item, index) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              tabIndex={index === activeIndex ? 0 : -1}
              data-danger={item.danger || undefined}
              disabled={isPending && item.danger}
              className={USER_MENU_ITEM}
              onClick={runAndClose(item.onSelect)}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
