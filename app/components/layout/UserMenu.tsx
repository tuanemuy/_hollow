"use client";

import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState, useTransition } from "react";
import { Menu, MenuItem } from "@/components/common/Menu";
import type { UserDTO } from "@/core/application/dto";
import { displayError } from "@/core/presentation/errorDisplay";
import {
  extractSerializedError,
  type SerializedError,
} from "@/core/presentation/errorResponse";
import { logOutFn } from "./action";
import {
  AVATAR,
  USER_MENU_INFO,
  USER_MENU_INFO_EMAIL,
  USER_MENU_INFO_NAME,
  USER_MENU_INFO_ROLE,
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
 * logout action. Built on the shared `<Menu>`/`<MenuItem>` primitive (#467);
 * the identity header and logout error are non-MenuItem children, rendered
 * verbatim and excluded from the roving cycle.
 *
 * While logout is pending the logout (danger) item is `aria-disabled` — it
 * stays focusable in the roving cycle and its click is a no-op (#467 ADR-003).
 */
export function UserMenu({ user }: Props) {
  const router = useRouter();
  const logOut = useServerFn(logOutFn);
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [logoutError, setLogoutError] = useState<SerializedError | null>(null);

  const onLogout = () => {
    setLogoutError(null);
    startTransition(async () => {
      try {
        await logOut({ data: undefined });
        // 認証状態が変わるため _app loader の userDto キャッシュを破棄し、
        // /login へ遷移させる（LoginForm と対称。ADR-001）。
        await router.invalidate();
        await router.navigate({ to: "/login" });
      } catch (error) {
        setLogoutError(extractSerializedError(error));
      }
    });
  };

  return (
    <Menu
      open={open}
      onOpenChange={setOpen}
      ariaLabel={`${user.displayName} のメニュー`}
      panelClassName="absolute right-0 mt-2 z-50 min-w-[220px] shadow-md"
      trigger={(triggerProps) => (
        <button
          {...triggerProps}
          type="button"
          aria-label={`${user.displayName} のメニュー`}
          title={user.displayName}
          className={AVATAR}
        >
          {initials(user.displayName)}
        </button>
      )}
    >
      <div className={USER_MENU_INFO}>
        <span className={USER_MENU_INFO_NAME}>{user.displayName}</span>
        <span className={USER_MENU_INFO_EMAIL}>{user.email}</span>
        <span className={USER_MENU_INFO_ROLE}>{ROLE_LABEL[user.role]}</span>
      </div>
      <MenuItem onSelect={() => router.navigate({ to: "/settings" })}>
        設定
      </MenuItem>
      <MenuItem danger disabled={isPending} onSelect={onLogout}>
        ログアウト
      </MenuItem>
      {logoutError ? (
        <div className="px-3 py-2 text-xs text-error">
          {displayError(logoutError)}
        </div>
      ) : null}
    </Menu>
  );
}
