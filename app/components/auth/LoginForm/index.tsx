"use client";

import { Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useActionState, useId, useState, useTransition } from "react";
import { displayError } from "@/core/presentation/errorDisplay";
import {
  extractSerializedError,
  type SerializedError,
} from "@/core/presentation/errorResponse";
import { HOME_SEARCH } from "../links";
import { PASSWORD_MAX_LENGTH } from "../schema";
import {
  AUTH_FOOTER,
  AUTH_FOOTER_LINK,
  AUTH_SUBTITLE,
  AUTH_TITLE,
  BTN_PRIMARY,
  CALLOUT,
  CALLOUT_ACTION,
  CALLOUT_BODY,
  CALLOUT_ICON,
  CHECKBOX_INPUT,
  CHECKBOX_ROW,
  FIELD,
  FIELD_HINT_ERROR,
  FIELD_LABEL,
  FIELD_LABEL_ROW,
  FIELD_LINK,
  FORM,
  FORM_ERROR,
  INPUT,
} from "../styles";
import { loginFn, resendVerificationFn } from "./action";

type FormState = {
  error: SerializedError | null;
  email: string;
};

const initialState: FormState = { error: null, email: "" };

function fieldErrorOf(
  error: SerializedError | null,
  field: string,
): string | undefined {
  if (error?.kind !== "validation") return undefined;
  return error.fieldErrors?.[field]?.[0];
}

export function LoginForm() {
  const router = useRouter();
  const login = useServerFn(loginFn);
  const resend = useServerFn(resendVerificationFn);

  const emailId = useId();
  const passwordId = useId();
  const rememberId = useId();

  const [resendState, setResendState] = useState<"idle" | "pending" | "sent">(
    "idle",
  );
  const [, startResendTransition] = useTransition();

  const [state, formAction, isPending] = useActionState<FormState, FormData>(
    async (_prev, formData) => {
      const email = String(formData.get("email") ?? "");
      try {
        await login({
          data: {
            email,
            password: String(formData.get("password") ?? ""),
          },
        });
        // cached _app match の userDto: null を破棄し、/ 遷移後に AppShell を再評価させるため（rule 1）
        await router.invalidate();
        await router.navigate({ to: "/", search: HOME_SEARCH });
        return { error: null, email };
      } catch (error) {
        setResendState("idle");
        return { error: extractSerializedError(error), email };
      }
    },
    initialState,
  );

  const emailError = fieldErrorOf(state.error, "email");
  const passwordError = fieldErrorOf(state.error, "password");

  const isUnverified =
    state.error?.kind === "unauthorized" && state.error.code === "unverified";

  const summary =
    state.error !== null && state.error.kind !== "validation" && !isUnverified
      ? displayError(state.error)
      : null;

  const onResend = () => {
    if (state.email.length === 0) return;
    setResendState("pending");
    startResendTransition(async () => {
      try {
        await resend({ data: { email: state.email } });
        setResendState("sent");
      } catch {
        setResendState("idle");
      }
    });
  };

  return (
    <>
      <h1 className={AUTH_TITLE}>ログイン</h1>
      <p className={AUTH_SUBTITLE}>おかえりなさい。続きから始めましょう。</p>

      <form className={FORM} action={formAction} noValidate>
        <div className={FIELD}>
          <label className={FIELD_LABEL} htmlFor={emailId}>
            メールアドレス
          </label>
          <input
            className={INPUT}
            id={emailId}
            name="email"
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            required
            disabled={isPending}
            defaultValue={state.email}
            aria-invalid={emailError !== undefined}
            data-error={emailError ? "" : undefined}
          />
          {emailError ? (
            <span className={FIELD_HINT_ERROR}>{emailError}</span>
          ) : null}
        </div>

        <div className={FIELD}>
          <div className={FIELD_LABEL_ROW}>
            <label className={FIELD_LABEL} htmlFor={passwordId}>
              パスワード
            </label>
            <Link to="/password-reset" className={FIELD_LINK}>
              パスワードを忘れた方
            </Link>
          </div>
          <input
            className={INPUT}
            id={passwordId}
            name="password"
            type="password"
            placeholder="パスワード"
            autoComplete="current-password"
            maxLength={PASSWORD_MAX_LENGTH}
            required
            disabled={isPending}
            aria-invalid={passwordError !== undefined}
            data-error={passwordError ? "" : undefined}
          />
          {passwordError ? (
            <span className={FIELD_HINT_ERROR}>{passwordError}</span>
          ) : null}
        </div>

        <label className={CHECKBOX_ROW} htmlFor={rememberId}>
          <input
            id={rememberId}
            type="checkbox"
            name="remember"
            disabled={isPending}
            className={CHECKBOX_INPUT}
          />
          <span>ログイン情報を保存する</span>
        </label>

        {summary !== null ? (
          <div className={FORM_ERROR} role="alert">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className="shrink-0 mt-0.5"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>
              <strong className="font-semibold">
                ログインできませんでした。
              </strong>{" "}
              {summary}
            </span>
          </div>
        ) : null}

        <button type="submit" className={BTN_PRIMARY} disabled={isPending}>
          {isPending ? "ログイン中..." : "ログイン"}
        </button>
      </form>

      {isUnverified ? (
        <div className={`${CALLOUT} mt-6`} role="status">
          <span className={CALLOUT_ICON} aria-hidden="true">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
          </span>
          <div className={CALLOUT_BODY}>
            <strong className="text-ink font-semibold">
              メールアドレスの確認が未完了です
            </strong>
            <span>
              受信した確認メールのリンクをクリックすると、すべての機能を利用できます。
            </span>
            {resendState === "sent" ? (
              <span className="text-success">
                確認メールを送信しました。受信箱をご確認ください。
              </span>
            ) : (
              <button
                type="button"
                className={CALLOUT_ACTION}
                onClick={onResend}
                disabled={resendState === "pending"}
              >
                {resendState === "pending" ? "送信中..." : "確認メールを再送"}
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            )}
          </div>
        </div>
      ) : null}

      <div className={AUTH_FOOTER}>
        アカウントをお持ちでない方は{" "}
        <Link to="/signup" className={AUTH_FOOTER_LINK}>
          アカウントを作成
        </Link>
      </div>
    </>
  );
}
