"use client";

import { useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Check, Copy } from "lucide-react";
import {
  useActionState,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
} from "react";
import { Dialog } from "@/components/common/Dialog";
import { Icon } from "@/components/common/Icon";
import { routerInvalidate } from "@/components/common/routerInvalidate";
import {
  chip,
  dialogActions,
  dialogTitle,
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
} from "@/components/layout/styles";
import type { ShareLinkDTO } from "@/core/application/publication";
import { displayError } from "@/core/presentation/errorDisplay";
import {
  extractSerializedError,
  type SerializedError,
} from "@/core/presentation/errorResponse";
import {
  LINK_CARD_HEAD,
  LINK_COPY_BTN,
  LINK_LAST_ACCESS,
  LINK_ROW,
  LINK_URL,
  LINK_URL_ROW,
  PUBLISH_SECTION_TITLE,
  RADIO_CARD,
  RADIO_CARD_TITLE,
  RADIO_DESC,
  STATUS_DOT,
  URL_PREVIEW,
  URL_PREVIEW_LABEL,
  URL_PREVIEW_URL,
  VISIBILITY_DESC,
} from "../styles";
import {
  changeVisibilityFn,
  issueShareLinkFn,
  revokeShareLinkFn,
  setShareLinkPasswordFn,
} from "./action";

type Visibility = "private" | "unlisted" | "public";

/**
 * Format a share link's last-access `Instant` (ISO string) into a localized
 * month/day + time label (mock `最終アクセス: 5 月 14 日 09:42`). Kept local —
 * `listSelectors.formatDate` is date-only and lives in the note domain, so
 * importing it here would add a cross-domain dependency for a different format.
 */
function formatLastAccess(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ja-JP", {
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type Props = {
  open: boolean;
  onClose: () => void;
  noteId: string;
  appUrl: string;
  /** Canonical public URL (`/u/<username>/<slug>`), shown when public is selected. */
  publicNoteUrl: string;
  initial: Readonly<{
    visibility: Visibility;
    publishedAt: string | null;
    links: readonly ShareLinkDTO[];
  }>;
};

// `useActionState` state is reset-proof (no programmatic setter), so form
// errors are kept in dedicated `useState` that the close-time effect can null
// out (see ADR-005). The reducer state is unused — it only drives the pending
// flag (third tuple element).
type FormState = void;

export function PublishSettings({
  open,
  onClose,
  noteId,
  appUrl,
  publicNoteUrl,
  initial: data,
}: Props) {
  const router = useRouter();
  const changeVisibility = useServerFn(changeVisibilityFn);
  const issueLink = useServerFn(issueShareLinkFn);

  const [visibility, setVisibility] = useState<Visibility>(data.visibility);
  // Pre-submit radio selection — drives the "公開時の URL" preview immediately on
  // click (the committed `visibility` only updates after the update succeeds).
  const [selected, setSelected] = useState<Visibility>(data.visibility);
  const [issuedToken, setIssuedToken] = useState<string | null>(null);
  const [visibilityError, setVisibilityError] =
    useState<SerializedError | null>(null);
  const [issueError, setIssueError] = useState<SerializedError | null>(null);

  // Each ShareLinkRow owns a local `useTransition` pending; we lift those into
  // a counter so the dialog stays non-closable while any row mutation is in
  // flight, alongside the two useActionState pendings below.
  const [pendingRows, setPendingRows] = useState(0);
  const onRowPendingChange = useCallback((rowPending: boolean) => {
    setPendingRows((n) => (rowPending ? n + 1 : Math.max(0, n - 1)));
  }, []);

  const titleId = useId();

  // Dialog unmounts only its own children; this component stays mounted under
  // NoteActions, so reset transient state when the modal closes — otherwise the
  // one-time issued URL banner and the optimistic visibility leak across opens.
  useEffect(() => {
    if (open) return;
    setIssuedToken(null);
    setVisibility(data.visibility);
    setSelected(data.visibility);
    setVisibilityError(null);
    setIssueError(null);
  }, [open, data.visibility]);

  const [, visibilityAction, visibilityPending] = useActionState<
    FormState,
    FormData
  >(async (_prev, formData) => {
    const next = String(formData.get("nextVisibility") ?? "") as Visibility;
    if (next !== "private" && next !== "unlisted" && next !== "public") {
      return;
    }
    try {
      await changeVisibility({ data: { noteId, nextVisibility: next } });
      setVisibility(next);
      setSelected(next);
      setVisibilityError(null);
      await routerInvalidate(router);
    } catch (e) {
      setVisibilityError(extractSerializedError(e));
    }
  }, undefined);

  const [, issueAction, issuePending] = useActionState<FormState, FormData>(
    async (_prev, formData) => {
      const passwordRaw = String(formData.get("password") ?? "");
      const password = passwordRaw.length === 0 ? null : passwordRaw;
      try {
        const result = await issueLink({ data: { noteId, password } });
        setIssuedToken(result.urlToken);
        setIssueError(null);
        await routerInvalidate(router);
      } catch (e) {
        setIssueError(extractSerializedError(e));
      }
    },
    undefined,
  );

  const visibilitySummary =
    visibilityError !== null ? displayError(visibilityError) : "";
  const issueSummary = issueError !== null ? displayError(issueError) : "";
  const issuedUrl =
    issuedToken === null
      ? null
      : `${appUrl.replace(/\/$/, "")}/share/${issuedToken}`;

  const isPrivate = visibility === "private";
  const anyPending = visibilityPending || issuePending || pendingRows > 0;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      ariaLabelledBy={titleId}
      closable={!anyPending}
      showCloseButton
    >
      <h2 id={titleId} className={dialogTitle}>
        公開設定
      </h2>

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
                  onChange={() => setSelected(v)}
                  disabled={visibilityPending}
                />
                <span className="flex-1 min-w-0">
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
                  <span className={`block mt-0.5 ${RADIO_DESC}`}>
                    {VISIBILITY_DESC[v]}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        {selected === "public" ? (
          <div className={`${URL_PREVIEW} mt-6`}>
            <p className={URL_PREVIEW_LABEL}>公開時の URL</p>
            <code className={URL_PREVIEW_URL}>{publicNoteUrl}</code>
          </div>
        ) : null}
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
        <h3 className={`${PUBLISH_SECTION_TITLE} mb-3`}>限定公開リンク</h3>
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

        <ShareLinkList
          links={data.links}
          onPendingChange={onRowPendingChange}
        />
      </section>

      <div className={dialogActions}>
        <button
          type="button"
          className={pillBtn}
          onClick={onClose}
          disabled={anyPending}
        >
          閉じる
        </button>
      </div>
    </Dialog>
  );
}

