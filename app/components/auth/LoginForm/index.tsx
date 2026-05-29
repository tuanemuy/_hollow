"use client";

import { Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AlertCircle, ChevronRight, Phone } from "lucide-react";
import { useActionState, useId, useState, useTransition } from "react";
import { Icon } from "@/components/common/Icon";
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
            <Icon icon={AlertCircle} size={20} className="shrink-0 mt-0.5" />
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
            <Icon icon={Phone} size={20} />
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
                <Icon icon={ChevronRight} size={16} />
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
