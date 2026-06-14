import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { NotFoundError } from "@/core/application/errors";

/**
 * Issue #599: `UserPublicTop` is rendered as an RSC via `renderServerComponent`,
 * where `throw notFound()` does not reach the route's `notFoundComponent`. Lock
 * that a missing user resolves to `<ErrorPage kind="notFound" />` directly (not
 * the generic error boundary), that unrelated errors re-throw, and that a real
 * user with zero notes is NOT mistaken for a 404.
 *
 * The three cached loaders share a single `serverData` stub that branches on
 * the runtime argument shape: `loadProfile`/`loadPublicTags` get a `username`
 * string, `loadNotes` gets a `{ username, page, limit, ... }` object.
 */

const user = {
  id: "01930000-0000-7000-8000-0000000000aa",
  username: "tuanemuy",
  displayName: "Tuanemuy",
  bio: null,
  createdAt: "2026-01-01T00:00:00.000Z",
};

// When set, the loadProfile branch of the stub rejects with it.
let profileError: unknown = null;
let notes: Array<{
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  tagNames: string[];
  updatedAt: string;
  publishedAt: string | null;
}> = [];
let total = 0;
let publicNoteCount = 0;
let allTags: string[] = [];

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    params,
    children,
    className,
  }: {
    to: string;
    params?: Record<string, string>;
    children: React.ReactNode;
    className?: string;
  }) => {
    const href = Object.entries(params ?? {}).reduce(
      (acc, [key, value]) => acc.replace(`$${key}`, value),
      to,
    );
    return (
      <a href={href} className={className}>
        {children}
      </a>
    );
  },
  useRouter: () => ({ history: { back: () => {} } }),
}));

vi.mock("@/core/presentation/serverAction", () => ({
  serverData:
    () =>
    async (arg: unknown): Promise<unknown> => {
      if (typeof arg === "string") {
        // loadProfile(username) or loadPublicTags(username)
        if (profileError !== null) throw profileError;
        return { user, publicNoteCount, tagNames: allTags };
      }
      // loadNotes({ username, page, limit, ... })
      return { notes, total };
    },
}));

vi.mock("../PublicLayout", () => ({
  PublicLayout: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  avatarInitials: (value: string) => value.slice(0, 1).toUpperCase(),
}));

vi.mock("../PublicTopControls", () => ({ PublicTopControls: () => null }));
vi.mock("../PublicNoteViews", () => ({ PublicNoteViews: () => null }));

const { UserPublicTop } = await import("../UserPublicTop");

const props = {
  username: "tuanemuy",
  page: 1,
  limit: 20,
};

describe("UserPublicTop notFound handling", () => {
  it("returns ErrorPage kind=notFound (not a throw) when the user is NotFound", async () => {
    profileError = new NotFoundError("user_not_found", "User not found");

    const element = await UserPublicTop(props);
    const html = renderToStaticMarkup(element);

    expect(html).toContain("ページが見つかりません");
    expect(html).toContain("Error code: 404 Not Found");
  });

  it("re-throws errors that are not NotFoundError", async () => {
    profileError = new Error("boom");

    await expect(UserPublicTop(props)).rejects.toThrow("boom");
  });

  it("does not render the notFound page for a real user with zero notes", async () => {
    profileError = null;
    publicNoteCount = 0;
    notes = [];
    total = 0;
    allTags = [];

    const element = await UserPublicTop(props);
    const html = renderToStaticMarkup(element);

    expect(html).not.toContain("ページが見つかりません");
    expect(html).toContain("公開されているノートはまだありません。");
  });
});
