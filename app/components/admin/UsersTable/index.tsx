"use client";

import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useId, useMemo, useState, useTransition } from "react";
import type { UserDTO } from "@/core/application/dto/identity";
import { displayError } from "@/core/presentation/errorDisplay";
import {
  extractSerializedError,
  type SerializedError,
} from "@/core/presentation/errorResponse";
import {
  demoteUserFn,
  promoteUserFn,
  reinstateUserFn,
  suspendUserFn,
} from "./action";

type StatusFilter = "all" | UserDTO["status"];
type Tone = "success" | "info" | "warning" | "error" | "neutral";

const TAG_BASE =
  "inline-flex items-center gap-[5px] px-[9px] py-[2px] rounded-pill text-xs font-medium";

const TAG_TONE: Record<Tone, string> = {
  success: "bg-success-surface text-success",
  info: "bg-accent-surface text-accent-ink",
  warning: "bg-warning-surface text-warning",
  error: "bg-error-surface text-error",
  neutral: "bg-surface text-ink-secondary",
};

const BTN_SM_CLASS =
  "inline-flex items-center gap-1.5 h-7 px-3 rounded-pill bg-surface text-ink text-xs font-medium whitespace-nowrap transition-colors motion-reduce:transition-none duration-[var(--duration-fast)] ease-[var(--ease-standard)] hover:not-disabled:bg-surface-hover disabled:opacity-50 disabled:cursor-not-allowed";

const FIELD_ERROR_CLASS = "text-xs text-error mt-1";

const FILTER_INPUT_CLASS =
  "h-9 px-3 bg-surface rounded-md text-sm text-ink outline-none border-none";

const CELL_BASE = "px-4 py-3 text-left align-middle";

