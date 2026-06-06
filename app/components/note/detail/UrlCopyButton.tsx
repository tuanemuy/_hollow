"use client";

import { Check, Link2 } from "lucide-react";
import { useId, useState } from "react";
import { Icon } from "@/components/common/Icon";
import { pillBtn, pillBtnIcon } from "@/components/common/styles";

/**
 * Client-side URL copy button — a circular icon-only toolbar action (#459).
 *
 * - Uses `navigator.clipboard.writeText`.
 * - Visual feedback is the icon swap (Link2 → Check); the textual
 *   success / failure message lives in an `sr-only` `aria-live` region so
 *   screen readers announce the state change without a visible status string
 *   stretching the icon row.
 *
 * The caller decides which URL string to pass based on visibility — the
 * canonical public URL, an active share link, or the internal
 * `/notes/<id>` URL.
 */
export type UrlCopyButtonProps = Readonly<{
  url: string;
  label?: string;
}>;

type CopyState =
  | { kind: "idle" }
  | { kind: "copied" }
  | { kind: "error"; message: string };

export function UrlCopyButton({
  url,
  label = "URLをコピー",
}: UrlCopyButtonProps) {
  const [state, setState] = useState<CopyState>({ kind: "idle" });
  const statusId = useId();

  const onCopy = async () => {
    if (typeof navigator === "undefined" || navigator.clipboard === undefined) {
      setState({
        kind: "error",
        message: "クリップボードを利用できません",
      });
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setState({ kind: "copied" });
      setTimeout(() => {
        setState((prev) => (prev.kind === "copied" ? { kind: "idle" } : prev));
      }, 2000);
    } catch {
      setState({
        kind: "error",
        message: "コピーに失敗しました",
      });
    }
  };

  return (
    <span className="inline-flex items-center">
      <button
        type="button"
        className={`${pillBtn} ${pillBtnIcon}`}
        data-icon=""
        aria-label={label}
        title={label}
        onClick={onCopy}
        aria-describedby={statusId}
      >
        <Icon icon={state.kind === "copied" ? Check : Link2} size={20} />
      </button>
      <span id={statusId} className="sr-only" role="status" aria-live="polite">
        {state.kind === "copied"
          ? "URL をコピーしました"
          : state.kind === "error"
            ? state.message
            : ""}
      </span>
    </span>
  );
}
