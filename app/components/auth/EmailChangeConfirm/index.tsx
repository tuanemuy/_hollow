"use client";

import { Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AlertCircle, Check, Clock } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/common/Icon";
import {
  ALERT,
  ALERT_BODY,
  ALERT_CONTENT,
  ALERT_ICON,
  ALERT_TITLE,
  ALERT_WARNING,
} from "@/components/common/styles";
import { displayError } from "@/core/presentation/errorDisplay";
import {
  extractSerializedError,
  type SerializedError,
} from "@/core/presentation/errorResponse";
import { HOME_SEARCH } from "../links";
import {
  ADDRESS_LABEL,
  ADDRESS_ROW,
  ADDRESS_SUMMARY,
  ADDRESS_VALUE,
  ADDRESS_VALUE_OLD,
  AUTH_BODY,
  AUTH_TITLE,
  BTN_PRIMARY_INLINE,
  STATUS_ICON,
  STATUS_ICON_ERROR,
  STATUS_ICON_SUCCESS,
} from "../styles";
import { verifyEmailChangeFn } from "./action";

type Status =
  | { kind: "loading" }
  | { kind: "success"; oldEmail: string; newEmail: string }
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

export function EmailChangeConfirm({ token }: { token: string }) {
  const router = useRouter();
  const verifyChange = useServerFn(verifyEmailChangeFn);

  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    (async () => {
      try {
        const result = await verifyChange({ data: { token } });
        // _app の userDto.email キャッシュを破棄するため _app も invalidate（rule 1）
        await router.invalidate();
        setStatus({
          kind: "success",
          oldEmail: result.oldEmail,
          newEmail: result.newEmail,
        });
      } catch (error) {
        setStatus(statusFromError(extractSerializedError(error)));
      }
    })();
  }, [verifyChange, router, token]);

  if (status.kind === "loading") {
    return (
      <div role="status" aria-live="polite">
        <h1 className={AUTH_TITLE}>アドレス変更を確認中...</h1>
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
        <h1 className={AUTH_TITLE}>メールアドレスを変更しました</h1>
        <p className={AUTH_BODY}>
          新しいメールアドレスでの本人確認が完了しました。今後のログインや通知は新しいアドレスに切り替わります。
        </p>

        {/* biome-ignore lint/a11y/useSemanticElements: role="group" labels the address diff (mock parity); <fieldset> carries form-control semantics that are inappropriate for a static read-only summary (mirrors FilterBar). */}
        <div
          className={`${ADDRESS_SUMMARY} mb-8`}
          role="group"
          aria-label="変更内容"
        >
          <div className={ADDRESS_ROW}>
            <span className={ADDRESS_LABEL}>旧アドレス</span>
            <span className={ADDRESS_VALUE_OLD}>{status.oldEmail}</span>
          </div>
          <div className={ADDRESS_ROW}>
            <span className={ADDRESS_LABEL}>新アドレス</span>
            <span className={ADDRESS_VALUE}>{status.newEmail}</span>
          </div>
        </div>

        <div className={`${ALERT} ${ALERT_WARNING} mb-8`} role="status">
          <span className={ALERT_ICON} aria-hidden="true">
            <Icon icon={AlertCircle} size={20} />
          </span>
          <div className={ALERT_CONTENT}>
            <p className={ALERT_TITLE}>旧アドレスは使用できなくなりました</p>
            <p className={ALERT_BODY}>
              今後は新しいアドレスでログインしてください。古いアドレス宛の通知も届かなくなります。
            </p>
          </div>
        </div>

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
          設定画面からもう一度メールアドレス変更をリクエストしてください。
        </p>
        <Link to="/login" className={BTN_PRIMARY_INLINE} data-primary="">
          ログインへ
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
        <p className={AUTH_BODY}>このリンクは既に使用されています。</p>
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
          リンクが正しくありません。設定画面からやり直してください。
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
