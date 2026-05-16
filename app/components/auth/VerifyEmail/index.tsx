"use client";

import { Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { displayError } from "@/core/presentation/errorDisplay";
import {
  extractSerializedError,
  type SerializedError,
} from "@/core/presentation/errorResponse";
import { HOME_SEARCH } from "../links";
import { resendVerificationFromVerifyFn, verifyEmailFn } from "./action";

type Status =
  | { kind: "loading" }
  | { kind: "success" }
  | { kind: "expired" }
  | { kind: "used" }
  | { kind: "not_found" }
  | { kind: "error"; message: string };

function statusFromError(error: SerializedError): Status {
  if (error.kind === "business") {
    if (error.code === "token_expired") return { kind: "expired" };
    if (error.code === "token_consumed") return { kind: "used" };
    if (
      error.code === "token_not_found" ||
      error.code === "token_purpose_mismatch"
    ) {
      return { kind: "not_found" };
    }
  }
  return { kind: "error", message: displayError(error) };
}

export function VerifyEmail({ token }: { token: string }) {
  const router = useRouter();
  const verify = useServerFn(verifyEmailFn);
  const resend = useServerFn(resendVerificationFromVerifyFn);

  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const startedRef = useRef(false);

  const emailId = useId();
  const [resendEmail, setResendEmail] = useState("");
  const [resendState, setResendState] = useState<"idle" | "pending" | "sent">(
    "idle",
  );
  const [, startResendTransition] = useTransition();

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    (async () => {
      try {
        await verify({ data: { token } });
        await router.invalidate();
        setStatus({ kind: "success" });
      } catch (error) {
        setStatus(statusFromError(extractSerializedError(error)));
      }
    })();
  }, [verify, router, token]);

  const onResend = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (resendEmail.trim().length === 0) return;
    setResendState("pending");
    startResendTransition(async () => {
      try {
        await resend({ data: { email: resendEmail.trim() } });
        setResendState("sent");
      } catch {
        setResendState("idle");
      }
    });
  };

  if (status.kind === "loading") {
    return (
      <div role="status" aria-live="polite">
        <h1 className="auth-title">メールを確認中...</h1>
        <p className="auth-body">少々お待ちください。</p>
      </div>
    );
  }

  if (status.kind === "success") {
    return (
      <>
        <div className="status-icon success" aria-hidden="true">
          <svg
            width="36"
            height="36"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
        <h1 className="auth-title">メールアドレスを確認しました</h1>
        <p className="auth-body">
          これでアカウントを利用できます。ログイン状態でホームへ進めます。
        </p>
        <Link
          to="/"
          search={HOME_SEARCH}
          className="btn-primary btn-primary--inline"
        >
          ホームへ進む
        </Link>
      </>
    );
  }

  if (status.kind === "expired") {
    return (
      <>
        <div className="status-icon error" aria-hidden="true">
          <svg
            width="36"
            height="36"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9" />
            <polyline points="12 7 12 12 15 14" />
          </svg>
        </div>
        <h1 className="auth-title">リンクの期限が切れています</h1>
        <p className="auth-body">
          確認リンクは発行から24時間で無効になります。
          <br />
          メールアドレスを入力すると確認メールを再送します。
        </p>
        <form className="form" onSubmit={onResend} noValidate>
          <div className="field">
            <label className="field-label" htmlFor={emailId}>
              メールアドレス
            </label>
            <input
              className="input"
              id={emailId}
              type="email"
              autoComplete="email"
              required
              value={resendEmail}
              onChange={(event) => setResendEmail(event.target.value)}
              disabled={resendState === "pending" || resendState === "sent"}
            />
          </div>
          {resendState === "sent" ? (
            <p
              role="status"
              style={{
                color: "var(--color-success)",
                fontSize: "var(--text-sm)",
              }}
            >
              確認メールを送信しました。受信箱をご確認ください。
            </p>
          ) : (
            <button
              type="submit"
              className="btn-primary"
              disabled={
                resendState === "pending" || resendEmail.trim().length === 0
              }
            >
              {resendState === "pending" ? "送信中..." : "確認メールを再送する"}
            </button>
          )}
        </form>
        <Link
          to="/login"
          className="btn-secondary btn-secondary--tall"
          style={{ marginTop: "var(--space-3)" }}
        >
          ログインに戻る
        </Link>
      </>
    );
  }

  if (status.kind === "used") {
    return (
      <>
        <div className="status-icon error" aria-hidden="true">
          <svg
            width="36"
            height="36"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <h1 className="auth-title">このリンクは使用済みです</h1>
        <p className="auth-body">
          この確認リンクはすでに使用されています。
          <br />
          ログインして続きの操作を行ってください。
        </p>
        <Link to="/login" className="btn-primary btn-primary--inline">
          ログインへ
        </Link>
      </>
    );
  }

  if (status.kind === "not_found") {
    return (
      <>
        <div className="status-icon error" aria-hidden="true">
          <svg
            width="36"
            height="36"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <h1 className="auth-title">無効なリンクです</h1>
        <p className="auth-body">
          確認リンクが不正です。確認メールをもう一度送信してください。
        </p>
        <Link to="/login" className="btn-primary btn-primary--inline">
          ログインへ
        </Link>
      </>
    );
  }

  return (
    <>
      <div className="status-icon error" aria-hidden="true">
        <svg
          width="36"
          height="36"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="9" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <h1 className="auth-title">確認に失敗しました</h1>
      <p className="auth-body">{status.message}</p>
      <Link to="/login" className="btn-primary btn-primary--inline">
        ログインへ
      </Link>
    </>
  );
}
