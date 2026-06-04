"use client";

import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useActionState, useId, useState, useTransition } from "react";
import { routerInvalidate } from "@/components/common/routerInvalidate";
import type { UserDTO } from "@/core/application/dto/identity";
import { displayError } from "@/core/presentation/errorDisplay";
import {
  extractSerializedError,
  type SerializedError,
} from "@/core/presentation/errorResponse";
import { PASSWORD_MAX } from "../schema";
import {
  ACTION_ROW,
  BTN_PRIMARY,
  BTN_SECONDARY,
  CHECKBOX_ROW,
  CURRENT_VALUE,
  CURRENT_VALUE_STRONG,
  FIELD,
  FIELD_ERROR,
  FIELD_INPUT,
  FIELD_LABEL,
  FORM,
  SECTION,
  SECTION_DIVIDER,
  SECTION_TITLE,
  SUCCESS_MSG,
} from "../styles";
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
        await routerInvalidate(router);
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
      await routerInvalidate(router);
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
        await routerInvalidate(router);
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
    <section className={SECTION}>
      <h2 className={SECTION_TITLE}>パスワード変更</h2>
      <form action={pwAction} className={FORM}>
        <div className={FIELD}>
          <label htmlFor={cpwId} className={FIELD_LABEL}>
            現在のパスワード
          </label>
          <input
            id={cpwId}
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            maxLength={PASSWORD_MAX}
            required
            disabled={pwPending}
            className={FIELD_INPUT}
          />
          {pwFieldErrors?.currentPassword !== undefined ? (
            <p role="alert" className={FIELD_ERROR}>
              {pwFieldErrors.currentPassword[0]}
            </p>
          ) : null}
        </div>

        <div className={FIELD}>
          <label htmlFor={npwId} className={FIELD_LABEL}>
            新しいパスワード
          </label>
          <input
            id={npwId}
            name="newPassword"
            type="password"
            autoComplete="new-password"
            maxLength={PASSWORD_MAX}
            required
            disabled={pwPending}
            className={FIELD_INPUT}
          />
          {pwFieldErrors?.newPassword !== undefined ? (
            <p role="alert" className={FIELD_ERROR}>
              {pwFieldErrors.newPassword[0]}
            </p>
          ) : null}
        </div>

        <label className={CHECKBOX_ROW}>
          <input
            type="checkbox"
            name="revokeOtherSessions"
            disabled={pwPending}
          />
          <span>他の端末からはログアウトする</span>
        </label>

        <div className={ACTION_ROW}>
          <button type="submit" disabled={pwPending} className={BTN_PRIMARY}>
            {pwPending ? "変更中..." : "パスワードを変更"}
          </button>
        </div>
        {pwSummary !== "" ? (
          <p role="alert" className={FIELD_ERROR}>
            {pwSummary}
          </p>
        ) : null}
        {pwState.ok ? (
          <p aria-live="polite" className={SUCCESS_MSG}>
            変更しました
          </p>
        ) : null}
      </form>

      <hr className={SECTION_DIVIDER} />

      <h2 className={SECTION_TITLE}>メールアドレス変更</h2>
      <p className={CURRENT_VALUE}>
        現在: <strong className={CURRENT_VALUE_STRONG}>{user.email}</strong>
      </p>
      <form action={emailAction} className={FORM}>
        <div className={FIELD}>
          <label htmlFor={emailId} className={FIELD_LABEL}>
            新しいメールアドレス
          </label>
          <input
            id={emailId}
            name="newEmail"
            type="email"
            autoComplete="email"
            required
            disabled={emailPending}
            className={FIELD_INPUT}
          />
          {emailFieldErrors?.newEmail !== undefined ? (
            <p role="alert" className={FIELD_ERROR}>
              {emailFieldErrors.newEmail[0]}
            </p>
          ) : null}
        </div>

        <div className={FIELD}>
          <label htmlFor={pwForEmailId} className={FIELD_LABEL}>
            現在のパスワード
          </label>
          <input
            id={pwForEmailId}
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            maxLength={PASSWORD_MAX}
            required
            disabled={emailPending}
            className={FIELD_INPUT}
          />
          {emailFieldErrors?.currentPassword !== undefined ? (
            <p role="alert" className={FIELD_ERROR}>
              {emailFieldErrors.currentPassword[0]}
            </p>
          ) : null}
        </div>

        <div className={ACTION_ROW}>
          <button type="submit" disabled={emailPending} className={BTN_PRIMARY}>
            {emailPending ? "送信中..." : "確認メールを送信"}
          </button>
        </div>
        {emailSummary !== "" ? (
          <p role="alert" className={FIELD_ERROR}>
            {emailSummary}
          </p>
        ) : null}
        {emailState.ok ? (
          <p aria-live="polite" className={SUCCESS_MSG}>
            確認メールを送信しました。リンクをクリックすると変更が確定します。
          </p>
        ) : null}
      </form>

      <hr className={SECTION_DIVIDER} />

      <h2 className={SECTION_TITLE}>セッション</h2>
      <div className={ACTION_ROW}>
        <button
          id={revokeId}
          type="button"
          onClick={onRevokeAll}
          disabled={isPending}
          className={BTN_SECONDARY}
        >
          {isPending ? "処理中..." : "他のすべてのセッションをログアウト"}
        </button>
      </div>
      {revokedCount !== null ? (
        <p aria-live="polite" className={SUCCESS_MSG}>
          {revokedCount} 件のセッションを無効化しました
        </p>
      ) : null}
      {sessionsSummary !== "" ? (
        <p role="alert" className={FIELD_ERROR}>
          {sessionsSummary}
        </p>
      ) : null}
    </section>
  );
}
