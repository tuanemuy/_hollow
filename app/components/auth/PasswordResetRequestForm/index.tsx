"use client";

import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useActionState, useId } from "react";
import { displayError } from "@/core/presentation/errorDisplay";
import {
  extractSerializedError,
  type SerializedError,
} from "@/core/presentation/errorResponse";
import { requestPasswordResetFn } from "./action";

type FormState = {
  error: SerializedError | null;
  sent: boolean;
};

const initialState: FormState = { error: null, sent: false };

export function PasswordResetRequestForm() {
  const requestReset = useServerFn(requestPasswordResetFn);

  const emailId = useId();

  const [state, formAction, isPending] = useActionState<FormState, FormData>(
    async (_prev, formData) => {
      try {
        await requestReset({
          data: { email: String(formData.get("email") ?? "") },
        });
        return { error: null, sent: true };
      } catch (error) {
        return { error: extractSerializedError(error), sent: false };
      }
    },
    initialState,
  );

  const fieldError =
    state.error?.kind === "validation"
      ? state.error.fieldErrors?.email?.[0]
      : undefined;
  const summary =
    state.error !== null && fieldError === undefined
      ? displayError(state.error)
      : null;

  if (state.sent) {
    return (
      <>
        <h1 className="auth-title">再設定リンクを送信しました</h1>
        <p className="auth-subtitle">
          入力されたアドレスが登録済みの場合、再設定用のリンクをお送りしています。
          メールが届かない場合は、迷惑メールフォルダもご確認ください。
        </p>
        <div className="auth-footer">
          <Link to="/login">ログインに戻る</Link>
        </div>
      </>
    );
  }

  return (
    <>
      <h1 className="auth-title">パスワードを再設定</h1>
      <p className="auth-subtitle">
        登録済みのメールアドレスを入力してください。再設定用のリンクをお送りします。
        <br />
        セキュリティ上の理由から、入力されたアドレスが登録済みかどうかはお伝えできません。
      </p>

      <form className="form" action={formAction} noValidate>
        <div className={`field${fieldError ? " has-error" : ""}`}>
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
            aria-invalid={fieldError !== undefined}
          />
          <span className="field-hint">
            {fieldError ?? "登録時に使用したアドレスを入力してください。"}
          </span>
        </div>

        {summary !== null ? (
          <div className="form-error" role="alert">
            <span>{summary}</span>
          </div>
        ) : null}

        <button type="submit" className="btn-primary" disabled={isPending}>
          {isPending ? "送信中..." : "再設定リンクを送る"}
        </button>
      </form>

      <div className="notice">
        メールが届かない場合は、迷惑メールフォルダもご確認ください。それでも届かない場合は、別のアドレスで登録されている可能性があります。
      </div>

      <div className="auth-footer">
        <Link to="/login">ログインに戻る</Link>
      </div>
    </>
  );
}
