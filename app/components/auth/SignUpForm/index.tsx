"use client";

import { Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useActionState, useId } from "react";
import { displayError } from "@/core/presentation/errorDisplay";
import {
  extractSerializedError,
  type SerializedError,
} from "@/core/presentation/errorResponse";
import { HOME_SEARCH } from "../links";
import {
  DISPLAY_NAME_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  USERNAME_MAX_LENGTH,
} from "../schema";
import { signUpFn } from "./action";

type FormState = { error: SerializedError | null; success: boolean };

const initialState: FormState = { error: null, success: false };

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

  const [state, formAction, isPending] = useActionState<FormState, FormData>(
    async (_prev, formData) => {
      const acceptTerms = formData.get("acceptTerms") === "on";
      try {
        await signUp({
          data: {
            username: String(formData.get("username") ?? ""),
            email: String(formData.get("email") ?? ""),
            password: String(formData.get("password") ?? ""),
            displayName: String(formData.get("displayName") ?? ""),
            acceptTerms: acceptTerms as true,
          },
        });
        await router.invalidate();
        return { error: null, success: true };
      } catch (error) {
        return {
          error: extractSerializedError(error),
          success: false,
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
        <h1 className="auth-title">確認メールを送信しました</h1>
        <p className="auth-subtitle">
          ご登録のメールアドレス宛に確認リンクをお送りしました。
          受信したリンクをクリックして、アカウントを有効化してください。
        </p>
        <Link to="/login" className="btn-primary">
          ログインへ
        </Link>
      </div>
    );
  }

  return (
    <>
      <h1 className="auth-title">アカウント作成</h1>
      <p className="auth-subtitle">
        頭の中にある言葉を、静かな場所に置いていきましょう。
      </p>

      <form className="form" action={formAction} noValidate>
        <div className={`field${usernameError ? " has-error" : ""}`}>
          <label className="field-label" htmlFor={usernameId}>
            ユーザー名
          </label>
          <input
            className="input"
            id={usernameId}
            name="username"
            type="text"
            placeholder="yumenaut"
            autoComplete="username"
            maxLength={USERNAME_MAX_LENGTH}
            required
            disabled={isPending}
            aria-invalid={usernameError !== undefined}
          />
          <span className="field-hint">
            {usernameError ?? "英数字とハイフン。後から変更できません。"}
          </span>
        </div>

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
            aria-invalid={emailError !== undefined}
          />
          {emailError ? <span className="field-hint">{emailError}</span> : null}
        </div>

        <div className={`field${passwordError ? " has-error" : ""}`}>
          <label className="field-label" htmlFor={passwordId}>
            パスワード
          </label>
          <input
            className="input"
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
          />
          <span className="field-hint">
            {passwordError ??
              `${PASSWORD_MIN_LENGTH}文字以上。英数字と記号を組み合わせると安全です。`}
          </span>
        </div>

        <div className={`field${displayNameError ? " has-error" : ""}`}>
          <label className="field-label" htmlFor={displayNameId}>
            表示名 <span className="optional">(任意)</span>
          </label>
          <input
            className="input"
            id={displayNameId}
            name="displayName"
            type="text"
            placeholder="ユメナウト"
            autoComplete="nickname"
            maxLength={DISPLAY_NAME_MAX_LENGTH}
            disabled={isPending}
            aria-invalid={displayNameError !== undefined}
          />
          {displayNameError ? (
            <span className="field-hint">{displayNameError}</span>
          ) : null}
        </div>

        <label className="checkbox-row" htmlFor={acceptTermsId}>
          <input
            id={acceptTermsId}
            type="checkbox"
            name="acceptTerms"
            required
            disabled={isPending}
            aria-invalid={acceptTermsError !== undefined}
          />
          <span>
            <Link to="/" search={HOME_SEARCH}>
              利用規約
            </Link>{" "}
            と{" "}
            <Link to="/" search={HOME_SEARCH}>
              プライバシーポリシー
            </Link>{" "}
            に同意します
          </span>
        </label>
        {acceptTermsError ? (
          <span className="field-hint" style={{ color: "var(--color-error)" }}>
            {acceptTermsError}
          </span>
        ) : null}

        {summary !== null ? (
          <div className="form-error" role="alert" id={summaryId}>
            <span>
              <strong>登録に失敗しました。</strong> {summary}
            </span>
          </div>
        ) : null}

        <button type="submit" className="btn-primary" disabled={isPending}>
          {isPending ? "送信中..." : "アカウントを作成"}
        </button>
      </form>

      <div className="auth-footer">
        すでにアカウントをお持ちですか? <Link to="/login">ログイン</Link>
      </div>
    </>
  );
}
