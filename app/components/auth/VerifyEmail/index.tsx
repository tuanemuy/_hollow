"use client";

import { Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AlertCircle, Check, Clock } from "lucide-react";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { Icon } from "@/components/common/Icon";
import { displayError } from "@/core/presentation/errorDisplay";
import {
  extractSerializedError,
  type SerializedError,
} from "@/core/presentation/errorResponse";
import { HOME_SEARCH } from "../links";
import {
  AUTH_BODY,
  AUTH_TITLE,
  BTN_PRIMARY,
  BTN_PRIMARY_INLINE,
  BTN_SECONDARY_TALL,
  FIELD,
  FIELD_LABEL,
  FORM,
  INPUT,
  STATUS_ICON,
  STATUS_ICON_ERROR,
  STATUS_ICON_SUCCESS,
} from "../styles";
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
        // cached _app match の userDto: null を破棄し、/ 遷移後に AppShell を再評価させるため（rule 1）
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
        <h1 className={AUTH_TITLE}>メールを確認中...</h1>
        <p className={AUTH_BODY}>少々お待ちください。</p>
      </div>
    );
  }

  if (status.kind === "success") {
    return (
      <>
        <div
          className={`${STATUS_ICON} ${STATUS_ICON_SUCCESS}`}
          aria-hidden="true"
        >
          <Icon icon={Check} size={24} />
        </div>
        <h1 className={AUTH_TITLE}>メールアドレスを確認しました</h1>
        <p className={AUTH_BODY}>
          これでアカウントを利用できます。ログイン状態でホームへ進めます。
        </p>
        <Link
          to="/"
          search={HOME_SEARCH}
          className={BTN_PRIMARY_INLINE}
          data-primary=""
        >
          ホームへ進む
        </Link>
      </>
    );
  }

  if (status.kind === "expired") {
    return (
      <>
        <div
          className={`${STATUS_ICON} ${STATUS_ICON_ERROR}`}
          aria-hidden="true"
        >
          <Icon icon={Clock} size={24} />
        </div>
        <h1 className={AUTH_TITLE}>リンクの期限が切れています</h1>
        <p className={AUTH_BODY}>
          確認リンクは発行から24時間で無効になります。
          メールアドレスを入力すると確認メールを再送します。
        </p>
        <form className={FORM} onSubmit={onResend} noValidate>
          <div className={FIELD}>
            <label className={FIELD_LABEL} htmlFor={emailId}>
              メールアドレス
            </label>
            <input
              className={INPUT}
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
            <p role="status" className="text-success text-sm">
              確認メールを送信しました。受信箱をご確認ください。
            </p>
          ) : (
            <button
              type="submit"
              className={BTN_PRIMARY}
              data-primary=""
              disabled={
                resendState === "pending" || resendEmail.trim().length === 0
              }
            >
              {resendState === "pending" ? "送信中..." : "確認メールを再送する"}
            </button>
          )}
        </form>
        <Link to="/login" className={`${BTN_SECONDARY_TALL} mt-3`}>
          ログインに戻る
        </Link>
      </>
    );
  }

  if (status.kind === "used") {
    return (
      <>
        <div
          className={`${STATUS_ICON} ${STATUS_ICON_ERROR}`}
          aria-hidden="true"
        >
          <Icon icon={AlertCircle} size={24} />
        </div>
        <h1 className={AUTH_TITLE}>このリンクは使用済みです</h1>
        <p className={AUTH_BODY}>
          この確認リンクはすでに使用されています。
          ログインして続きの操作を行ってください。
        </p>
        <Link to="/login" className={BTN_PRIMARY_INLINE} data-primary="">
          ログインへ
        </Link>
      </>
    );
  }

  if (status.kind === "not_found") {
    return (
      <>
        <div
          className={`${STATUS_ICON} ${STATUS_ICON_ERROR}`}
          aria-hidden="true"
        >
          <Icon icon={AlertCircle} size={24} />
        </div>
        <h1 className={AUTH_TITLE}>無効なリンクです</h1>
        <p className={AUTH_BODY}>
          確認リンクが不正です。確認メールをもう一度送信してください。
        </p>
        <Link to="/login" className={BTN_PRIMARY_INLINE} data-primary="">
          ログインへ
        </Link>
      </>
    );
  }

  return (
    <>
      <div className={`${STATUS_ICON} ${STATUS_ICON_ERROR}`} aria-hidden="true">
        <Icon icon={AlertCircle} size={24} />
      </div>
      <h1 className={AUTH_TITLE}>確認に失敗しました</h1>
      <p className={AUTH_BODY}>{status.message}</p>
      <Link to="/login" className={BTN_PRIMARY_INLINE} data-primary="">
        ログインへ
      </Link>
    </>
  );
}
