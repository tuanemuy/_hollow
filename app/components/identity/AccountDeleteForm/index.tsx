"use client";

import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Trash2 } from "lucide-react";
import { useId, useState, useTransition } from "react";
import { HOME_SEARCH } from "@/components/auth/links";
import { Icon } from "@/components/common/Icon";
import { clearAppShellCache } from "@/components/common/routerInvalidate";
import {
  ALERT,
  ALERT_BODY,
  ALERT_CONTENT,
  ALERT_ERROR,
  ALERT_ICON,
  ALERT_TITLE,
} from "@/components/common/styles";
import type {
  AccountDeletionImpactDTO,
  UserDTO,
} from "@/core/application/dto/identity";
import {
  extractSerializedError,
  type SerializedError,
} from "@/core/presentation/errorResponse";
import { PASSWORD_MAX, USERNAME_MAX } from "../schema";
import {
  ALERT_LIST,
  ALERT_LIST_ITEM,
  BTN_DESTRUCTIVE,
  CONFIRM_STEPS,
  DANGER_ACTION,
  DANGER_NOTE,
  FIELD_ERROR,
  FIELD_INPUT,
  SECTION,
  SECTION_DESC,
  SECTION_TITLE,
  STEP,
  STEP_BODY,
  STEP_CHECKBOX_ROW,
  STEP_HELP,
  STEP_LABEL,
  STEP_LABEL_SPACED,
  STEP_NUM,
} from "../styles";
import { deleteAccountFn } from "./action";

const CONFIRM_WORD = "DELETE";

