"use client";

import { Link2 } from "lucide-react";
import { useId, useState } from "react";
import { Icon } from "@/components/common/Icon";
import { pillBtn } from "@/components/common/styles";

/**
 * Client-side URL copy button.
 *
 * - Uses `navigator.clipboard.writeText`.
 * - Surfaces success / failure via an `aria-live` region next to the
 *   button so screen readers announce the state change.
 *
 * The caller decides which URL string to pass (public share URL vs.
 * internal `/notes/<id>` URL based on visibility).
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
  label = "URLコピー",
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
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        className={pillBtn}
        onClick={onCopy}
        aria-describedby={statusId}
      >
        <Icon icon={Link2} />
        {label}
      </button>
      <span
        id={statusId}
        className="text-xs text-ink-tertiary min-w-0"
        role="status"
        aria-live="polite"
      >
        {state.kind === "copied"
          ? "URL をコピーしました"
          : state.kind === "error"
            ? state.message
            : ""}
      </span>
    </span>
  );
}
