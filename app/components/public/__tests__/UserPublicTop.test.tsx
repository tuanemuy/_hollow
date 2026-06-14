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
 * The three cached loaders share a single `serverData` stub, but the loader is
 * identified by the usecase module it imports (the `loadModule` first argument
 * of `serverData(loadModule, run)`), not by the runtime argument shape. Each
 * `loadProfile` / `loadNotes` / `loadPublicTags` is keyed by its module's named
 * export, so a per-loader error can be injected without ambiguity and AC-4 can
 * be verified as a distinct "profile resolves, notes empty, tags resolve" state.
 */

const user = {
  id: "01930000-0000-7000-8000-0000000000aa",
  username: "tuanemuy",
  displayName: "Tuanemuy",
  bio: null,
  createdAt: "2026-01-01T00:00:00.000Z",
};

// When set, the matching loader branch of the stub rejects with it. Keyed per
// loader so NotFound from `loadProfile` and a non-NotFound from `loadNotes` can
// be exercised independently (W-001 / W-002).
let profileError: unknown = null;
let notesError: unknown = null;
let tagsError: unknown = null;
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
  // `serverData(loadModule, run)`: identify the loader by the usecase module it
  // imports (the named export it carries), so each loader resolves/rejects
  // independently instead of guessing from the runtime argument shape (W-001).
  serverData:
    (loadModule: () => Promise<Record<string, unknown>>) =>
    async (): Promise<unknown> => {
      const module = await loadModule();
      if ("getPublicProfile" in module) {
        // loadProfile(username)
        if (profileError !== null) throw profileError;
        return { user, publicNoteCount, tagNames: allTags };
      }
      if ("listUserPublicNotes" in module) {
        // loadNotes({ username, page, limit, ... })
        if (notesError !== null) throw notesError;
        return { notes, total };
      }
      // listUserPublicTags(username)
      if (tagsError !== null) throw tagsError;
      return { user, publicNoteCount, tagNames: allTags };
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
  it("returns ErrorPage kind=notFound (not a throw) when loadProfile is NotFound", async () => {
    // NotFound originates specifically from loadProfile (the user lookup) —
    // the AC-4 论拠 that 404 is sourced from the profile loader, not notes/tags.
    profileError = new NotFoundError("user_not_found", "User not found");
    notesError = null;
    tagsError = null;

    const element = await UserPublicTop(props);
    const html = renderToStaticMarkup(element);

    expect(html).toContain("ページが見つかりません");
    expect(html).toContain("Error code: 404 Not Found");
  });

  it("re-throws non-NotFound errors that originate from loadProfile", async () => {
    profileError = new Error("boom");
    notesError = null;
    tagsError = null;

    await expect(UserPublicTop(props)).rejects.toThrow("boom");
  });

  it("re-throws non-NotFound errors that originate from loadNotes", async () => {
    // listUserPublicNotes can reject with a non-NotFound (e.g. BusinessRuleError
    // for an invalid sort/period) even for a real user. The merged Promise.all
    // catch must re-throw it from the object-arg loader too (W-002).
    profileError = null;
    notesError = new Error("invalid sort");
    tagsError = null;

    await expect(UserPublicTop(props)).rejects.toThrow("invalid sort");
  });

  it("does not render the notFound page for a real user with zero notes", async () => {
    // Distinct state: profile resolves, notes is empty, tags resolves — so AC-4
    // (a real, note-less user is not mistaken for a 404) is verified without any
    // loader sharing a branch (W-001 / N-001).
    profileError = null;
    notesError = null;
    tagsError = null;
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
