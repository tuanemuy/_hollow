"use client";

import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useActionState, useId, useState, useTransition } from "react";
import { routerInvalidate } from "@/components/common/routerInvalidate";
import type { ShareLinkDTO } from "@/core/application/publication";
import { displayError } from "@/core/presentation/errorDisplay";
import {
  extractSerializedError,
  type SerializedError,
} from "@/core/presentation/errorResponse";
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
      <h2 id={`${visibilityFieldId}-h`}>公開設定</h2>

      <form action={visibilityAction}>
        <fieldset>
          <legend>公開ステータス</legend>
          {(["private", "unlisted", "public"] as const).map((v) => (
            <label key={v}>
              <input
                type="radio"
                name="nextVisibility"
                value={v}
                defaultChecked={v === visibility}
                disabled={visibilityPending}
              />
              <span>
                {v === "private"
                  ? "非公開"
                  : v === "unlisted"
                    ? "限定公開（リンクを知っている人のみ）"
                    : "公開"}
              </span>
            </label>
          ))}
        </fieldset>
        <button type="submit" disabled={visibilityPending}>
          {visibilityPending ? "適用中..." : "公開状態を更新"}
        </button>
        {visibilitySummary !== "" ? (
          <p role="alert">{visibilitySummary}</p>
        ) : null}
      </form>

      <section>
        <h3>限定公開リンク</h3>
        {isPrivate ? (
          <p>非公開ステータスではリンクを発行できません。</p>
        ) : (
          <form action={issueAction}>
            <label>
              <span>パスワード（任意）</span>
              <input
                type="password"
                name="password"
                autoComplete="new-password"
                maxLength={128}
                disabled={issuePending}
              />
            </label>
            <button type="submit" disabled={issuePending}>
              {issuePending ? "発行中..." : "リンクを発行"}
            </button>
            {issueSummary !== "" ? <p role="alert">{issueSummary}</p> : null}
            {issuedUrl !== null ? (
              <p>
                発行されたリンク（一度だけ表示）: <code>{issuedUrl}</code>
              </p>
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
    return <p>発行済みリンクはありません。</p>;
  }
  return (
    <ul>
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
    <li>
      <div>
        <code>{link.url}</code>
        <span>{link.status === "active" ? "有効" : "失効済み"}</span>
        {link.hasPassword ? <span>パスワード設定中</span> : null}
      </div>
      {link.status === "active" ? (
        <>
          <input
            type="password"
            value={passwordDraft}
            onChange={(e) => setPasswordDraft(e.target.value)}
            placeholder="新しいパスワード"
            maxLength={128}
            disabled={isPending}
          />
          <button
            type="button"
            onClick={() => onSetPassword(false)}
            disabled={isPending || passwordDraft.length === 0}
          >
            パスワードを設定
          </button>
          {link.hasPassword ? (
            <button
              type="button"
              onClick={() => onSetPassword(true)}
              disabled={isPending}
            >
              パスワードを解除
            </button>
          ) : null}
          <button type="button" onClick={onRevoke} disabled={isPending}>
            失効させる
          </button>
        </>
      ) : null}
      {message !== "" ? <p role="alert">{message}</p> : null}
    </li>
  );
}
