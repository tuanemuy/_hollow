import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { SerializedError } from "@/core/presentation/errorResponse";

/**
 * Issue #544: locks the P33 follow-up behaviours on the pure gate view.
 * - expired/gone (`share_link_revoked` / `notFound`) renders the「トップへ戻る」
 *   CTA pointing home, and drops the password form.
 * - lockout (`share_link_locked`) renders the「案D」alert as `role="status"`
 *   with the warning icon + body (not a filled-background banner).
 * - password mismatch (`share_link_password_invalid`) keeps the inline error.
 */

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    ...rest
  }: {
    children?: React.ReactNode;
    to?: string;
  } & Record<string, unknown>) => {
    const { search, ...attrs } = rest as Record<string, unknown>;
    void search;
    return (
      <a href={typeof to === "string" ? to : undefined} {...attrs}>
        {children}
      </a>
    );
  },
}));

const { ShareLinkGateView } = await import("../index");

function render(error: SerializedError | null): string {
  return renderToStaticMarkup(
    <ShareLinkGateView
      state={{ error, unlocked: null }}
      formAction={() => {}}
      isPending={false}
    />,
  );
}

describe("ShareLinkGateView STATE3 (expired / gone)", () => {
  it("renders the「トップへ戻る」CTA pointing home for share_link_revoked", () => {
    const html = render({
      kind: "business",
      code: "share_link_revoked",
      message: "revoked",
    });

    expect(html).toContain("トップへ戻る");
    expect(html).toContain('href="/"');
    expect(html).toContain('data-primary=""');
    expect(html).toContain("リンクは無効です");
    // The password form must be gone in the expired/gone state.
    expect(html).not.toContain("<form");
  });

  it("renders the「トップへ戻る」CTA for notFound", () => {
    const html = render({ kind: "notFound", code: null, message: "missing" });
    expect(html).toContain("トップへ戻る");
    expect(html).toContain('href="/"');
    expect(html).not.toContain("<form");
  });
});

describe("ShareLinkGateView lockout (案D alert)", () => {
  it("renders a role=status warning alert with icon and body", () => {
    const html = render({
      kind: "business",
      code: "share_link_locked",
      message: "locked",
    });

    expect(html).toContain('role="status"');
    expect(html).toContain("<svg");
    expect(html).toContain(
      "試行回数の上限に達しました。しばらく時間をおいて再度お試しください。",
    );
    // 案D is a white-surface bordered box (bg-bg), not a filled banner.
    expect(html).not.toContain('bg-warning-surface" role="status"');
    expect(html).toContain("bg-bg");
    // Lockout keeps the gate available (no expired CTA, form still present).
    expect(html).not.toContain("トップへ戻る");
    expect(html).toContain("<form");
  });
});

describe("ShareLinkGateView password mismatch (regression)", () => {
  it("renders an inline error and keeps the form", () => {
    const html = render({
      kind: "business",
      code: "share_link_password_invalid",
      message: "invalid",
    });

    expect(html).toContain("<form");
    expect(html).not.toContain('role="status"');
    expect(html).toContain('role="alert"');
    expect(html).toContain("パスワードが正しくありません。");
  });
});
