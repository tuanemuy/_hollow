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
const { useIngestionQueueCount, uploadQueueLabel } = await import(
  "../useIngestionQueueCount"
);
const { notifyIngestionQueueChanged, resetIngestionQueueBusForTest } =
  await import("../queueBadgeBus");

// Thin harness: exposes the hook's count via a data attribute so the tests
// assert the hook's data contract without coupling to any view component.
function CountHarness() {
  const count = useIngestionQueueCount();
  return <span data-count={count} />;
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

const count = () =>
  document.body.querySelector("[data-count]")?.getAttribute("data-count");

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

describe("useIngestionQueueCount", () => {
  it("exposes the fetched count", async () => {
    getCountMock.mockResolvedValue({ count: 3 });
    act(() => {
      root.render(<CountHarness />);
    });
    await flush();

    expect(count()).toBe("3");
  });

  it("re-fetches and updates on notifyIngestionQueueChanged", async () => {
    getCountMock
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 4 });
    act(() => {
      root.render(<CountHarness />);
    });
    await flush();
    expect(count()).toBe("1");

    await act(async () => {
      notifyIngestionQueueChanged();
    });
    await flush();

    expect(getCountMock).toHaveBeenCalledTimes(2);
    expect(count()).toBe("4");
  });

  // ADR-002: visibility restore is the only background catch-up path in
  // lieu of a standing poll, so the hidden→visible transition must re-fetch.
  it("re-fetches and updates on visibilitychange back to visible", async () => {
    getCountMock
      .mockResolvedValueOnce({ count: 2 })
      .mockResolvedValueOnce({ count: 5 });
    act(() => {
      root.render(<CountHarness />);
    });
    await flush();
    expect(count()).toBe("2");

    await dispatchVisibility("visible");
    await flush();

    expect(getCountMock).toHaveBeenCalledTimes(2);
    expect(count()).toBe("5");
  });

  it("does not re-fetch on visibilitychange while hidden", async () => {
    getCountMock.mockResolvedValue({ count: 2 });
    act(() => {
      root.render(<CountHarness />);
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
      root.render(<CountHarness />);
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

  it("stays at 0 when the initial fetch fails", async () => {
    getCountMock.mockRejectedValue(new Error("boom"));
    act(() => {
      root.render(<CountHarness />);
    });
    await flush();
    expect(count()).toBe("0");
  });

  // Spec pin: a refresh failure after a prior success holds the previous
  // count rather than flashing to 0 — a transient error must not wipe an
  // already-correct count. Only first-mount failures stay at 0.
  it("holds the previous count when a refresh fails after a prior success", async () => {
    getCountMock
      .mockResolvedValueOnce({ count: 3 })
      .mockRejectedValueOnce(new Error("boom"));
    act(() => {
      root.render(<CountHarness />);
    });
    await flush();
    expect(count()).toBe("3");

    await act(async () => {
      notifyIngestionQueueChanged();
    });
    await flush();

    expect(getCountMock).toHaveBeenCalledTimes(2);
    expect(count()).toBe("3");
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
      root.render(<CountHarness />);
    });
    await flush();
    expect(count()).toBe("0");

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
    expect(count()).toBe("4");

    // Older request resolves later — must be discarded, count stays 4.
    await act(async () => {
      oldReq.resolve(1);
    });
    await flush();
    expect(count()).toBe("4");
  });
});

// Exercise the real `uploadQueueLabel` (AC-4 の単一の真実点): mock 側で文言を
// 複製する UploadNavItem.test.tsx では実関数が走らないため、ここで実物を固定する。
describe("uploadQueueLabel", () => {
  it("includes the unprocessed count when positive", () => {
    expect(uploadQueueLabel(3)).toBe("アップロード（未処理 3 件）");
  });

  it("omits the count when zero", () => {
    expect(uploadQueueLabel(0)).toBe("アップロード");
  });
});
