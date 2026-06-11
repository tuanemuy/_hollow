import { Suspense } from "react";
import { ListPageSkeleton } from "@/components/common/ListPageSkeleton";
import { SectionErrorBoundary } from "@/components/common/SectionErrorBoundary";
import { SKELETON_PILL } from "@/components/common/styles";
import { loadDirectoryTreeFlat } from "@/components/note/loaders";
import { loadTagsForOwner } from "@/components/tag/loaders";
import { SavedViewsList } from "./index";
import { loadSavedViews } from "./loader";
import { NewViewButton } from "./NewViewButton";

// Decorative only (`aria-hidden`): the list boundary below already owns the
// single "読み込み中" status announcement for this page, so the button
// placeholder must not add a second one (#636 AR-W-002 / FE-W-003).
const NEW_VIEW_BUTTON_SKELETON = (
  <div aria-hidden="true" className={`h-9 w-28 ${SKELETON_PILL}`} />
);

/**
 * `kind` prop は現状未使用。このページは個人ビュー・共有ビューを常に両方表示する
 * （`kind` ベースのタブ切替は本 Issue のスコープ外）。ルートが依然 `kind` を渡すため、
 * 後方互換として prop シグネチャは維持する。
 *
 * Page shell (Issue #636): the static heading renders immediately; the
 * new-view button (needs directories + tags) and the view sections each
 * stream behind their own `<Suspense>` boundary. Shared loaders dedup
 * within the render via `cache()` (`.issue/636/adr.md` ADR-002).
 */
export function SavedViewsListPage({
  kind: _kind,
  userId,
}: {
  kind: "personal" | "public";
  userId: string;
}) {
  return (
    <main className="px-6 py-8 pb-20 mx-auto w-full max-w-[1100px] lg:px-10 lg:py-12 xl:px-16 xl:py-16 max-sm:px-4 max-sm:py-6 max-sm:pb-16">
      <div className="flex items-end justify-between gap-4 mb-8 flex-wrap">
        <div>
          <h1 className="text-3xl font-regular tracking-tightest leading-tight text-ink mb-2">
            保存ビュー
          </h1>
          <p className="text-md text-ink-secondary max-w-[56ch]">
            よく使う絞り込み条件と表示形式を保存します。サイドバーから 1
            クリックで適用できます。
          </p>
        </div>
        <SectionErrorBoundary section="新規ビュー作成">
          <Suspense fallback={NEW_VIEW_BUTTON_SKELETON}>
            <NewViewButtonSection userId={userId} />
          </Suspense>
        </SectionErrorBoundary>
      </div>

      <SectionErrorBoundary section="保存ビューの一覧">
        <Suspense
          fallback={<ListPageSkeleton ariaLabel="保存ビューを読み込み中" />}
        >
          <ViewsSection userId={userId} />
        </Suspense>
      </SectionErrorBoundary>
    </main>
  );
}

async function NewViewButtonSection({ userId }: { userId: string }) {
  const [{ flat }, { tags }] = await Promise.all([
    loadDirectoryTreeFlat({ actorUserId: userId }),
    loadTagsForOwner(userId),
  ]);
  const tagOptions = tags.map((tag) => ({ id: tag.id, name: tag.name }));
  return <NewViewButton directories={flat} tags={tagOptions} />;
}

async function ViewsSection({ userId }: { userId: string }) {
  const [{ views: personal }, { views: shared }, { flat }, { tags }] =
    await Promise.all([
      loadSavedViews({ actorUserId: userId, kind: "personal" }),
      loadSavedViews({ actorUserId: userId, kind: "public" }),
      loadDirectoryTreeFlat({ actorUserId: userId }),
      loadTagsForOwner(userId),
    ]);

  const tagOptions = tags.map((tag) => ({
    id: tag.id,
    name: tag.name,
  }));

  return (
    <>
      <section className="mb-12">
        <div className="flex items-baseline justify-between gap-3 mb-4 flex-wrap">
          <div>
            <h2 className="text-xl font-semibold tracking-tighter text-ink">
              個人ビュー
            </h2>
            <p className="text-sm text-ink-secondary max-w-[60ch] mt-0.5">
              自分専用のビュー。サイドバーに表示され、自分のみ利用できます。
            </p>
          </div>
          <span className="text-sm text-ink-tertiary tabular-nums">
            {personal.length} 件
          </span>
        </div>
        <SavedViewsList views={personal} directories={flat} tags={tagOptions} />
      </section>

      <section className="mb-12">
        <div className="flex items-baseline justify-between gap-3 mb-4 flex-wrap">
          <div>
            <h2 className="text-xl font-semibold tracking-tighter text-ink">
              共有ビュー
            </h2>
            <p className="text-sm text-ink-secondary max-w-[60ch] mt-0.5">
              公開プロフィールに表示されるビュー。読者があなたのノートを絞り込んで読めます。
            </p>
          </div>
          <span className="text-sm text-ink-tertiary tabular-nums">
            {shared.length} 件
          </span>
        </div>
        <SavedViewsList views={shared} directories={flat} tags={tagOptions} />
      </section>
    </>
  );
}
