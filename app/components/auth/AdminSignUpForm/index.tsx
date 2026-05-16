"use client";

import { Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useActionState, useId, useState } from "react";
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
  SETUP_TOKEN_MAX_LENGTH,
  USERNAME_MAX_LENGTH,
} from "../schema";
import { adminSignUpFn } from "./action";

type FormState = { error: SerializedError | null; success: boolean };

const initialState: FormState = { error: null, success: false };

function fieldErrorOf(
  error: SerializedError | null,
  field: string,
): string | undefined {
  if (error?.kind !== "validation") return undefined;
  return error.fieldErrors?.[field]?.[0];
}

export function AdminSignUpForm() {
  const router = useRouter();
  const adminSignUp = useServerFn(adminSignUpFn);

  const usernameId = useId();
  const emailId = useId();
  const passwordId = useId();
  const displayNameId = useId();
  const setupTokenId = useId();
  const acceptTermsId = useId();

  const [showToken, setShowToken] = useState(false);

  const [state, formAction, isPending] = useActionState<FormState, FormData>(
    async (_prev, formData) => {
      const acceptTerms = formData.get("acceptTerms") === "on";
      try {
        await adminSignUp({
          data: {
            username: String(formData.get("username") ?? ""),
            email: String(formData.get("email") ?? ""),
            password: String(formData.get("password") ?? ""),
            displayName: String(formData.get("displayName") ?? ""),
            setupToken: String(formData.get("setupToken") ?? ""),
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
  const setupTokenValidationError = fieldErrorOf(state.error, "setupToken");

  const isSetupTokenError =
    state.error?.kind === "unauthorized" &&
    (state.error.code === "invalid_setup_token" ||
      state.error.code === "setup_token_disabled");

  const summary =
    state.error !== null &&
    state.error.kind !== "validation" &&
    !isSetupTokenError
      ? displayError(state.error)
      : null;

  if (state.success) {
    return (
      <div role="status">
        <h1 className="auth-title">管理者アカウントを作成しました</h1>
        <p className="auth-subtitle">
          確認メールを送信しました。受信したリンクをクリックしてアカウントを有効化してください。
        </p>
        <Link to="/login" className="btn-primary">
          ログインへ
        </Link>
      </div>
    );
  }

  return (
    <>
      <span className="admin-eyebrow">管理者セットアップ</span>
      <h1 className="auth-title">初期管理者を作成</h1>
      <p className="auth-subtitle">
        このインスタンスを管理する最初のアカウントを登録します。Setup Token
        は環境変数 <code>ADMIN_SETUP_TOKEN</code> に設定された値です。
      </p>

      <div className="callout">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <span>
          <strong>このページは特権操作です。</strong> Setup Token
          を知る運用者のみ作成できます。通常のサインアップは{" "}
          <Link to="/signup">こちら</Link>{" "}
          から。新規登録が停止中でもこのフォームは機能します。
        </span>
      </div>

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
            placeholder="admin"
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
            placeholder="admin@example.com"
            autoComplete="email"
            required
            disabled={isPending}
            aria-invalid={emailError !== undefined}
          />
          <span className="field-hint">
            {emailError ??
              "確認メールを送信します。受信できるアドレスを指定してください。"}
          </span>
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
            {passwordError ?? "英数字と記号を組み合わせてください。"}
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
            placeholder="運用チーム"
            autoComplete="nickname"
            maxLength={DISPLAY_NAME_MAX_LENGTH}
            disabled={isPending}
            aria-invalid={displayNameError !== undefined}
          />
          {displayNameError ? (
            <span className="field-hint">{displayNameError}</span>
          ) : null}
        </div>

        <div
          className={`field${isSetupTokenError || setupTokenValidationError ? " has-error" : ""}`}
        >
          <label className="field-label" htmlFor={setupTokenId}>
            Setup Token
          </label>
          <div className="input-with-action">
            <input
              className="input input-mono"
              id={setupTokenId}
              name="setupToken"
              type={showToken ? "text" : "password"}
              placeholder="env: ADMIN_SETUP_TOKEN"
              autoComplete="off"
              spellCheck={false}
              maxLength={SETUP_TOKEN_MAX_LENGTH}
              required
              disabled={isPending}
              aria-invalid={
                isSetupTokenError || setupTokenValidationError !== undefined
              }
            />
            <button
              type="button"
              className="reveal-btn"
              onClick={() => setShowToken((v) => !v)}
              aria-label={showToken ? "トークンを隠す" : "トークンを表示"}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </button>
          </div>
          <span className="field-hint">
            {setupTokenValidationError ?? (
              <>
                サーバー側の{" "}
                <code style={{ fontFamily: "var(--font-mono)" }}>
                  ADMIN_SETUP_TOKEN
                </code>{" "}
                と完全一致が必要です。
              </>
            )}
          </span>
        </div>

        {isSetupTokenError ? (
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
              <strong>
                {state.error?.code === "setup_token_disabled"
                  ? "Setup Token が設定されていません。"
                  : "Setup Token が正しくありません。"}
              </strong>{" "}
              値を確認してもう一度入力してください。
            </span>
          </div>
        ) : null}

        {summary !== null ? (
          <div className="form-error" role="alert">
            <span>
              <strong>登録に失敗しました。</strong> {summary}
            </span>
          </div>
        ) : null}

        <label className="checkbox-row" htmlFor={acceptTermsId}>
          <input
            id={acceptTermsId}
            type="checkbox"
            name="acceptTerms"
            required
            disabled={isPending}
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

        <button type="submit" className="btn-primary" disabled={isPending}>
          {isPending ? "送信中..." : "管理者アカウントを作成"}
        </button>
      </form>

      <div className="auth-footer">
        管理者ではないですか? <Link to="/signup">通常のサインアップへ</Link>
      </div>
    </>
  );
}
