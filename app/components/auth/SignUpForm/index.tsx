"use client";

import { Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AlertCircle } from "lucide-react";
import { useActionState, useId } from "react";
import { Icon } from "@/components/common/Icon";
import {
  ALERT,
  ALERT_BODY,
  ALERT_CONTENT,
  ALERT_ERROR,
  ALERT_ICON,
  ALERT_TITLE,
  textLink,
} from "@/components/common/styles";
import { displayError } from "@/core/presentation/errorDisplay";
import {
  extractSerializedError,
  type SerializedError,
} from "@/core/presentation/errorResponse";
import {
  DISPLAY_NAME_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  USERNAME_MAX_LENGTH,
} from "../schema";
import {
  AUTH_FOOTER,
  AUTH_FOOTER_LINK,
  AUTH_SUBTITLE,
  AUTH_TITLE,
  BTN_PRIMARY,
  CHECKBOX_INPUT,
  CHECKBOX_ROW,
  FIELD,
  FIELD_HINT,
  FIELD_HINT_ERROR,
  FIELD_LABEL,
  FIELD_OPTIONAL,
  FORM,
  INPUT,
} from "../styles";
import { signUpFn } from "./action";

type FormState = {
  error: SerializedError | null;
  success: boolean;
  values: {
    username: string;
    email: string;
    displayName: string;
    acceptTerms: boolean;
  };
};

const initialState: FormState = {
  error: null,
  success: false,
  values: { username: "", email: "", displayName: "", acceptTerms: false },
};

function fieldErrorOf(
  error: SerializedError | null,
  field: string,
): string | undefined {
  if (error?.kind !== "validation") return undefined;
  return error.fieldErrors?.[field]?.[0];
}

