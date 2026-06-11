// @vitest-environment happy-dom

/**
 * Aria contract for every Suspense-fallback skeleton (#636 TS-W-001):
 * each announcing skeleton owns exactly one `role="status"` region with
 * `aria-live="polite"` + `aria-busy="true"`, and its visual placeholder DOM
 * is `aria-hidden`. `ToolbarSkeleton` is the documented asymmetry — it is
 * decorative-only (`aria-hidden`, no status region) so the home page does
 * not stack a third "読み込み中" announcement.
 */

import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NoteDetailSkeleton } from "@/components/note/detail/NoteDetailSkeleton";
import {
  FilterBarSkeleton,
  NoteListSkeleton,
  ToolbarSkeleton,
} from "@/components/note/list/skeletons";
import { AdminTableSkeleton } from "../AdminTableSkeleton";
import { FormSkeleton } from "../FormSkeleton";
import { ListPageSkeleton } from "../ListPageSkeleton";

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
});

function render(element: ReactElement): void {
  act(() => {
    root.render(element);
  });
}

const announcingSkeletons: ReadonlyArray<readonly [string, ReactElement]> = [
  ["AdminTableSkeleton", <AdminTableSkeleton key="a" />],
  ["FormSkeleton", <FormSkeleton key="f" />],
  ["ListPageSkeleton", <ListPageSkeleton key="l" />],
  ["NoteDetailSkeleton", <NoteDetailSkeleton key="n" />],
  ["FilterBarSkeleton", <FilterBarSkeleton key="fb" />],
  ["NoteListSkeleton", <NoteListSkeleton key="nl" />],
];

describe("skeleton aria contract (#636 TS-W-001)", () => {
  it.each(
    announcingSkeletons,
  )("%s owns a single status region with aria-busy / aria-live and hides its bars", (_name, element) => {
    render(element);

    const statuses = container.querySelectorAll('[role="status"]');
    expect(statuses.length).toBe(1);

    const status = statuses[0] as HTMLElement;
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.getAttribute("aria-busy")).toBe("true");
    expect(status.getAttribute("aria-label")).toBeTruthy();

    // Every placeholder bar/pill sits under an aria-hidden wrapper so the
    // status region is the only thing screen readers announce.
    for (const pulse of container.querySelectorAll(
      '[class*="animate-pulse"]',
    )) {
      expect(
        pulse.closest('[aria-hidden="true"]'),
        "pulsing placeholder must be inside aria-hidden",
      ).not.toBeNull();
    }
  });

  it("ToolbarSkeleton is decorative only (aria-hidden, no status region)", () => {
    render(<ToolbarSkeleton />);

    expect(container.querySelector('[role="status"]')).toBeNull();
    const rootEl = container.firstElementChild;
    expect(rootEl?.getAttribute("aria-hidden")).toBe("true");
  });
});
