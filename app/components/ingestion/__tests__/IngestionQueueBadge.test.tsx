// @vitest-environment happy-dom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  serverFnChainStub,
  useServerFnRouter,
} from "@/components/_test-utils/serverFnMock";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const getCountMock = vi.fn();

vi.mock("@tanstack/react-start", () => ({
  useServerFn: useServerFnRouter([[getCountMock, getCountMock]], vi.fn()),
  createMiddleware: () => serverFnChainStub(),
  createServerFn: () => serverFnChainStub(),
}));

vi.mock("../actions", () => ({
  getIngestionQueueCountFn: getCountMock,
}));

// The real bus is used so the notify → refetch wiring is exercised end to
// end; `resetIngestionQueueBusForTest` prevents subscriber residue.
const { IngestionQueueBadge, uploadButtonLabel, useIngestionQueueCount } =
  await import("../IngestionQueueBadge");
const { notifyIngestionQueueChanged, resetIngestionQueueBusForTest } =
  await import("../queueBadgeBus");

function BadgeHarness() {
  const count = useIngestionQueueCount();
  return (
    <button type="button" aria-label={uploadButtonLabel(count)} data-harness="">
      <IngestionQueueBadge count={count} />
    </button>
  );
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  getCountMock.mockReset();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  resetIngestionQueueBusForTest();
});

async function flush() {
  for (let i = 0; i < 10; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

const chip = () => document.body.querySelector("[data-queue-badge]");

describe("IngestionQueueBadge", () => {
  it("shows the chip and a count-aware label when the count is positive", async () => {
    getCountMock.mockResolvedValue({ count: 3 });
    act(() => {
      root.render(<BadgeHarness />);
    });
    await flush();

    expect(chip()?.textContent).toBe("3");
    expect(
      document.body.querySelector("[data-harness]")?.getAttribute("aria-label"),
    ).toBe("アップロード（未処理 3 件）");
  });

  it("hides the chip at 0 and keeps the plain label", async () => {
    getCountMock.mockResolvedValue({ count: 0 });
    act(() => {
      root.render(<BadgeHarness />);
    });
    await flush();

    expect(chip()).toBeNull();
    expect(
      document.body.querySelector("[data-harness]")?.getAttribute("aria-label"),
    ).toBe("アップロード");
  });

  it("re-fetches and updates on notifyIngestionQueueChanged", async () => {
    getCountMock
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 4 });
    act(() => {
      root.render(<BadgeHarness />);
    });
    await flush();
    expect(chip()?.textContent).toBe("1");

    await act(async () => {
      notifyIngestionQueueChanged();
    });
    await flush();

    expect(getCountMock).toHaveBeenCalledTimes(2);
    expect(chip()?.textContent).toBe("4");
  });

  it("silently hides the chip when the fetch fails", async () => {
    getCountMock.mockRejectedValue(new Error("boom"));
    act(() => {
      root.render(<BadgeHarness />);
    });
    await flush();
    expect(chip()).toBeNull();
  });

  it("caps the visible count at 99+", async () => {
    getCountMock.mockResolvedValue({ count: 120 });
    act(() => {
      root.render(<BadgeHarness />);
    });
    await flush();
    expect(chip()?.textContent).toBe("99+");
  });
});