export function SignUpForm() {
  const router = useRouter();
  const signUp = useServerFn(signUpFn);

  const usernameId = useId();
  const emailId = useId();
  const passwordId = useId();
  const displayNameId = useId();
  const acceptTermsId = useId();
  const summaryId = useId();
  const usernameHintId = useId();
  const emailHintId = useId();
  const passwordHintId = useId();
  const displayNameHintId = useId();
  const acceptTermsHintId = useId();

  const [state, formAction, isPending] = useActionState<FormState, FormData>(
    async (_prev, formData) => {
      const username = String(formData.get("username") ?? "");
      const email = String(formData.get("email") ?? "");
      const displayName = String(formData.get("displayName") ?? "");
      const acceptTerms = formData.get("acceptTerms") === "on";
      // password は機微フィールドのため復元しない（ADR-001）。
      const values = { username, email, displayName, acceptTerms };
      try {
        await signUp({
          data: {
            username,
            email,
            password: String(formData.get("password") ?? ""),
            displayName,
            acceptTerms: acceptTerms as true,
          },
        });
        // cached _app match の userDto: null を破棄し、/ 遷移後に AppShell を再評価させるため（rule 1）
        await router.invalidate();
        return { error: null, success: true, values };
      } catch (error) {
        return {
          error: extractSerializedError(error),
          success: false,
          values,
        };
      }
    },
    initialState,
  );

  const usernameError = fieldErrorOf(state.error, "username");
  const emailError = fieldErrorOf(state.error, "email");
  const passwordError = fieldErrorOf(state.error, "password");
  const displayNameError = fieldErrorOf(state.error, "displayName");
  const acceptTermsError = fieldErrorOf(state.error, "acceptTerms");

  const summary =
    state.error !== null && state.error.kind !== "validation"
      ? displayError(state.error)
      : null;

  if (state.success) {
    return (
      <div role="status">
        <h1 className={AUTH_TITLE}>確認メールを送信しました</h1>
        <p className={AUTH_SUBTITLE}>
          ご登録のメールアドレス宛に確認リンクをお送りしました。
          受信したリンクをクリックして、アカウントを有効化してください。
        </p>
        <Link to="/login" className={BTN_PRIMARY} data-primary="">
          ログインへ
        </Link>
      </div>
    );
  }

  return (
    <>
      <h1 className={AUTH_TITLE}>アカウント作成</h1>
      <p className={AUTH_SUBTITLE}>
        頭の中にある言葉を、静かな場所に置いていきましょう。
      </p>

      <form className={FORM} action={formAction} noValidate>
        <div className={FIELD}>
          <label className={FIELD_LABEL} htmlFor={usernameId}>
            ユーザー名
          </label>
          <input
            className={INPUT}
            id={usernameId}
            name="username"
            type="text"
            placeholder="yumenaut"
            autoComplete="username"
            maxLength={USERNAME_MAX_LENGTH}
            required
            disabled={isPending}
            defaultValue={state.values.username}
            aria-invalid={usernameError !== undefined}
            aria-describedby={usernameHintId}
            data-error={usernameError ? "" : undefined}
          />
          <span
            id={usernameHintId}
            className={usernameError ? FIELD_HINT_ERROR : FIELD_HINT}
          >
            {usernameError ?? "英数字とハイフン。後から変更できません。"}
          </span>
        </div>

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
            defaultValue={state.values.email}
            aria-invalid={emailError !== undefined}
            aria-describedby={emailError ? emailHintId : undefined}
            data-error={emailError ? "" : undefined}
          />
          {emailError ? (
            <span id={emailHintId} className={FIELD_HINT_ERROR}>
              {emailError}
            </span>
          ) : null}
        </div>

        <div className={FIELD}>
          <label className={FIELD_LABEL} htmlFor={passwordId}>
            パスワード
          </label>
          <input
            className={INPUT}
            id={passwordId}
            name="password"
            type="password"
            placeholder={`${PASSWORD_MIN_LENGTH}文字以上`}
            autoComplete="new-password"
            minLength={PASSWORD_MIN_LENGTH}
            maxLength={PASSWORD_MAX_LENGTH}
            required
            disabled={isPending}
            aria-invalid={passwordError !== undefined}
            aria-describedby={passwordHintId}
            data-error={passwordError ? "" : undefined}
          />
          <span
            id={passwordHintId}
            className={passwordError ? FIELD_HINT_ERROR : FIELD_HINT}
          >
            {passwordError ??
              `${PASSWORD_MIN_LENGTH}文字以上。英数字と記号を組み合わせると安全です。`}
          </span>
        </div>

        <div className={FIELD}>
          <label className={FIELD_LABEL} htmlFor={displayNameId}>
            表示名 <span className={FIELD_OPTIONAL}>(任意)</span>
          </label>
          <input
            className={INPUT}
            id={displayNameId}
            name="displayName"
            type="text"
            placeholder="ユメナウト"
            autoComplete="nickname"
            maxLength={DISPLAY_NAME_MAX_LENGTH}
            disabled={isPending}
            defaultValue={state.values.displayName}
            aria-invalid={displayNameError !== undefined}
            aria-describedby={displayNameError ? displayNameHintId : undefined}
            data-error={displayNameError ? "" : undefined}
          />
          {displayNameError ? (
            <span id={displayNameHintId} className={FIELD_HINT_ERROR}>
              {displayNameError}
            </span>
          ) : null}
        </div>

        <label className={CHECKBOX_ROW} htmlFor={acceptTermsId}>
          <input
            id={acceptTermsId}
            type="checkbox"
            name="acceptTerms"
            required
            disabled={isPending}
            defaultChecked={state.values.acceptTerms}
            aria-invalid={acceptTermsError !== undefined}
            aria-describedby={acceptTermsError ? acceptTermsHintId : undefined}
            className={CHECKBOX_INPUT}
          />
          <span>
            <Link to="/terms" className={textLink}>
              利用規約
            </Link>{" "}
            と{" "}
            <Link to="/privacy" className={textLink}>
              プライバシーポリシー
            </Link>{" "}
            に同意します
          </span>
        </label>
        {acceptTermsError ? (
          <span id={acceptTermsHintId} className={FIELD_HINT_ERROR}>
            {acceptTermsError}
          </span>
        ) : null}

        {summary !== null ? (
          <div
            className={`${ALERT} ${ALERT_ERROR}`}
            role="alert"
            id={summaryId}
          >
            <span className={ALERT_ICON} aria-hidden="true">
              <Icon icon={AlertCircle} size={20} />
            </span>
            <div className={ALERT_CONTENT}>
              <p className={ALERT_TITLE}>登録に失敗しました。</p>
              <p className={ALERT_BODY}>{summary}</p>
            </div>
          </div>
        ) : null}

        <button
          type="submit"
          className={BTN_PRIMARY}
          data-primary=""
          disabled={isPending}
        >
          {isPending ? "送信中..." : "アカウントを作成"}
        </button>
      </form>

      <div className={AUTH_FOOTER}>
        すでにアカウントをお持ちですか?{" "}
        <Link to="/login" className={AUTH_FOOTER_LINK}>
          ログイン
        </Link>
      </div>
    </>
  );
}
