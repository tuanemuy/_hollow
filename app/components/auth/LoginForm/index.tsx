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
      <h1 className="auth-title">ログイン</h1>
      <p className="auth-subtitle">おかえりなさい。続きから始めましょう。</p>

      <form className="form" action={formAction} noValidate>
        <div className={`field${emailError ? " has-error" : ""}`}>
          <label className="field-label" htmlFor={emailId}>
            メールアドレス
          </label>
          <input
            className="input"
            id={emailId}
            name="email"
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            required
            disabled={isPending}
            defaultValue={state.email}
            aria-invalid={emailError !== undefined}
          />
          {emailError ? <span className="field-hint">{emailError}</span> : null}
        </div>

        <div className={`field${passwordError ? " has-error" : ""}`}>
          <div className="field-label-row">
            <label className="field-label" htmlFor={passwordId}>
              パスワード
            </label>
            <Link to="/password-reset" className="field-link">
              パスワードを忘れた方
            </Link>
          </div>
          <input
            className="input"
            id={passwordId}
            name="password"
            type="password"
            placeholder="パスワード"
            autoComplete="current-password"
            maxLength={PASSWORD_MAX_LENGTH}
            required
            disabled={isPending}
            aria-invalid={passwordError !== undefined}
          />
          {passwordError ? (
            <span className="field-hint">{passwordError}</span>
          ) : null}
        </div>

        <label className="checkbox-row" htmlFor={rememberId}>
          <input
            id={rememberId}
            type="checkbox"
            name="remember"
            disabled={isPending}
          />
          <span>ログイン情報を保存する</span>
        </label>

        {summary !== null ? (
          <div className="form-error" role="alert">
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
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>
              <strong>ログインできませんでした。</strong> {summary}
            </span>
          </div>
        ) : null}

        <button type="submit" className="btn-primary" disabled={isPending}>
          {isPending ? "ログイン中..." : "ログイン"}
        </button>
      </form>

      {isUnverified ? (
        <div
          className="callout"
          role="status"
          style={{ marginTop: "var(--space-6)" }}
        >
          <span className="callout-icon" aria-hidden="true">
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
          <div className="callout-body">
            <strong>メールアドレスの確認が未完了です</strong>
            <span>
              受信した確認メールのリンクをクリックすると、すべての機能を利用できます。
            </span>
            {resendState === "sent" ? (
              <span style={{ color: "var(--color-success)" }}>
                確認メールを送信しました。受信箱をご確認ください。
              </span>
            ) : (
              <button
                type="button"
                className="callout-action"
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

      <div className="auth-footer">
        アカウントをお持ちでない方は <Link to="/signup">アカウントを作成</Link>
      </div>
    </>
  );
}
