// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  serverFnChainStub,
  useServerFnRouter,
} from "@/components/_test-utils/serverFnMock";
import { AppServerError } from "@/core/presentation/errorResponse";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@tanstack/react-start", () => ({
  useServerFn: useServerFnRouter([], vi.fn()),
  createMiddleware: () => serverFnChainStub(),
  createServerFn: () => serverFnChainStub(),
}));

const routerInvalidate = vi.fn().mockResolvedValue(undefined);
vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ invalidate: routerInvalidate }),
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  routerInvalidate.mockReset().mockResolvedValue(undefined);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function submitForm() {
  const btn = Array.from(
    document.body.querySelectorAll<HTMLButtonElement>('button[type="submit"]'),
  ).find((b) => {
    const t = (b.textContent ?? "").trim();
    return t === "作成" || t === "保存" || t.includes("保存中");
  });
  if (!btn) throw new Error("submit button not found");
  btn.click();
}

async function renderCreate(opts: {
  submit: (arg: { data: unknown }) => Promise<unknown>;
  onClose: () => void;
}) {
  const { ViewFormDialog } = await import("../ViewFormDialog");
  act(() => {
    root.render(
      <ViewFormDialog
        mode="create"
        open
        onClose={opts.onClose}
        directories={[]}
        tags={[]}
        submit={opts.submit}
      />,
    );
  });
}

function fillName(value: string) {
  const input =
    document.body.querySelector<HTMLInputElement>('input[type="text"]');
  if (!input) throw new Error("name input not found");
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("ViewFormDialog — submit close ordering", () => {
  it("calls onClose on submit success before/around invalidate", async () => {
    const submit = vi.fn().mockResolvedValue({ ok: true });
    const onClose = vi.fn();

    await renderCreate({ submit, onClose });
    fillName("My View");

    await act(async () => {
      submitForm();
    });
    await flush();

    expect(submit).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(routerInvalidate).toHaveBeenCalledTimes(1);
    // onClose must fire no later than invalidate (close does not wait on
    // the loader round-trip — Issue #414 ADR-004).
    const closeOrder =
      onClose.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY;
    const invalidateOrder =
      routerInvalidate.mock.invocationCallOrder[0] ?? Number.NEGATIVE_INFINITY;
    expect(closeOrder).toBeLessThan(invalidateOrder);
  });

  it("closes without waiting for the loader re-fetch (invalidate detached)", async () => {
    // invalidate never resolves; the close must not depend on it (ADR-004).
    routerInvalidate.mockReset().mockReturnValue(new Promise(() => {}));
    const submit = vi.fn().mockResolvedValue({ ok: true });
    const onClose = vi.fn();

    await renderCreate({ submit, onClose });
    fillName("My View");

    await act(async () => {
      submitForm();
    });
    await flush();

    expect(submit).toHaveBeenCalledTimes(1);
    expect(routerInvalidate).toHaveBeenCalledTimes(1);
    // onClose still fires even though invalidate is pending forever.
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not call onClose and shows an alert when submit fails", async () => {
    const submit = vi.fn().mockRejectedValue(
      new AppServerError({
        kind: "system",
        code: null,
        message: "System error",
      }),
    );
    const onClose = vi.fn();

    await renderCreate({ submit, onClose });
    fillName("My View");

    await act(async () => {
      submitForm();
    });
    await flush();

    expect(submit).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    expect(routerInvalidate).not.toHaveBeenCalled();
    const alerts = Array.from(
      document.body.querySelectorAll('[role="alert"]'),
    ).map((el) => el.textContent ?? "");
    expect(alerts.join(" ")).toContain("システムエラーが発生しました");
  });
});
