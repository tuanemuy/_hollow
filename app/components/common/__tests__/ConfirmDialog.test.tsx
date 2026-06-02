// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SerializedError } from "@/core/presentation/errorResponse";
import { ConfirmDialog } from "../ConfirmDialog";

// Opt into React's testing-environment behavior (silences "not configured
// to support act(...)" warnings for asynchronous state commits).
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  // Mirror Dialog.test.tsx's leak detector: the body scroll-lock counter is
  // module-scope mutable state, so a missed cleanup surfaces here.
  expect(document.body.style.overflow).toBe("");
});

function getPanel(): HTMLElement {
  const panel = document.body.querySelector<HTMLElement>(
    '[role="alertdialog"]',
  );
  if (panel === null) throw new Error("panel not rendered");
  return panel;
}

// A representative `system`-kind error. `displayError` maps it to the
// fixed public message "システムエラーが発生しました".
const SYSTEM_ERROR: SerializedError = {
  kind: "system",
  code: null,
  message: "System error",
};
const SYSTEM_ERROR_TEXT = "システムエラーが発生しました";

describe("ConfirmDialog error display", () => {
  it("renders a role=alert region with the displayError text when error is set", () => {
    act(() => {
      root.render(
        <ConfirmDialog
          open={true}
          title="削除しますか？"
          description="この操作は取り消せません。"
          error={SYSTEM_ERROR}
          onConfirm={() => {}}
          onClose={() => {}}
        />,
      );
    });

    const alert = document.body.querySelector<HTMLElement>('[role="alert"]');
    expect(alert).not.toBeNull();
    expect(alert?.textContent).toBe(SYSTEM_ERROR_TEXT);
  });

  it("keeps the dialog panel mounted when error is set (does not close)", () => {
    act(() => {
      root.render(
        <ConfirmDialog
          open={true}
          title="削除しますか？"
          description="この操作は取り消せません。"
          error={SYSTEM_ERROR}
          onConfirm={() => {}}
          onClose={() => {}}
        />,
      );
    });

    const panel = getPanel();
    expect(panel).not.toBeNull();
    // The alert region lives inside the panel.
    expect(panel.querySelector('[role="alert"]')).not.toBeNull();
  });

  it("references both the description and the error ids from aria-describedby", () => {
    act(() => {
      root.render(
        <ConfirmDialog
          open={true}
          title="削除しますか？"
          description="この操作は取り消せません。"
          error={SYSTEM_ERROR}
          onConfirm={() => {}}
          onClose={() => {}}
        />,
      );
    });

    const panel = getPanel();
    const describedBy = panel.getAttribute("aria-describedby");
    expect(describedBy).not.toBeNull();

    const ids = (describedBy ?? "").split(" ").filter(Boolean);
    expect(ids).toHaveLength(2);

    // Both referenced ids must resolve to elements inside the panel: the
    // description container and the alert region.
    const descEl = panel.querySelector(`#${CSS.escape(ids[0] as string)}`);
    const alertEl = panel.querySelector(`#${CSS.escape(ids[1] as string)}`);
    expect(descEl).not.toBeNull();
    expect(alertEl).not.toBeNull();
    expect(alertEl?.getAttribute("role")).toBe("alert");
    expect(alertEl?.textContent).toBe(SYSTEM_ERROR_TEXT);
  });

  it("renders no alert region and only the description id when error is unset", () => {
    act(() => {
      root.render(
        <ConfirmDialog
          open={true}
          title="削除しますか？"
          description="この操作は取り消せません。"
          onConfirm={() => {}}
          onClose={() => {}}
        />,
      );
    });

    const panel = getPanel();
    expect(panel.querySelector('[role="alert"]')).toBeNull();

    const describedBy = panel.getAttribute("aria-describedby");
    const ids = (describedBy ?? "").split(" ").filter(Boolean);
    expect(ids).toHaveLength(1);
    expect(
      panel.querySelector(`#${CSS.escape(ids[0] as string)}`),
    ).not.toBeNull();
  });

  it("invokes onConfirm without closing when the confirm button is pressed", () => {
    const onConfirm = vi.fn();
    act(() => {
      root.render(
        <ConfirmDialog
          open={true}
          title="削除しますか？"
          confirmLabel="削除"
          error={SYSTEM_ERROR}
          onConfirm={onConfirm}
          onClose={() => {}}
        />,
      );
    });

    const confirmBtn = getPanel().querySelector<HTMLButtonElement>(
      'button[type="submit"]',
    );
    expect(confirmBtn).not.toBeNull();
    act(() => {
      confirmBtn?.click();
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
    // Panel stays mounted: ConfirmDialog does not own close-on-confirm.
    expect(document.body.querySelector('[role="alertdialog"]')).not.toBeNull();
  });
});
