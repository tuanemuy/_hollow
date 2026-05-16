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

export function AutosaveIndicator({ status }: AutosaveIndicatorProps) {
  switch (status.kind) {
    case "idle":
      return (
        <span className="autosave-indicator autosave-idle" aria-live="polite">
          自動保存はオフ
        </span>
      );
    case "dirty":
      return (
        <span className="autosave-indicator autosave-dirty" aria-live="polite">
          未保存の変更があります
        </span>
      );
    case "saving":
      return (
        <span className="autosave-indicator autosave-saving" aria-live="polite">
          保存中…
        </span>
      );
    case "saved":
      return (
        <span className="autosave-indicator autosave-saved" aria-live="polite">
          保存しました
        </span>
      );
    case "error":
      return (
        <span
          className="autosave-indicator autosave-error"
          aria-live="assertive"
          role="alert"
        >
          自動保存に失敗: {displayError(status.error)}
        </span>
      );
  }
}
