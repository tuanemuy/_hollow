import { displayError } from "@/core/presentation/errorDisplay";
import type { AutosaveStatus } from "./editorState";

/**
 * Pure presentational chip for autosave status. The orchestrator owns
 * the state machine; this component only maps `AutosaveStatus` to
 * user-visible copy + a class hook for styling.
 */
export type AutosaveIndicatorProps = Readonly<{
  status: AutosaveStatus;
}>;

const BASE = "inline-flex items-center text-xs";

export function AutosaveIndicator({ status }: AutosaveIndicatorProps) {
  switch (status.kind) {
    case "idle":
      return (
        <span className={`${BASE} text-ink-tertiary`} aria-live="polite">
          自動保存はオフ
        </span>
      );
    case "dirty":
      return (
        <span className={`${BASE} text-warning`} aria-live="polite">
          未保存の変更があります
        </span>
      );
    case "saving":
      return (
        <span className={`${BASE} text-ink-secondary`} aria-live="polite">
          保存中…
        </span>
      );
    case "saved":
      return (
        <span className={`${BASE} text-success`} aria-live="polite">
          保存しました
        </span>
      );
    case "error":
      return (
        <span
          className={`${BASE} text-error`}
          aria-live="assertive"
          role="alert"
        >
          自動保存に失敗: {displayError(status.error)}
        </span>
      );
  }
}
