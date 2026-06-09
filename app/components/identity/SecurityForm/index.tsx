"use client";

import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useActionState, useId, useState, useTransition } from "react";
import { routerInvalidate } from "@/components/common/routerInvalidate";
import type { SessionDTO, UserDTO } from "@/core/application/dto/identity";
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
  BTN_SM_DANGER,
  CHECKBOX_ROW,
  CURRENT_VALUE,
  CURRENT_VALUE_STRONG,
  FIELD,
  FIELD_ERROR,
  FIELD_HINT,
  FIELD_INPUT,
  FIELD_LABEL,
  FORM,
  SECTION,
  SECTION_DESC,
  SECTION_DIVIDER,
  SECTION_TITLE,
  SESSION_ACTION,
  SESSION_CURRENT,
  SESSION_ICON,
  SESSION_LIST,
  SESSION_MAIN,
  SESSION_META,
  SESSION_ROW,
  SESSION_TITLE,
  SUCCESS_MSG,
} from "../styles";
import {
  changePasswordFn,
  requestEmailChangeFn,
  revokeAllOtherSessionsFn,
  revokeSessionFn,
} from "./action";

type FormState = { error: SerializedError | null; ok: boolean };
const initial: FormState = { error: null, ok: false };

/**
 * Device icon for a session row. The mock picks a phone vs. laptop glyph
 * from a parsed device name; we have no device parser (ADR-002), so a
 * single generic display glyph is used for every row.
 */
function SessionIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
}

function formatLoginTime(instant: string): string {
  return new Date(instant).toLocaleString("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/**
 * The user-facing title for a session. We have no device parser, so the
 * raw `userAgent` is shown verbatim; an empty / null UA falls back to a
 * neutral label rather than a fabricated device name (ADR-002).
 */
function sessionTitle(session: SessionDTO): string {
  const ua = session.userAgent?.trim();
  return ua !== undefined && ua !== "" ? ua : "不明な端末";
}

function SessionRow({
  session,
  onRevoked,
}: {
  session: SessionDTO;
  onRevoked: () => void;
}) {
  const router = useRouter();
  const revoke = useServerFn(revokeSessionFn);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<SerializedError | null>(null);

  const onRevoke = () => {
    startTransition(async () => {
      try {
        await revoke({ data: { sessionId: session.id } });
        setError(null);
        // Announce before invalidation: the row unmounts on re-fetch, so the
        // notice has to live on the parent to reach a screen reader.
        onRevoked();
        await routerInvalidate(router);
      } catch (e) {
        setError(extractSerializedError(e));
      }
    });
  };

  const metaParts = [session.ipAddress].filter(
    (part): part is string => part !== null && part !== "",
  );

  return (
    <div className={SESSION_ROW} data-revoking={isPending || undefined}>
      <span className={SESSION_ICON}>
        <SessionIcon />
      </span>
      <div className={SESSION_MAIN}>
        <div className={SESSION_TITLE}>
          <span className="[overflow-wrap:anywhere]">
            {sessionTitle(session)}
          </span>
          {session.isCurrent ? (
            <span className={SESSION_CURRENT}>このセッション</span>
          ) : null}
        </div>
        {metaParts.length > 0 ? (
          <div className={SESSION_META}>{metaParts.join(" · ")}</div>
        ) : null}
        <div className={SESSION_META}>
          ログイン日時: {formatLoginTime(session.createdAt)}
        </div>
        {error !== null ? (
          <p role="alert" className={FIELD_ERROR}>
            {displayError(error)}
          </p>
        ) : null}
      </div>
      {session.isCurrent ? null : (
        <button
          type="button"
          onClick={onRevoke}
          disabled={isPending}
          className={`${BTN_SM_DANGER} ${SESSION_ACTION}`}
          data-ghost-danger=""
          data-sm=""
        >
          {isPending ? "処理中..." : "ログアウト"}
        </button>
      )}
    </div>
  );
}

export function SecurityForm({
  user,
  sessions,
}: {
  user: UserDTO;
  sessions: readonly SessionDTO[];
}) {
  const router = useRouter();
  const changePassword = useServerFn(changePasswordFn);
  const requestEmailChange = useServerFn(requestEmailChangeFn);
  const revokeAll = useServerFn(revokeAllOtherSessionsFn);

  const cpwId = useId();
  const npwId = useId();
  const npwHintId = useId();
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
  const [rowRevoked, setRowRevoked] = useState(false);

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
      <p className={SECTION_DESC}>
        現在のパスワードで本人確認を行います。「他の端末からはログアウトする」を
        選ぶと、変更後にこの端末以外のセッションが無効になります。
      </p>
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
            aria-describedby={npwHintId}
            className={FIELD_INPUT}
          />
          <p id={npwHintId} className={FIELD_HINT}>
            12文字以上。英字・数字・記号のうち2種以上を含めてください。
          </p>
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
          <button
            type="submit"
            disabled={pwPending}
            className={BTN_PRIMARY}
            data-primary=""
          >
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
      <p className={SECTION_DESC}>
        新しいアドレスに確認メールを送信します。リンクをクリックして完了する
        まで、現在のアドレスは有効です。
      </p>
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
          <button
            type="submit"
            disabled={emailPending}
            className={BTN_PRIMARY}
            data-primary=""
          >
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
      <p aria-live="polite" className="sr-only">
        {rowRevoked ? "セッションをログアウトしました" : ""}
      </p>
      {sessions.length > 0 ? (
        <div className={SESSION_LIST}>
          {sessions.map((session) => (
            <SessionRow
              key={session.id}
              session={session}
              onRevoked={() => setRowRevoked(true)}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
