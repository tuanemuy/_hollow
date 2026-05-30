"use client";

import { Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AlertCircle, Eye, EyeOff, Info } from "lucide-react";
import { useActionState, useId, useState } from "react";
import { Icon } from "@/components/common/Icon";
import { displayError } from "@/core/presentation/errorDisplay";
import {
  extractSerializedError,
  type SerializedError,
} from "@/core/presentation/errorResponse";
import {
  DISPLAY_NAME_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  SETUP_TOKEN_MAX_LENGTH,
  USERNAME_MAX_LENGTH,
} from "../schema";
import {
  ADMIN_EYEBROW,
  AUTH_FOOTER,
  AUTH_FOOTER_LINK,
  AUTH_SUBTITLE,
  AUTH_TITLE,
  BTN_PRIMARY,
  CALLOUT,
  CHECKBOX_INPUT,
  CHECKBOX_ROW,
  FIELD,
  FIELD_HINT,
  FIELD_HINT_ERROR,
  FIELD_LABEL,
  FIELD_OPTIONAL,
  FORM,
  FORM_ERROR,
  INPUT,
  INPUT_MONO,
  INPUT_WITH_ACTION,
  REVEAL_BTN,
} from "../styles";
import { adminSignUpFn } from "./action";

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

export function AdminSignUpForm() {
  const router = useRouter();
  const adminSignUp = useServerFn(adminSignUpFn);

  const usernameId = useId();
  const emailId = useId();
  const passwordId = useId();
  const displayNameId = useId();
  const setupTokenId = useId();
  const acceptTermsId = useId();
  const usernameHintId = useId();
  const emailHintId = useId();
  const passwordHintId = useId();
  const displayNameHintId = useId();
  const setupTokenHintId = useId();
  const acceptTermsHintId = useId();

  const [showToken, setShowToken] = useState(false);

  const [state, formAction, isPending] = useActionState<FormState, FormData>(
    async (_prev, formData) => {
      const username = String(formData.get("username") ?? "");
      const email = String(formData.get("email") ?? "");
      const displayName = String(formData.get("displayName") ?? "");
      const acceptTerms = formData.get("acceptTerms") === "on";
      // password / setupToken は機微フィールドのため復元しない（ADR-001）。
      const values = { username, email, displayName, acceptTerms };
      try {
        await adminSignUp({
          data: {
            username,
            email,
            password: String(formData.get("password") ?? ""),
            displayName,
            setupToken: String(formData.get("setupToken") ?? ""),
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
  const setupTokenValidationError = fieldErrorOf(state.error, "setupToken");
  const acceptTermsError = fieldErrorOf(state.error, "acceptTerms");

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
        <h1 className={AUTH_TITLE}>管理者アカウントを作成しました</h1>
        <p className={AUTH_SUBTITLE}>
          確認メールを送信しました。受信したリンクをクリックしてアカウントを有効化してください。
        </p>
        <Link to="/login" className={BTN_PRIMARY}>
          ログインへ
        </Link>
      </div>
    );
  }

  return (
    <>
      <span className={ADMIN_EYEBROW}>管理者セットアップ</span>
      <h1 className={AUTH_TITLE}>初期管理者を作成</h1>
      <p className={AUTH_SUBTITLE}>
        このインスタンスを管理する最初のアカウントを登録します。Setup Token
        は環境変数 <code>ADMIN_SETUP_TOKEN</code> に設定された値です。
      </p>

      <div className={CALLOUT}>
        <Icon
          icon={Info}
          size={20}
          className="shrink-0 text-ink-tertiary mt-0.5"
        />
        <span>
          <strong className="text-ink font-semibold">
            このページは特権操作です。
          </strong>{" "}
          Setup Token を知る運用者のみ作成できます。通常のサインアップは{" "}
          <Link
            to="/signup"
            className="text-accent underline [text-underline-offset:3px]"
          >
            こちら
          </Link>{" "}
          から。新規登録が停止中でもこのフォームは機能します。
        </span>
      </div>

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
            placeholder="admin"
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
            placeholder="admin@example.com"
            autoComplete="email"
            required
            disabled={isPending}
            defaultValue={state.values.email}
            aria-invalid={emailError !== undefined}
            aria-describedby={emailHintId}
            data-error={emailError ? "" : undefined}
          />
          <span
            id={emailHintId}
            className={emailError ? FIELD_HINT_ERROR : FIELD_HINT}
          >
            {emailError ??
              "確認メールを送信します。受信できるアドレスを指定してください。"}
          </span>
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
            {passwordError ?? "英数字と記号を組み合わせてください。"}
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
            placeholder="運用チーム"
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

        <div className={FIELD}>
          <label className={FIELD_LABEL} htmlFor={setupTokenId}>
            Setup Token
          </label>
          <div className={INPUT_WITH_ACTION}>
            <input
              className={`${INPUT} ${INPUT_MONO} pr-11`}
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
              aria-describedby={setupTokenHintId}
              data-error={
                isSetupTokenError || setupTokenValidationError ? "" : undefined
              }
            />
            <button
              type="button"
              className={REVEAL_BTN}
              onClick={() => setShowToken((v) => !v)}
              aria-label={showToken ? "トークンを隠す" : "トークンを表示"}
              title={showToken ? "トークンを隠す" : "トークンを表示"}
            >
              <Icon icon={showToken ? EyeOff : Eye} size={20} />
            </button>
          </div>
          <span
            id={setupTokenHintId}
            className={
              setupTokenValidationError ? FIELD_HINT_ERROR : FIELD_HINT
            }
          >
            {setupTokenValidationError ?? (
              <>
                サーバー側の{" "}
                <code className="font-mono">ADMIN_SETUP_TOKEN</code>{" "}
                と完全一致が必要です。
              </>
            )}
          </span>
        </div>

        {isSetupTokenError ? (
          <div className={FORM_ERROR} role="alert">
            <Icon icon={AlertCircle} size={20} className="shrink-0 mt-0.5" />
            <span>
              <strong className="font-semibold">
                {state.error?.code === "setup_token_disabled"
                  ? "Setup Token が設定されていません。"
                  : "Setup Token が正しくありません。"}
              </strong>{" "}
              値を確認してもう一度入力してください。
            </span>
          </div>
        ) : null}

        {summary !== null ? (
          <div className={FORM_ERROR} role="alert">
            <span>
              <strong className="font-semibold">登録に失敗しました。</strong>{" "}
              {summary}
            </span>
          </div>
        ) : null}

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
            <Link
              to="/terms"
              className="text-accent hover:underline hover:[text-underline-offset:3px]"
            >
              利用規約
            </Link>{" "}
            と{" "}
            <Link
              to="/privacy"
              className="text-accent hover:underline hover:[text-underline-offset:3px]"
            >
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

        <button type="submit" className={BTN_PRIMARY} disabled={isPending}>
          {isPending ? "送信中..." : "管理者アカウントを作成"}
        </button>
      </form>

      <div className={AUTH_FOOTER}>
        管理者ではないですか?{" "}
        <Link to="/signup" className={AUTH_FOOTER_LINK}>
          通常のサインアップへ
        </Link>
      </div>
    </>
  );
}