function ShareLinkList({
  links,
  onPendingChange,
}: {
  links: readonly ShareLinkDTO[];
  onPendingChange: (pending: boolean) => void;
}) {
  if (links.length === 0) {
    return <p className={EMPTY_STATE}>発行済みリンクはありません。</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {links.map((link) => (
        <ShareLinkRow
          key={link.id}
          link={link}
          onPendingChange={onPendingChange}
        />
      ))}
    </ul>
  );
}

function ShareLinkRow({
  link,
  onPendingChange,
}: {
  link: ShareLinkDTO;
  onPendingChange: (pending: boolean) => void;
}) {
  const router = useRouter();
  const revoke = useServerFn(revokeShareLinkFn);
  const setPassword = useServerFn(setShareLinkPasswordFn);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<SerializedError | null>(null);
  const [passwordDraft, setPasswordDraft] = useState("");
  const [copied, setCopied] = useState(false);
  const copyStatusId = useId();
  const copyResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear any pending copy-reset timer on unmount so it cannot fire a
  // `setCopied` after the row is gone (e.g. revoke removes the active row).
  useEffect(() => {
    return () => {
      if (copyResetTimer.current !== null) {
        clearTimeout(copyResetTimer.current);
      }
    };
  }, []);

  const onCopy = () => {
    void navigator.clipboard?.writeText(link.url).then(
      () => {
        setCopied(true);
        if (copyResetTimer.current !== null) {
          clearTimeout(copyResetTimer.current);
        }
        copyResetTimer.current = setTimeout(() => setCopied(false), 1500);
      },
      () => {},
    );
  };

  // Mirror the row's `useTransition` pending up to the dialog so it stays
  // non-closable while a row mutation is in flight. Only the `true` phase
  // registers (and de-registers on cleanup), so the parent counter is a clean
  // +1/-1 balanced pair per in-flight transition — robust to the row
  // unmounting mid-flight (e.g. revoke removes the active controls).
  useEffect(() => {
    if (!isPending) return;
    onPendingChange(true);
    return () => onPendingChange(false);
  }, [isPending, onPendingChange]);

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
      <div className={LINK_CARD_HEAD}>
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
        {link.lastAccessedAt !== null ? (
          <span className={LINK_LAST_ACCESS}>
            最終アクセス: {formatLastAccess(link.lastAccessedAt)}
          </span>
        ) : null}
      </div>
      <div className={LINK_URL_ROW}>
        <code className={LINK_URL}>{link.url}</code>
        <button
          type="button"
          onClick={onCopy}
          aria-label="リンクをコピー"
          title="コピー"
          className={LINK_COPY_BTN}
          aria-describedby={copyStatusId}
        >
          <Icon icon={copied ? Check : Copy} />
        </button>
        <span
          id={copyStatusId}
          className="sr-only"
          role="status"
          aria-live="polite"
        >
          {copied ? "コピーしました" : ""}
        </span>
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