// Local byte formatter — the raw byte total comes from the aggregation
// DTO and humanization is a presentation concern (#573). Mirrors the
// admin metrics helper; kept inline rather than shared (YAGNI).
function formatBytes(value: number): string {
  if (value === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(
    units.length - 1,
    Math.floor(Math.log(value) / Math.log(1024)),
  );
  const scaled = value / 1024 ** i;
  return `${scaled.toFixed(scaled >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function AccountDeleteForm({
  user,
  impact,
}: {
  user: UserDTO;
  impact: AccountDeletionImpactDTO;
}) {
  const router = useRouter();
  const deleteAccount = useServerFn(deleteAccountFn);

  const [agree, setAgree] = useState(false);
  const [confirmWord, setConfirmWord] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<SerializedError | null>(null);
  const [isPending, startTransition] = useTransition();

  const agreeId = useId();
  const confirmWordId = useId();
  const usernameId = useId();
  const passwordId = useId();
  const helpId = useId();

  const wordDone = confirmWord === CONFIRM_WORD;
  const identityDone = username === user.username && password.length > 0;
  const canSubmit = agree && wordDone && identityDone && !isPending;

  // Confirm-word field errors are suppressed (client gating prevents them
  // from ever reaching the server); only confirmation / currentPassword
  // field errors surface (#573 S-005).
  const usernameError =
    error?.kind === "validation" ? error.fieldErrors?.confirmation : undefined;
  const passwordError =
    error?.kind === "validation"
      ? error.fieldErrors?.currentPassword
      : undefined;
  // Non-validation server errors (e.g. AuthenticationError on wrong password)
  // surface as a form-level message without navigating away.
  const formError =
    error !== null && error.kind !== "validation" ? error.message : null;

  const onSubmit = () => {
    if (!canSubmit) return;
    setError(null);
    startTransition(async () => {
      try {
        await deleteAccount({
          data: {
            confirmation: username,
            currentPassword: password,
            confirmWord: CONFIRM_WORD,
          },
        });
        // Drop the stale cached `_app` match (old userDto) before navigating,
        // avoiding a navigate/cache race (#728 ADR-001).
        clearAppShellCache(router);
        await router.navigate({ to: "/", search: HOME_SEARCH });
      } catch (e) {
        setError(extractSerializedError(e));
      }
    });
  };

  return (
    <section className={SECTION}>
      <h2 className={SECTION_TITLE}>アカウント削除</h2>
      <p className={SECTION_DESC}>
        この操作は
        <strong className="font-medium text-ink">取り消せません</strong>
        。削除を完了する前に、失われる内容と以下のステップをご確認ください。
      </p>

      <div className={`${ALERT} ${ALERT_ERROR} mb-6`} role="alert">
        <span className={ALERT_ICON} aria-hidden="true">
          <Icon icon={AlertTriangle} />
        </span>
        <div className={ALERT_CONTENT}>
          <p className={ALERT_TITLE}>削除すると次の影響があります</p>
          <ul className={`${ALERT_BODY} ${ALERT_LIST}`}>
            <li className={ALERT_LIST_ITEM}>
              <strong>{impact.noteCount} 件</strong>
              のノート（本文・タグ・ディレクトリ構造を含む）にアクセスできなくなります
            </li>
            <li className={ALERT_LIST_ITEM}>
              アップロード済みメディア{" "}
              <strong>
                {impact.mediaCount} 件 / {formatBytes(impact.mediaTotalBytes)}
              </strong>
              （画像・PDF・音声など）にアクセスできなくなります
            </li>
            <li className={ALERT_LIST_ITEM}>
              公開中のノート 約 <strong>{impact.publicNoteCount} 件</strong>{" "}
              は公開停止され、公開 URL は <strong>410 Gone</strong>{" "}
              を返すようになります
            </li>
            <li className={ALERT_LIST_ITEM}>
              発行済みの限定公開リンク{" "}
              <strong>{impact.activeShareLinkCount} 本</strong>
              はすべて失効します
            </li>
            <li className={ALERT_LIST_ITEM}>
              進行中のエクスポートジョブはキャンセルされます。保存ビュー・カスタムプロンプトなどアカウントに紐づくデータも利用できなくなります
            </li>
            <li className={ALERT_LIST_ITEM}>
              削除後のデータ復元は<strong>できません</strong>
            </li>
          </ul>
        </div>
      </div>

      <div className={CONFIRM_STEPS}>
        <div className={STEP}>
          <span className={STEP_NUM} data-done={agree || undefined}>
            1
          </span>
          <div className={STEP_BODY}>
            <label className={STEP_CHECKBOX_ROW} htmlFor={agreeId}>
              <input
                id={agreeId}
                type="checkbox"
                checked={agree}
                onChange={(e) => setAgree(e.target.checked)}
                disabled={isPending}
              />
              <span>
                上記のすべてにアクセスできなくなり、
                <strong>復元できない</strong>ことを理解しました。
              </span>
            </label>
          </div>
        </div>

        <div className={STEP}>
          <span className={STEP_NUM} data-done={wordDone || undefined}>
            2
          </span>
          <div className={STEP_BODY}>
            <label className={STEP_LABEL} htmlFor={confirmWordId}>
              確認のため <code>{CONFIRM_WORD}</code> と入力してください
            </label>
            <input
              id={confirmWordId}
              className={FIELD_INPUT}
              type="text"
              value={confirmWord}
              onChange={(e) => setConfirmWord(e.target.value)}
              placeholder={CONFIRM_WORD}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              disabled={isPending}
            />
          </div>
        </div>

        <div className={STEP}>
          <span className={STEP_NUM} data-done={identityDone || undefined}>
            3
          </span>
          <div className={STEP_BODY}>
            <label className={STEP_LABEL} htmlFor={usernameId}>
              ユーザー名 <code>{user.username}</code> を入力してください
            </label>
            <input
              id={usernameId}
              name="confirmation"
              className={FIELD_INPUT}
              type="text"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                if (error?.kind === "validation") setError(null);
              }}
              maxLength={USERNAME_MAX}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              disabled={isPending}
              aria-invalid={
                usernameError !== undefined && usernameError.length > 0
              }
            />
            {usernameError !== undefined && usernameError.length > 0 ? (
              <p className={FIELD_ERROR} role="alert">
                {usernameError[0]}
              </p>
            ) : null}
            <label className={STEP_LABEL_SPACED} htmlFor={passwordId}>
              現在のパスワード
            </label>
            <input
              id={passwordId}
              name="currentPassword"
              className={FIELD_INPUT}
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error?.kind === "validation") setError(null);
              }}
              maxLength={PASSWORD_MAX}
              autoComplete="current-password"
              disabled={isPending}
              aria-invalid={
                passwordError !== undefined && passwordError.length > 0
              }
              aria-describedby={helpId}
            />
            {passwordError !== undefined && passwordError.length > 0 ? (
              <p className={FIELD_ERROR} role="alert">
                {passwordError[0]}
              </p>
            ) : null}
            <p id={helpId} className={STEP_HELP}>
              本人確認のため、ユーザー名とパスワードの両方が必要です。
            </p>
          </div>
        </div>
      </div>

      {formError !== null ? (
        <p className={`${FIELD_ERROR} mt-6`} role="alert">
          {formError}
        </p>
      ) : null}

      <div className={DANGER_ACTION}>
        <button
          type="button"
          className={BTN_DESTRUCTIVE}
          onClick={onSubmit}
          disabled={!canSubmit}
        >
          <Icon icon={Trash2} />
          アカウントを完全に削除する
        </button>
        <p className={DANGER_NOTE}>
          削除を実行すると即時にログアウトされ、この操作は取り消せません。
        </p>
      </div>
    </section>
  );
}