function avatarInitials(user: UserDTO): string {
  const source = user.displayName.trim() || user.username;
  const tokens = source.split(/\s+/).filter((t) => t.length > 0);
  if (tokens.length >= 2) {
    return `${tokens[0]?.[0] ?? ""}${tokens[1]?.[0] ?? ""}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

function statusTone(status: UserDTO["status"]): Tone {
  switch (status) {
    case "active":
      return "success";
    case "pending":
      return "info";
    case "suspended":
      return "warning";
    case "deleted":
      return "error";
  }
}

function statusLabel(status: UserDTO["status"]): string {
  switch (status) {
    case "active":
      return "アクティブ";
    case "pending":
      return "未確認";
    case "suspended":
      return "一時停止";
    case "deleted":
      return "削除済み";
  }
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function UserRow({
  user,
  onChange,
}: {
  user: UserDTO;
  onChange: () => Promise<void>;
}) {
  const suspend = useServerFn(suspendUserFn);
  const reinstate = useServerFn(reinstateUserFn);
  const promote = useServerFn(promoteUserFn);
  const demote = useServerFn(demoteUserFn);

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<SerializedError | null>(null);

  const runAction = (
    action: (args: { data: { targetUserId: string } }) => Promise<unknown>,
  ) => {
    startTransition(async () => {
      setError(null);
      try {
        await action({ data: { targetUserId: user.id } });
        await onChange();
      } catch (caught) {
        setError(extractSerializedError(caught));
      }
    });
  };

  const summary = error !== null ? displayError(error) : "";

  return (
    <tr className="border-t border-hairline first:border-t-0 hover:bg-surface-elevated">
      <td className={CELL_BASE}>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center justify-center w-8 h-8 shrink-0 rounded-full text-white text-[11px] font-medium bg-[linear-gradient(135deg,#c9d3df_0%,#8e99a8_100%)]">
            {avatarInitials(user)}
          </span>
          <div>
            <div className="text-sm font-medium">
              @{user.username}
              {user.displayName !== user.username ? (
                <span className="text-ink-tertiary font-normal">
                  {" "}
                  · {user.displayName}
                </span>
              ) : null}
            </div>
            <div className="text-xs text-ink-tertiary">{user.email}</div>
          </div>
        </div>
      </td>
      <td className={CELL_BASE}>{formatDate(user.createdAt)}</td>
      <td className={CELL_BASE}>
        <span
          className={`${TAG_BASE} ${user.role === "admin" ? TAG_TONE.info : TAG_TONE.neutral}`}
        >
          {user.role === "admin" ? "管理者" : "メンバー"}
        </span>
      </td>
      <td className={CELL_BASE}>
        <span className={`${TAG_BASE} ${TAG_TONE[statusTone(user.status)]}`}>
          {statusLabel(user.status)}
        </span>
      </td>
      <td className="px-4 py-3 text-right align-middle">
        <div className="flex gap-2 justify-end flex-wrap">
          {user.status === "active" ? (
            <button
              type="button"
              className={BTN_SM_CLASS}
              onClick={() => runAction(suspend)}
              disabled={isPending}
            >
              一時停止
            </button>
          ) : null}
          {user.status === "suspended" ? (
            <button
              type="button"
              className={BTN_SM_CLASS}
              onClick={() => runAction(reinstate)}
              disabled={isPending}
            >
              復帰
            </button>
          ) : null}
          {user.status !== "deleted" && user.role === "member" ? (
            <button
              type="button"
              className={BTN_SM_CLASS}
              onClick={() => runAction(promote)}
              disabled={isPending}
            >
              管理者に昇格
            </button>
          ) : null}
          {user.status !== "deleted" && user.role === "admin" ? (
            <button
              type="button"
              className={BTN_SM_CLASS}
              onClick={() => runAction(demote)}
              disabled={isPending}
            >
              管理者を解除
            </button>
          ) : null}
        </div>
        {summary !== "" ? (
          <p
            className={`${FIELD_ERROR_CLASS} text-right`}
            style={{ marginTop: 6 }}
          >
            {summary}
          </p>
        ) : null}
      </td>
    </tr>
  );
}

export function UsersTable({ users }: { users: readonly UserDTO[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const queryId = useId();
  const statusId = useId();

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return users.filter((user) => {
      if (status !== "all" && user.status !== status) return false;
      if (needle === "") return true;
      return (
        user.username.toLowerCase().includes(needle) ||
        user.email.toLowerCase().includes(needle) ||
        user.displayName.toLowerCase().includes(needle)
      );
    });
  }, [users, query, status]);

  const onChange = async () => {
    await router.invalidate();
  };

  return (
    <>
      <div className="flex gap-3 flex-wrap mb-5">
        <input
          id={queryId}
          type="search"
          className={FILTER_INPUT_CLASS}
          placeholder="ハンドル / メール / 表示名"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="ユーザー検索"
        />
        <select
          id={statusId}
          className={FILTER_INPUT_CLASS}
          value={status}
          onChange={(event) => setStatus(event.target.value as StatusFilter)}
          aria-label="状態フィルタ"
        >
          <option value="all">状態: すべて</option>
          <option value="active">アクティブ</option>
          <option value="pending">未確認</option>
          <option value="suspended">一時停止</option>
          <option value="deleted">削除済み</option>
        </select>
      </div>

      <div className="border border-hairline rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="font-medium text-ink-secondary bg-surface-elevated border-b border-hairline text-xs uppercase tracking-[0.04em] text-left align-middle px-4 py-3">
                  ユーザー
                </th>
                <th className="font-medium text-ink-secondary bg-surface-elevated border-b border-hairline text-xs uppercase tracking-[0.04em] text-left align-middle px-4 py-3">
                  登録日
                </th>
                <th className="font-medium text-ink-secondary bg-surface-elevated border-b border-hairline text-xs uppercase tracking-[0.04em] text-left align-middle px-4 py-3">
                  ロール
                </th>
                <th className="font-medium text-ink-secondary bg-surface-elevated border-b border-hairline text-xs uppercase tracking-[0.04em] text-left align-middle px-4 py-3">
                  状態
                </th>
                <th className="font-medium text-ink-secondary bg-surface-elevated border-b border-hairline text-xs uppercase tracking-[0.04em] text-right align-middle px-4 py-3">
                  アクション
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="text-center text-ink-tertiary px-4 py-6"
                  >
                    該当するユーザーが見つかりません。
                  </td>
                </tr>
              ) : (
                filtered.map((user) => (
                  <UserRow key={user.id} user={user} onChange={onChange} />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
