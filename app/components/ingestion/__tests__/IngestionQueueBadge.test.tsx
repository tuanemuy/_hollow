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
  setVisibility("visible");
});

async function flush() {
  for (let i = 0; i < 10; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

const chip = () => document.body.querySelector("[data-queue-badge]");

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
}

async function dispatchVisibility(state: "visible" | "hidden") {
  setVisibility(state);
  await act(async () => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

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

  // ADR-002: visibility restore is the only background catch-up path in
  // lieu of a standing poll, so the hidden→visible transition must re-fetch.
  it("re-fetches and updates on visibilitychange back to visible", async () => {
    getCountMock
      .mockResolvedValueOnce({ count: 2 })
      .mockResolvedValueOnce({ count: 5 });
    act(() => {
      root.render(<BadgeHarness />);
    });
    await flush();
    expect(chip()?.textContent).toBe("2");

    await dispatchVisibility("visible");
    await flush();

    expect(getCountMock).toHaveBeenCalledTimes(2);
    expect(chip()?.textContent).toBe("5");
  });

  it("does not re-fetch on visibilitychange while hidden", async () => {
    getCountMock.mockResolvedValue({ count: 2 });
    act(() => {
      root.render(<BadgeHarness />);
    });
    await flush();
    expect(getCountMock).toHaveBeenCalledTimes(1);

    await dispatchVisibility("hidden");
    await flush();

    expect(getCountMock).toHaveBeenCalledTimes(1);
  });

  it("does not re-fetch on visibilitychange or notify after unmount", async () => {
    getCountMock.mockResolvedValue({ count: 2 });
    act(() => {
      root.render(<BadgeHarness />);
    });
    await flush();
    expect(getCountMock).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });
    // Re-arm `root` so the shared afterEach unmount targets a live root.
    root = createRoot(container);

    await dispatchVisibility("visible");
    await act(async () => {
      notifyIngestionQueueChanged();
    });
    await flush();

    expect(getCountMock).toHaveBeenCalledTimes(1);
  });

  it("silently hides the chip when the fetch fails", async () => {
    getCountMock.mockRejectedValue(new Error("boom"));
    act(() => {
      root.render(<BadgeHarness />);
    });
    await flush();
    expect(chip()).toBeNull();
  });

  // Spec pin: a refresh failure after a prior success resets the count to 0
  // (chip hidden) rather than keeping the stale value — "fetch failure
  // silently disappears" applies to every fetch, not only the first.
  it("resets the count to 0 when a refresh fails after a prior success", async () => {
    getCountMock
      .mockResolvedValueOnce({ count: 3 })
      .mockRejectedValueOnce(new Error("boom"));
    act(() => {
      root.render(<BadgeHarness />);
    });
    await flush();
    expect(chip()?.textContent).toBe("3");

    await act(async () => {
      notifyIngestionQueueChanged();
    });
    await flush();

    expect(getCountMock).toHaveBeenCalledTimes(2);
    expect(chip()).toBeNull();
  });

  // Generation guard (seq/mySeq): when an earlier request resolves *after* a
  // later one, the stale earlier response must not overwrite the newer count.
  it("discards a stale earlier response that resolves after a newer one", async () => {
    type Deferred = {
      promise: Promise<{ count: number }>;
      resolve: (count: number) => void;
    };
    const defer = (): Deferred => {
      let resolve!: (count: number) => void;
      const promise = new Promise<{ count: number }>((res) => {
        resolve = (count: number) => res({ count });
      });
      return { promise, resolve };
    };

    // 1st fetch (mount) resolves immediately to 0 so the harness settles.
    // 2nd fetch = the "old" request (count 1), 3rd = the "new" request
    // (count 4). We resolve the new one first, then the old one.
    const oldReq = defer();
    const newReq = defer();
    getCountMock
      .mockResolvedValueOnce({ count: 0 })
      .mockReturnValueOnce(oldReq.promise)
      .mockReturnValueOnce(newReq.promise);

    act(() => {
      root.render(<BadgeHarness />);
    });
    await flush();
    expect(chip()).toBeNull();

    // Fire two notifies back to back — two in-flight requests, newer wins seq.
    await act(async () => {
      notifyIngestionQueueChanged();
      notifyIngestionQueueChanged();
    });

    // Newer request resolves first.
    await act(async () => {
      newReq.resolve(4);
    });
    await flush();
    expect(chip()?.textContent).toBe("4");

    // Older request resolves later — must be discarded, count stays 4.
    await act(async () => {
      oldReq.resolve(1);
    });
    await flush();
    expect(chip()?.textContent).toBe("4");
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
