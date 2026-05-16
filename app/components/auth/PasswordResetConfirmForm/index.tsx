"use client";

import { Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useActionState, useId, useMemo, useState } from "react";
import { displayError } from "@/core/presentation/errorDisplay";
import {
  extractSerializedError,
  type SerializedError,
} from "@/core/presentation/errorResponse";
import { HOME_SEARCH } from "../links";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "../schema";
import { resetPasswordFn } from "./action";

type FormState = { error: SerializedError | null };
const initialState: FormState = { error: null };

function fieldErrorOf(
  error: SerializedError | null,
  field: string,
): string | undefined {
  if (error?.kind !== "validation") return undefined;
  return error.fieldErrors?.[field]?.[0];
}

type StrengthLevel = 0 | 1 | 2 | 3 | 4;

function estimateStrength(password: string): StrengthLevel {
  if (password.length === 0) return 0;
  let score = 0;
  if (password.length >= PASSWORD_MIN_LENGTH) score += 1;
  if (password.length >= 12) score += 1;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
  if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) score += 1;
  if (score < 1) return 1;
  if (score > 4) return 4;
  return score as StrengthLevel;
}

const STRENGTH_LABEL: Record<StrengthLevel, string> = {
  0: "—",
  1: "弱い",
  2: "やや弱い",
  3: "強い",
  4: "とても強い",
};

export function PasswordResetConfirmForm({ token }: { token: string }) {
  const router = useRouter();
  const resetPassword = useServerFn(resetPasswordFn);

  const newPasswordId = useId();
  const confirmPasswordId = useId();

  const [password, setPassword] = useState("");
  const strength = useMemo(() => estimateStrength(password), [password]);

  const [state, formAction, isPending] = useActionState<FormState, FormData>(
    async (_prev, formData) => {
      try {
        await resetPassword({
          data: {
            token,
            newPassword: String(formData.get("newPassword") ?? ""),
            confirmPassword: String(formData.get("confirmPassword") ?? ""),
          },
        });
        await router.invalidate();
        await router.navigate({ to: "/", search: HOME_SEARCH });
        return { error: null };
      } catch (error) {
        return { error: extractSerializedError(error) };
      }
    },
    initialState,
  );

  const newPasswordError = fieldErrorOf(state.error, "newPassword");
  const confirmPasswordError = fieldErrorOf(state.error, "confirmPassword");
  const tokenError = fieldErrorOf(state.error, "token");

  const summary =
    state.error !== null && state.error.kind !== "validation"
      ? displayError(state.error)
      : tokenError;

  return (
    <>
      <h1 className="auth-title">新しいパスワードを設定</h1>
      <p className="auth-subtitle">
        強固なパスワードを設定してください。完了するとログイン状態になります。
      </p>

      <form className="form" action={formAction} noValidate>
        <div className={`field${newPasswordError ? " has-error" : ""}`}>
          <label className="field-label" htmlFor={newPasswordId}>
            新しいパスワード
          </label>
          <input
            className="input"
            id={newPasswordId}
            name="newPassword"
            type="password"
            placeholder={`${PASSWORD_MIN_LENGTH}文字以上`}
            autoComplete="new-password"
            minLength={PASSWORD_MIN_LENGTH}
            maxLength={PASSWORD_MAX_LENGTH}
            required
            disabled={isPending}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={newPasswordError !== undefined}
          />
          <div className="strength" data-level={strength} aria-live="polite">
            <div className="strength-track">
              <span className="strength-segment" />
              <span className="strength-segment" />
              <span className="strength-segment" />
              <span className="strength-segment" />
            </div>
            <div className="strength-label">
              <span>パスワードの強度</span>
              <strong>{STRENGTH_LABEL[strength]}</strong>
            </div>
          </div>
          {newPasswordError ? (
            <span className="field-hint">{newPasswordError}</span>
          ) : null}
        </div>

        <div className={`field${confirmPasswordError ? " has-error" : ""}`}>
          <label className="field-label" htmlFor={confirmPasswordId}>
            新しいパスワード(確認)
          </label>
          <input
            className="input"
            id={confirmPasswordId}
            name="confirmPassword"
            type="password"
            placeholder="もう一度入力"
            autoComplete="new-password"
            minLength={PASSWORD_MIN_LENGTH}
            maxLength={PASSWORD_MAX_LENGTH}
            required
            disabled={isPending}
            aria-invalid={confirmPasswordError !== undefined}
          />
          <span className="field-hint">
            {confirmPasswordError ??
              "2つのパスワードが一致しているか確認してください。"}
          </span>
        </div>

        {summary !== undefined && summary !== null ? (
          <div className="form-error" role="alert">
            <span>{summary}</span>
          </div>
        ) : null}

        <button type="submit" className="btn-primary" disabled={isPending}>
          {isPending ? "更新中..." : "パスワードを決定"}
        </button>
      </form>

      <div className="auth-footer">
        <Link to="/login">ログインに戻る</Link>
      </div>
    </>
  );
}
