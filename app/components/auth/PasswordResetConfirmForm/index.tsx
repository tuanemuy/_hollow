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
import {
  AUTH_FOOTER,
  AUTH_FOOTER_LINK,
  AUTH_SUBTITLE,
  AUTH_TITLE,
  BTN_PRIMARY,
  FIELD,
  FIELD_HINT,
  FIELD_HINT_ERROR,
  FIELD_LABEL,
  FORM,
  FORM_ERROR,
  INPUT,
} from "../styles";
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

function segmentColor(level: StrengthLevel, index: number): string {
  if (index >= level) return "bg-surface";
  if (level === 1) return "bg-error";
  if (level === 2) return "bg-warning";
  if (level === 3) return "bg-accent";
  return "bg-success";
}

function labelColor(level: StrengthLevel): string {
  if (level === 3) return "text-accent-ink";
  if (level === 4) return "text-success";
  return "text-ink-secondary";
}

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
        // 認証状態確立後の AppShell 再評価のため _app も invalidate（rule 1）
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
      <h1 className={AUTH_TITLE}>新しいパスワードを設定</h1>
      <p className={AUTH_SUBTITLE}>
        強固なパスワードを設定してください。完了するとログイン状態になります。
      </p>

      <form className={FORM} action={formAction} noValidate>
        <div className={FIELD}>
          <label className={FIELD_LABEL} htmlFor={newPasswordId}>
            新しいパスワード
          </label>
          <input
            className={INPUT}
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
            data-error={newPasswordError ? "" : undefined}
          />
          <div className="flex flex-col gap-2 mt-1" aria-live="polite">
            <div className="grid grid-cols-4 gap-1 h-1">
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  className={`rounded-pill transition-colors motion-reduce:transition-none ${segmentColor(strength, i)}`}
                />
              ))}
            </div>
            <div className="text-xs text-ink-tertiary flex items-center justify-between">
              <span>パスワードの強度</span>
              <strong className={`font-medium ${labelColor(strength)}`}>
                {STRENGTH_LABEL[strength]}
              </strong>
            </div>
          </div>
          {newPasswordError ? (
            <span className={FIELD_HINT_ERROR}>{newPasswordError}</span>
          ) : null}
        </div>

        <div className={FIELD}>
          <label className={FIELD_LABEL} htmlFor={confirmPasswordId}>
            新しいパスワード(確認)
          </label>
          <input
            className={INPUT}
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
            data-error={confirmPasswordError ? "" : undefined}
          />
          <span
            className={confirmPasswordError ? FIELD_HINT_ERROR : FIELD_HINT}
          >
            {confirmPasswordError ??
              "2つのパスワードが一致しているか確認してください。"}
          </span>
        </div>

        {summary !== undefined && summary !== null ? (
          <div className={FORM_ERROR} role="alert">
            <span>{summary}</span>
          </div>
        ) : null}

        <button
          type="submit"
          className={BTN_PRIMARY}
          data-primary=""
          disabled={isPending}
        >
          {isPending ? "更新中..." : "パスワードを決定"}
        </button>
      </form>

      <div className={AUTH_FOOTER}>
        <Link to="/login" className={AUTH_FOOTER_LINK}>
          ログインに戻る
        </Link>
      </div>
    </>
  );
}
