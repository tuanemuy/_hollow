"use client";

import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useActionState, useId, useState, useTransition } from "react";
import { routerInvalidate } from "@/components/common/routerInvalidate";
import {
  chip,
  field,
  fieldControl,
  fieldLabel,
  formError,
  pillBtn,
  pillBtnGhostDanger,
  pillBtnPrimary,
  pillBtnSm,
} from "@/components/common/styles";
import {
  CHIP_PRIVATE,
  CHIP_SUCCESS,
  EMPTY_STATE,
  PAGE_TITLE,
} from "@/components/layout/styles";
import type { ShareLinkDTO } from "@/core/application/publication";
import { displayError } from "@/core/presentation/errorDisplay";
import {
  extractSerializedError,
  type SerializedError,
} from "@/core/presentation/errorResponse";
import {
  LINK_ROW,
  LINK_URL,
  PUBLISH_SECTION_TITLE,
  RADIO_CARD,
  RADIO_CARD_TITLE,
  STATUS_DOT,
  URL_PREVIEW,
  URL_PREVIEW_LABEL,
  URL_PREVIEW_URL,
} from "../styles";
import {
  changeVisibilityFn,
  issueShareLinkFn,
  revokeShareLinkFn,
  setShareLinkPasswordFn,
} from "./action";

type Visibility = "private" | "unlisted" | "public";

type Props = {
  noteId: string;
  appUrl: string;
  initial: Readonly<{
    visibility: Visibility;
    publishedAt: string | null;
    links: readonly ShareLinkDTO[];
  }>;
};

type FormState = { error: SerializedError | null; ok: boolean };
const initial: FormState = { error: null, ok: false };

