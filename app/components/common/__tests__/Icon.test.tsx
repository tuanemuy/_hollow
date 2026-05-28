// @vitest-environment happy-dom

import { Search } from "lucide-react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Icon } from "../Icon";

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

function getSvg(): SVGSVGElement {
  const svg = container.querySelector("svg");
  if (svg === null) throw new Error("svg not rendered");
  return svg;
}

describe("Icon", () => {
  it("renders the lucide SVG with aria-hidden when no label is provided", () => {
    act(() => {
      root.render(<Icon icon={Search} />);
    });
    const svg = getSvg();
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("aria-label")).toBeNull();
    expect(svg.getAttribute("role")).toBeNull();
  });

  it("exposes role=img and aria-label when label is provided", () => {
    act(() => {
      root.render(<Icon icon={Search} label="検索" />);
    });
    const svg = getSvg();
    expect(svg.getAttribute("role")).toBe("img");
    expect(svg.getAttribute("aria-label")).toBe("検索");
    expect(svg.getAttribute("aria-hidden")).toBeNull();
  });

  it("defaults to size 16 and applies it to width/height", () => {
    act(() => {
      root.render(<Icon icon={Search} />);
    });
    const svg = getSvg();
    expect(svg.getAttribute("width")).toBe("16");
    expect(svg.getAttribute("height")).toBe("16");
  });

  it.each([
    16, 20, 24,
  ] as const)("applies size %i to both width and height", (size) => {
    act(() => {
      root.render(<Icon icon={Search} size={size} />);
    });
    const svg = getSvg();
    expect(svg.getAttribute("width")).toBe(String(size));
    expect(svg.getAttribute("height")).toBe(String(size));
  });

  it("forwards className for color inheritance", () => {
    act(() => {
      root.render(<Icon icon={Search} className="text-ink-tertiary" />);
    });
    const svg = getSvg();
    expect(svg.getAttribute("class")).toContain("text-ink-tertiary");
  });

  it("uses strokeWidth=1.5 by default", () => {
    act(() => {
      root.render(<Icon icon={Search} />);
    });
    const svg = getSvg();
    expect(svg.getAttribute("stroke-width")).toBe("1.5");
  });
});
