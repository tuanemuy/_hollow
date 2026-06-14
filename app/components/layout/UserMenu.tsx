"use client";

import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ChevronsUpDown } from "lucide-react";
import { useState, useTransition } from "react";
import { Icon } from "@/components/common/Icon";
import { Menu, MenuItem } from "@/components/common/Menu";
import { clearAppShellCache } from "@/components/common/routerInvalidate";
import type { UserDTO } from "@/core/application/dto";
import { displayError } from "@/core/presentation/errorDisplay";
import {
  extractSerializedError,
  type SerializedError,
} from "@/core/presentation/errorResponse";
import { logOutFn } from "./logOutAction";
import {
  AVATAR,
  SIDEBAR_USER_CARET,
  SIDEBAR_USER_EMAIL,
  SIDEBAR_USER_META,
  SIDEBAR_USER_NAME,
  SIDEBAR_USER_ROW,
  USER_MENU_INFO,
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
 * Sidebar-foot user menu (#628 ADR-003: relocated from the header avatar).
 * The trigger is a full-width row — avatar + name + email + caret — and the
 * `<Menu>` panel opens upward (`bottom-full`) since the row sits at the screen
 * foot. The panel surfaces the role label plus navigation to `/settings` and a
 * logout action; identity (name / email) lives in the trigger row, so the
 * panel header carries only the role to avoid duplication. Built on the shared
 * `<Menu>`/`<MenuItem>` primitive (#467).
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
        // 認証状態が変わるため _app loader の userDto キャッシュを clearCache で
        // 破棄してから /login へ遷移させる。invalidate と違い in-place 再評価を
        // 起こさないので navigate 前にランディングが 1 フレーム描画される race を
        // 避けられる（LoginForm と対称。#728 ADR-001）。
        clearAppShellCache(router);
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
      panelClassName="absolute left-0 right-0 bottom-full mb-2 z-50 shadow-md"
      trigger={(triggerProps) => (
        <button
          {...triggerProps}
          type="button"
          aria-label={`${user.displayName} のメニュー`}
          title={user.displayName}
          className={SIDEBAR_USER_ROW}
        >
          <span className={`${AVATAR} shrink-0`}>
            {initials(user.displayName)}
          </span>
          <span className={SIDEBAR_USER_META}>
            <span className={SIDEBAR_USER_NAME}>{user.displayName}</span>
            <span className={SIDEBAR_USER_EMAIL}>{user.email}</span>
          </span>
          <Icon
            icon={ChevronsUpDown}
            size={16}
            className={SIDEBAR_USER_CARET}
          />
        </button>
      )}
    >
      <div className={USER_MENU_INFO}>
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
