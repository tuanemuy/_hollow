"use client";

import { Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle } from "lucide-react";
import { useActionState, useId } from "react";
import { HOME_SEARCH } from "@/components/auth/links";
import { Icon } from "@/components/common/Icon";
import {
  ALERT,
  ALERT_BODY,
  ALERT_CONTENT,
  ALERT_ICON,
  ALERT_WARNING,
} from "@/components/common/styles";
import {
  extractSerializedError,
  type SerializedError,
} from "@/core/presentation/errorResponse";
import {
  GATE_CARD,
  GATE_FORM,
  GATE_ICON,
  GATE_INPUT,
  GATE_LABEL,
  GATE_SUB,
  GATE_SUBMIT,
  GATE_TITLE,
  SHARE_PAGE,
} from "../styles";
import { resolveShareLinkFn } from "./action";

type FormState = {
  error: SerializedError | null;
  unlocked: { noteId: string; ownerUsername: string } | null;
};

const initialState: FormState = { error: null, unlocked: null };

type Props = {
  token: string;
};

export function ShareLinkGate({ token }: Props) {
  const router = useRouter();
  const resolve = useServerFn(resolveShareLinkFn);

  const [state, formAction, isPending] = useActionState<FormState, FormData>(
    async (_prev, formData) => {
      const password = String(formData.get("password") ?? "");
      try {
        const result = await resolve({
          data: { token, password: password.length > 0 ? password : null },
        });
        await router.navigate({
          to: "/notes/public/$noteId",
          params: { noteId: result.noteId },
        });
        return {
          error: null,
          unlocked: {
            noteId: result.noteId,
            ownerUsername: result.ownerUsername,
          },
        };
      } catch (e) {
        return {
          error: extractSerializedError(e),
          unlocked: null,
        };
      }
    },
    initialState,
  );

  return (
    <ShareLinkGateView
      state={state}
      formAction={formAction}
      isPending={isPending}
    />
  );
}

type ViewProps = {
  state: FormState;
  formAction: (formData: FormData) => void;
  isPending: boolean;
};

/**
 * Pure presentational gate body. Split from the stateful container so the
 * error-driven branching (expired/gone CTA, lockout alert, inline error) is
 * testable by passing a `state` directly, without driving React 19's
 * `useActionState` form-submit machinery (not reliably simulatable under
 * happy-dom). See `.issue/544/adr.md` ADR-008.
 */
export function ShareLinkGateView({ state, formAction, isPending }: ViewProps) {
  const passwordId = useId();
  const errorId = useId();

  const message = state.error !== null ? gateErrorMessage(state.error) : null;
  const isLocked =
    state.error?.kind === "business" &&
    state.error.code === "share_link_locked";
  const isRevoked =
    state.error?.kind === "business" &&
    state.error.code === "share_link_revoked";
  const isMissing = state.error?.kind === "notFound";
  const isExpiredOrGone = isRevoked || isMissing;

  return (
    <div className={SHARE_PAGE}>
      <div className={GATE_CARD}>
        <div
          className={GATE_ICON}
          data-expired={isExpiredOrGone ? "" : undefined}
        >
          <LockIcon />
        </div>
        <h1 className={GATE_TITLE}>
          {isExpiredOrGone
            ? "リンクは無効です"
            : "このノートはパスワードで保護されています"}
        </h1>
        <p className={GATE_SUB}>
          {isExpiredOrGone
            ? "リンクが失効しているか、削除された可能性があります。"
            : "共有元から教えられたパスワードを入力してください。"}
        </p>

        {isLocked ? (
          <div className={`${ALERT} ${ALERT_WARNING} mb-4.5`} role="status">
            <span className={ALERT_ICON}>
              <Icon icon={AlertTriangle} size={20} />
            </span>
            <div className={ALERT_CONTENT}>
              <p className={ALERT_BODY}>{message}</p>
            </div>
          </div>
        ) : null}

        {isExpiredOrGone ? (
          <Link
            to="/"
            search={HOME_SEARCH}
            className={GATE_SUBMIT}
            data-primary=""
          >
            トップへ戻る
          </Link>
        ) : null}

        {!isExpiredOrGone ? (
          <form action={formAction} className={GATE_FORM}>
            <label className={GATE_LABEL} htmlFor={passwordId}>
              パスワード
            </label>
            <input
              id={passwordId}
              className={GATE_INPUT}
              data-error={state.error !== null && !isLocked ? "" : undefined}
              type="password"
              name="password"
              autoComplete="current-password"
              maxLength={128}
              disabled={isPending || isLocked}
              aria-invalid={state.error !== null}
              aria-describedby={message !== null ? errorId : undefined}
            />
            {message !== null && !isLocked ? (
              <p
                id={errorId}
                className="text-sm text-error -mt-1 flex items-center gap-1.5"
                role="alert"
              >
                {message}
              </p>
            ) : null}
            <button
              type="submit"
              className={GATE_SUBMIT}
              data-primary=""
              disabled={isPending || isLocked}
            >
              {isPending ? "確認中..." : "閲覧する"}
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}

function gateErrorMessage(error: SerializedError): string {
  if (error.kind === "business") {
    switch (error.code) {
      case "share_link_password_invalid":
        return "パスワードが正しくありません。";
      case "share_link_locked":
        return "試行回数の上限に達しました。しばらく時間をおいて再度お試しください。";
      case "share_link_revoked":
        return "このリンクは失効しています。";
      default:
        return error.message;
    }
  }
  if (error.kind === "notFound") {
    return "リンクが見つかりません。";
  }
  if (error.kind === "validation") {
    return "入力内容を確認してください。";
  }
  return "エラーが発生しました。";
}

function LockIcon() {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}