export function PublishSettings({ noteId, appUrl, initial: data }: Props) {
  const router = useRouter();
  const changeVisibility = useServerFn(changeVisibilityFn);
  const issueLink = useServerFn(issueShareLinkFn);

  const [visibility, setVisibility] = useState<Visibility>(data.visibility);
  const [issuedToken, setIssuedToken] = useState<string | null>(null);

  const visibilityFieldId = useId();

  const [visibilityState, visibilityAction, visibilityPending] = useActionState<
    FormState,
    FormData
  >(async (_prev, formData) => {
    const next = String(formData.get("nextVisibility") ?? "") as Visibility;
    if (next !== "private" && next !== "unlisted" && next !== "public") {
      return { error: null, ok: false };
    }
    try {
      await changeVisibility({ data: { noteId, nextVisibility: next } });
      setVisibility(next);
      await routerInvalidate(router);
      return { error: null, ok: true };
    } catch (e) {
      return { error: extractSerializedError(e), ok: false };
    }
  }, initial);

  const [issueState, issueAction, issuePending] = useActionState<
    FormState,
    FormData
  >(async (_prev, formData) => {
    const passwordRaw = String(formData.get("password") ?? "");
    const password = passwordRaw.length === 0 ? null : passwordRaw;
    try {
      const result = await issueLink({ data: { noteId, password } });
      setIssuedToken(result.urlToken);
      await routerInvalidate(router);
      return { error: null, ok: true };
    } catch (e) {
      return { error: extractSerializedError(e), ok: false };
    }
  }, initial);

  const visibilitySummary =
    visibilityState.error !== null ? displayError(visibilityState.error) : "";
  const issueSummary =
    issueState.error !== null ? displayError(issueState.error) : "";
  const issuedUrl =
    issuedToken === null
      ? null
      : `${appUrl.replace(/\/$/, "")}/share/${issuedToken}`;

  const isPrivate = visibility === "private";

  return (
    <section aria-labelledby={`${visibilityFieldId}-h`}>
      <h1 id={`${visibilityFieldId}-h`} className={PAGE_TITLE}>
        公開設定
      </h1>

      <form action={visibilityAction}>
        <fieldset className="border-0 p-0 m-0">
          <legend className={`${fieldLabel} mb-2`}>公開ステータス</legend>
          <div className="flex flex-col gap-2">
            {(["private", "unlisted", "public"] as const).map((v) => (
              <label key={v} className={RADIO_CARD}>
                <input
                  type="radio"
                  name="nextVisibility"
                  value={v}
                  defaultChecked={v === visibility}
                  disabled={visibilityPending}
                />
                <span className={RADIO_CARD_TITLE}>
                  <span
                    className={STATUS_DOT}
                    data-visibility={v}
                    aria-hidden="true"
                  />
                  {v === "private"
                    ? "非公開"
                    : v === "unlisted"
                      ? "限定公開（リンクを知っている人のみ）"
                      : "公開"}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <button
          type="submit"
          disabled={visibilityPending}
          aria-busy={visibilityPending}
          data-primary=""
          className={`${pillBtn} ${pillBtnPrimary} mt-4`}
        >
          {visibilityPending ? "適用中..." : "公開状態を更新"}
        </button>
        {visibilitySummary !== "" ? (
          <p role="alert" className={formError}>
            {visibilitySummary}
          </p>
        ) : null}
      </form>

      <section className="mt-8">
        <h2 className={`${PUBLISH_SECTION_TITLE} mb-3`}>限定公開リンク</h2>
        {isPrivate ? (
          <p className="text-sm text-ink-secondary">
            非公開ステータスではリンクを発行できません。
          </p>
        ) : (
          <form action={issueAction} className="mb-4">
            <label className={field}>
              <span className={fieldLabel}>パスワード（任意）</span>
              <input
                type="password"
                name="password"
                autoComplete="new-password"
                maxLength={128}
                disabled={issuePending}
                className={fieldControl}
              />
            </label>
            <button
              type="submit"
              disabled={issuePending}
              aria-busy={issuePending}
              data-primary=""
              className={`${pillBtn} ${pillBtnPrimary}`}
            >
              {issuePending ? "発行中..." : "リンクを発行"}
            </button>
            {issueSummary !== "" ? (
              <p role="alert" className={formError}>
                {issueSummary}
              </p>
            ) : null}
            {issuedUrl !== null ? (
              <div className={`${URL_PREVIEW} mt-4`}>
                <p className={URL_PREVIEW_LABEL}>
                  発行されたリンク（一度だけ表示）
                </p>
                <code className={URL_PREVIEW_URL}>{issuedUrl}</code>
              </div>
            ) : null}
          </form>
        )}

        <ShareLinkList links={data.links} />
      </section>
    </section>
  );
}

function ShareLinkList({ links }: { links: readonly ShareLinkDTO[] }) {
  if (links.length === 0) {
    return <p className={EMPTY_STATE}>発行済みリンクはありません。</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {links.map((link) => (
        <ShareLinkRow key={link.id} link={link} />
      ))}
    </ul>
  );
}

function ShareLinkRow({ link }: { link: ShareLinkDTO }) {
  const router = useRouter();
  const revoke = useServerFn(revokeShareLinkFn);
  const setPassword = useServerFn(setShareLinkPasswordFn);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<SerializedError | null>(null);
  const [passwordDraft, setPasswordDraft] = useState("");

  const onRevoke = () => {
    startTransition(async () => {
      try {
        await revoke({ data: { shareLinkId: link.id } });
        await routerInvalidate(router);
        setError(null);
      } catch (e) {
        setError(extractSerializedError(e));
      }
    });
  };

  const onSetPassword = (clear: boolean) => {
    const newPassword = clear ? null : passwordDraft;
    startTransition(async () => {
      try {
        await setPassword({
          data: { shareLinkId: link.id, newPassword },
        });
        await routerInvalidate(router);
        setError(null);
        setPasswordDraft("");
      } catch (e) {
        setError(extractSerializedError(e));
      }
    });
  };

  const message = error === null ? "" : displayError(error);

  return (
    <li className={LINK_ROW}>
      <div className="flex items-center gap-2 min-w-0">
        <code className={LINK_URL}>{link.url}</code>
        <span
          className={`${chip} shrink-0 ${
            link.status === "active" ? CHIP_SUCCESS : CHIP_PRIVATE
          }`}
        >
          {link.status === "active" ? "有効" : "失効済み"}
        </span>
        {link.hasPassword ? (
          <span className={`${chip} shrink-0`}>パスワード設定中</span>
        ) : null}
      </div>
      {link.status === "active" ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="password"
            value={passwordDraft}
            onChange={(e) => setPasswordDraft(e.target.value)}
            placeholder="新しいパスワード"
            maxLength={128}
            disabled={isPending}
            className={`${fieldControl} flex-1 min-w-[160px]`}
          />
          <button
            type="button"
            onClick={() => onSetPassword(false)}
            disabled={isPending || passwordDraft.length === 0}
            aria-busy={isPending}
            data-sm=""
            className={`${pillBtn} ${pillBtnSm}`}
          >
            パスワードを設定
          </button>
          {link.hasPassword ? (
            <button
              type="button"
              onClick={() => onSetPassword(true)}
              disabled={isPending}
              aria-busy={isPending}
              data-ghost-danger=""
              data-sm=""
              className={`${pillBtn} ${pillBtnGhostDanger} ${pillBtnSm}`}
            >
              パスワードを解除
            </button>
          ) : null}
          <button
            type="button"
            onClick={onRevoke}
            disabled={isPending}
            aria-busy={isPending}
            data-ghost-danger=""
            data-sm=""
            className={`${pillBtn} ${pillBtnGhostDanger} ${pillBtnSm}`}
          >
            失効させる
          </button>
        </div>
      ) : null}
      {message !== "" ? (
        <p role="alert" className={formError}>
          {message}
        </p>
      ) : null}
    </li>
  );
}
