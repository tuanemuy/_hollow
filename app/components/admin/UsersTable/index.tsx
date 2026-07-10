"use client";

import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Pause, Play, Shield, ShieldOff } from "lucide-react";
import { useId, useMemo, useState, useTransition } from "react";
import { formatJstDateTime } from "@/components/common/dateFormat";
import { Icon } from "@/components/common/Icon";
import { routerInvalidate } from "@/components/common/routerInvalidate";
import { pillBtn, pillBtnSmDense } from "@/components/common/styles";
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

const FIELD_ERROR_CLASS = "text-xs text-error mt-1";

const FILTER_INPUT_CLASS =
  "h-10 px-3 bg-surface rounded-md text-sm text-ink outline-none border-none";

const CELL_BASE = "px-4 py-3 text-left align-middle";

// Below `sm` the high-density table reflows into one card per row (same
// approach as P47 Metrics' LimitsCard): the <table>/<tr>/<td> become block,
// <thead> is hidden, and each auxiliary cell gains a real <span> column label
// (#589 ADR-001/ADR-002). Desktop is untouched (every modifier is `max-sm:`).
const TABLE_CLASS =
  "w-full min-w-[880px] max-sm:min-w-0 border-collapse text-sm max-sm:block";
const ROW_CLASS =
  "border-t border-hairline first:border-t-0 hover:bg-surface-elevated max-sm:block max-sm:border max-sm:border-hairline max-sm:rounded-lg max-sm:mb-3 max-sm:p-4 max-sm:bg-bg";
const CELL_STACK = `${CELL_BASE} max-sm:flex max-sm:gap-3 max-sm:items-start max-sm:py-1`;
const STACK_LABEL =
  "hidden max-sm:inline-block max-sm:w-[84px] text-ink-tertiary text-xs uppercase tracking-[0.04em]";

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
  return formatJstDateTime(value, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function UserRow({
  user,
  currentUserId,
  onChange,
}: {
  user: UserDTO;
  currentUserId: string;
  onChange: () => Promise<void>;
}) {
  const isSelf = user.id === currentUserId;
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
    <tr className={ROW_CLASS}>
      <td
        className={`${CELL_BASE} max-sm:block max-sm:pb-3 max-sm:mb-2 max-sm:border-b max-sm:border-hairline`}
      >
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
      <td className={CELL_STACK}>
        <span className={STACK_LABEL}>登録日</span>
        {formatDate(user.createdAt)}
      </td>
      <td className={CELL_STACK}>
        <span className={STACK_LABEL}>ロール</span>
        <span
          className={`${TAG_BASE} ${user.role === "admin" ? TAG_TONE.info : TAG_TONE.neutral}`}
        >
          {user.role === "admin" ? "管理者" : "メンバー"}
        </span>
      </td>
      <td className={CELL_STACK}>
        <span className={STACK_LABEL}>状態</span>
        <span className={`${TAG_BASE} ${TAG_TONE[statusTone(user.status)]}`}>
          {statusLabel(user.status)}
        </span>
      </td>
      <td className="px-4 py-3 text-right align-middle max-sm:block max-sm:pt-3 max-sm:mt-2 max-sm:border-t max-sm:border-hairline">
        <div className="flex gap-2 justify-end flex-wrap max-sm:flex-col max-sm:items-stretch [&>button]:max-sm:w-full [&>button]:max-sm:justify-center">
          {user.status === "active" && !isSelf ? (
            <button
              type="button"
              className={`${pillBtn} ${pillBtnSmDense}`}
              data-sm=""
              onClick={() => runAction(suspend)}
              disabled={isPending}
            >
              <Icon icon={Pause} />
              一時停止
            </button>
          ) : null}
          {user.status === "suspended" ? (
            <button
              type="button"
              className={`${pillBtn} ${pillBtnSmDense}`}
              data-sm=""
              onClick={() => runAction(reinstate)}
              disabled={isPending}
            >
              <Icon icon={Play} />
              復帰
            </button>
          ) : null}
          {user.status !== "deleted" && user.role === "member" ? (
            <button
              type="button"
              className={`${pillBtn} ${pillBtnSmDense}`}
              data-sm=""
              onClick={() => runAction(promote)}
              disabled={isPending}
            >
              <Icon icon={Shield} />
              管理者に昇格
            </button>
          ) : null}
          {user.status !== "deleted" && user.role === "admin" && !isSelf ? (
            <button
              type="button"
              className={`${pillBtn} ${pillBtnSmDense}`}
              data-sm=""
              onClick={() => runAction(demote)}
              disabled={isPending}
            >
              <Icon icon={ShieldOff} />
              管理者を解除
            </button>
          ) : null}
        </div>
        {summary !== "" ? (
          <p
            className={`${FIELD_ERROR_CLASS} text-right max-sm:text-left`}
            style={{ marginTop: 6 }}
            role="alert"
            aria-live="polite"
          >
            {summary}
          </p>
        ) : null}
      </td>
    </tr>
  );
}

export function UsersTable({
  users,
  currentUserId,
}: {
  users: readonly UserDTO[];
  currentUserId: string;
}) {
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
    await routerInvalidate(router);
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

      <div className="border border-hairline rounded-lg overflow-hidden max-sm:border-none max-sm:rounded-none">
        <div className="overflow-x-auto max-sm:overflow-x-visible">
          <table className={TABLE_CLASS}>
            <thead className="max-sm:hidden">
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
            <tbody className="max-sm:block">
              {filtered.length === 0 ? (
                <tr className="max-sm:block">
                  <td
                    colSpan={5}
                    className="text-center text-ink-tertiary px-4 py-6 max-sm:block max-sm:text-center"
                  >
                    該当するユーザーが見つかりません。
                  </td>
                </tr>
              ) : (
                filtered.map((user) => (
                  <UserRow
                    key={user.id}
                    user={user}
                    currentUserId={currentUserId}
                    onChange={onChange}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
