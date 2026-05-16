"use client";

import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useActionState, useId, useState, useTransition } from "react";
import type { UserDTO } from "@/core/application/dto/identity";
import { displayError } from "@/core/presentation/errorDisplay";
import {
  extractSerializedError,
  type SerializedError,
} from "@/core/presentation/errorResponse";
import { PASSWORD_MAX } from "../schema";
import {
  changePasswordFn,
  requestEmailChangeFn,
  revokeAllOtherSessionsFn,
} from "./action";

type FormState = { error: SerializedError | null; ok: boolean };
const initial: FormState = { error: null, ok: false };

export function SecurityForm({ user }: { user: UserDTO }) {
  const router = useRouter();
  const changePassword = useServerFn(changePasswordFn);
  const requestEmailChange = useServerFn(requestEmailChangeFn);
  const revokeAll = useServerFn(revokeAllOtherSessionsFn);

  const cpwId = useId();
  const npwId = useId();
  const revokeId = useId();
  const emailId = useId();
  const pwForEmailId = useId();

  const [pwState, pwAction, pwPending] = useActionState<FormState, FormData>(
    async (_prev, formData) => {
      const currentPassword = String(formData.get("currentPassword") ?? "");
      const newPassword = String(formData.get("newPassword") ?? "");
      const revokeOtherSessions = formData.get("revokeOtherSessions") !== null;
      try {
        await changePassword({
          data: { currentPassword, newPassword, revokeOtherSessions },
        });
        await router.invalidate();
        return { error: null, ok: true };
      } catch (e) {
        return { error: extractSerializedError(e), ok: false };
      }
    },
    initial,
  );

  const [emailState, emailAction, emailPending] = useActionState<
    FormState,
    FormData
  >(async (_prev, formData) => {
    const newEmail = String(formData.get("newEmail") ?? "").trim();
    const currentPassword = String(formData.get("currentPassword") ?? "");
    try {
      await requestEmailChange({ data: { newEmail, currentPassword } });
      await router.invalidate();
      return { error: null, ok: true };
    } catch (e) {
      return { error: extractSerializedError(e), ok: false };
    }
  }, initial);

  const [isPending, startTransition] = useTransition();
  const [sessionsError, setSessionsError] = useState<SerializedError | null>(
    null,
  );
  const [revokedCount, setRevokedCount] = useState<number | null>(null);

  const onRevokeAll = () => {
    startTransition(async () => {
      try {
        const { revokedCount: count } = await revokeAll({ data: {} });
        await router.invalidate();
        setSessionsError(null);
        setRevokedCount(count);
      } catch (e) {
        setSessionsError(extractSerializedError(e));
      }
    });
  };

  const pwFieldErrors =
    pwState.error?.kind === "validation"
      ? pwState.error.fieldErrors
      : undefined;
  const pwSummary =
    pwState.error !== null && pwFieldErrors === undefined
      ? displayError(pwState.error)
      : "";

  const emailFieldErrors =
    emailState.error?.kind === "validation"
      ? emailState.error.fieldErrors
      : undefined;
  const emailSummary =
    emailState.error !== null && emailFieldErrors === undefined
      ? displayError(emailState.error)
      : "";

  const sessionsSummary =
    sessionsError !== null ? displayError(sessionsError) : "";

  return (
    <section>
      <h2>パスワード変更</h2>
      <form action={pwAction}>
        <label htmlFor={cpwId}>現在のパスワード</label>
        <input
          id={cpwId}
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          maxLength={PASSWORD_MAX}
          required
          disabled={pwPending}
        />
        {pwFieldErrors?.currentPassword !== undefined ? (
          <p role="alert">{pwFieldErrors.currentPassword[0]}</p>
        ) : null}

        <label htmlFor={npwId}>新しいパスワード</label>
        <input
          id={npwId}
          name="newPassword"
          type="password"
          autoComplete="new-password"
          maxLength={PASSWORD_MAX}
          required
          disabled={pwPending}
        />
        {pwFieldErrors?.newPassword !== undefined ? (
          <p role="alert">{pwFieldErrors.newPassword[0]}</p>
        ) : null}

        <label>
          <input
            type="checkbox"
            name="revokeOtherSessions"
            disabled={pwPending}
          />
          <span>他の端末からはログアウトする</span>
        </label>

        <button type="submit" disabled={pwPending}>
          {pwPending ? "変更中..." : "パスワードを変更"}
        </button>
        {pwSummary !== "" ? <p role="alert">{pwSummary}</p> : null}
        {pwState.ok ? <p aria-live="polite">変更しました</p> : null}
      </form>

      <hr />

      <h2>メールアドレス変更</h2>
      <p>
        現在: <strong>{user.email}</strong>
      </p>
      <form action={emailAction}>
        <label htmlFor={emailId}>新しいメールアドレス</label>
        <input
          id={emailId}
          name="newEmail"
          type="email"
          autoComplete="email"
          required
          disabled={emailPending}
        />
        {emailFieldErrors?.newEmail !== undefined ? (
          <p role="alert">{emailFieldErrors.newEmail[0]}</p>
        ) : null}

        <label htmlFor={pwForEmailId}>現在のパスワード</label>
        <input
          id={pwForEmailId}
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          maxLength={PASSWORD_MAX}
          required
          disabled={emailPending}
        />
        {emailFieldErrors?.currentPassword !== undefined ? (
          <p role="alert">{emailFieldErrors.currentPassword[0]}</p>
        ) : null}

        <button type="submit" disabled={emailPending}>
          {emailPending ? "送信中..." : "確認メールを送信"}
        </button>
        {emailSummary !== "" ? <p role="alert">{emailSummary}</p> : null}
        {emailState.ok ? (
          <p aria-live="polite">
            確認メールを送信しました。リンクをクリックすると変更が確定します。
          </p>
        ) : null}
      </form>

      <hr />

      <h2>セッション</h2>
      <button
        id={revokeId}
        type="button"
        onClick={onRevokeAll}
        disabled={isPending}
      >
        {isPending ? "処理中..." : "他のすべてのセッションをログアウト"}
      </button>
      {revokedCount !== null ? (
        <p aria-live="polite">{revokedCount} 件のセッションを無効化しました</p>
      ) : null}
      {sessionsSummary !== "" ? <p role="alert">{sessionsSummary}</p> : null}
    </section>
  );
}
