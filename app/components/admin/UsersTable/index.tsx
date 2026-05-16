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

function avatarInitials(user: UserDTO): string {
  const source = user.displayName.trim() || user.username;
  const tokens = source.split(/\s+/).filter((t) => t.length > 0);
  if (tokens.length >= 2) {
    return `${tokens[0]?.[0] ?? ""}${tokens[1]?.[0] ?? ""}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

function statusTagClass(status: UserDTO["status"]): string {
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
    <tr>
      <td>
        <div className="admin-user-cell">
          <span className="admin-user-avatar">{avatarInitials(user)}</span>
          <div>
            <div className="admin-user-handle">
              @{user.username}
              {user.displayName !== user.username ? (
                <span
                  style={{
                    color: "var(--admin-color-ink-tertiary)",
                    fontWeight: 400,
                  }}
                >
                  {" "}
                  · {user.displayName}
                </span>
              ) : null}
            </div>
            <div className="admin-user-sub">{user.email}</div>
          </div>
        </div>
      </td>
      <td>{formatDate(user.createdAt)}</td>
      <td>
        <span className={`admin-tag ${user.role === "admin" ? "info" : ""}`}>
          {user.role === "admin" ? "管理者" : "メンバー"}
        </span>
      </td>
      <td>
        <span className={`admin-tag ${statusTagClass(user.status)}`}>
          {statusLabel(user.status)}
        </span>
      </td>
      <td style={{ textAlign: "right" }}>
        <div className="admin-row-actions">
          {user.status === "active" ? (
            <button
              type="button"
              className="admin-btn sm"
              onClick={() => runAction(suspend)}
              disabled={isPending}
            >
              一時停止
            </button>
          ) : null}
          {user.status === "suspended" ? (
            <button
              type="button"
              className="admin-btn sm"
              onClick={() => runAction(reinstate)}
              disabled={isPending}
            >
              復帰
            </button>
          ) : null}
          {user.status !== "deleted" && user.role === "member" ? (
            <button
              type="button"
              className="admin-btn sm"
              onClick={() => runAction(promote)}
              disabled={isPending}
            >
              管理者に昇格
            </button>
          ) : null}
          {user.status !== "deleted" && user.role === "admin" ? (
            <button
              type="button"
              className="admin-btn sm"
              onClick={() => runAction(demote)}
              disabled={isPending}
            >
              管理者を解除
            </button>
          ) : null}
        </div>
        {summary !== "" ? (
          <p
            className="admin-field-error"
            style={{ textAlign: "right", marginTop: 6 }}
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
      <div className="admin-filters">
        <input
          id={queryId}
          type="search"
          className="admin-filter-input"
          placeholder="ハンドル / メール / 表示名"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="ユーザー検索"
        />
        <select
          id={statusId}
          className="admin-filter-input"
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

      <div className="admin-table-wrap">
        <div className="admin-table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th>ユーザー</th>
                <th>登録日</th>
                <th>ロール</th>
                <th>状態</th>
                <th style={{ textAlign: "right" }}>アクション</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    style={{
                      textAlign: "center",
                      color: "var(--admin-color-ink-tertiary)",
                      padding: "var(--admin-space-6)",
                    }}
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
