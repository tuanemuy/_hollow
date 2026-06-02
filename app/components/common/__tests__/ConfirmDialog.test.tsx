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

  it("does not own close: panel mount tracks `open` only, independent of error", () => {
    // Contract: ConfirmDialog never closes itself in response to `error`.
    // The caller owns the open/close lifecycle (Issue #98 ADR-001), so an
    // `error` arriving — and persisting across re-renders — must not drop
    // the panel. Mount is a pure function of `open`.
    const renderWith = (props: { open: boolean; error?: SerializedError }) => {
      act(() => {
        root.render(
          <ConfirmDialog
            open={props.open}
            title="削除しますか？"
            description="この操作は取り消せません。"
            {...(props.error !== undefined ? { error: props.error } : {})}
            onConfirm={() => {}}
            onClose={() => {}}
          />,
        );
      });
    };

    // open + error → panel present with the alert inside it.
    renderWith({ open: true, error: SYSTEM_ERROR });
    expect(document.body.querySelector('[role="alertdialog"]')).not.toBeNull();
    expect(getPanel().querySelector('[role="alert"]')).not.toBeNull();

    // Re-render with the *same* open + error: ConfirmDialog has no internal
    // open state to flip, so the panel must still be mounted (it does not
    // self-close on a persisted error).
    renderWith({ open: true, error: SYSTEM_ERROR });
    expect(document.body.querySelector('[role="alertdialog"]')).not.toBeNull();

    // Mount is decided by `open` alone: open + no error is still mounted…
    renderWith({ open: true });
    expect(document.body.querySelector('[role="alertdialog"]')).not.toBeNull();
    expect(getPanel().querySelector('[role="alert"]')).toBeNull();

    // …and closing is driven only by `open=false`, even while an error is
    // still supplied. ConfirmDialog does not own (and cannot trigger) close.
    renderWith({ open: false, error: SYSTEM_ERROR });
    expect(document.body.querySelector('[role="alertdialog"]')).toBeNull();
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

    // Order-independent: resolve each referenced id to its element, then
    // assert the *set* — exactly one points at the alert region and one at
    // the (role-less) description. Decoupled from the id ordering so a swap
    // does not fail this test for the wrong reason (T-W-002).
    const referenced = ids.map((id) =>
      panel.querySelector(`#${CSS.escape(id)}`),
    );
    expect(referenced.every((el) => el !== null)).toBe(true);

    const alertEls = referenced.filter(
      (el) => el?.getAttribute("role") === "alert",
    );
    const descEls = referenced.filter(
      (el) => el !== null && el.getAttribute("role") === null,
    );
    expect(alertEls).toHaveLength(1);
    expect(descEls).toHaveLength(1);
    expect(alertEls[0]?.textContent).toBe(SYSTEM_ERROR_TEXT);
    expect(descEls[0]?.textContent).toBe("この操作は取り消せません。");
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
