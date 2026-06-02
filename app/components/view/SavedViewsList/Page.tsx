import { loadDirectoryTreeFlat } from "@/components/note/loaders";
import { loadTagsForOwner } from "@/components/tag/loaders";
import { requireCurrentUser } from "@/lib/server/currentUser";
import { SavedViewsList } from "./index";
import { loadSavedViews } from "./loader";
import { NewViewButton } from "./NewViewButton";

/**
 * `kind` prop は現状未使用。このページは個人ビュー・共有ビューを常に両方表示する
 * （`kind` ベースのタブ切替は本 Issue のスコープ外）。ルートが依然 `kind` を渡すため、
 * 後方互換として prop シグネチャは維持する。
 */
export async function SavedViewsListPage({
  kind: _kind,
}: {
  kind: "personal" | "public";
}) {
  const user = await requireCurrentUser();
  const [{ views: personal }, { views: shared }, { flat }, { tags }] =
    await Promise.all([
      loadSavedViews({ actorUserId: user.id, kind: "personal" }),
      loadSavedViews({ actorUserId: user.id, kind: "public" }),
      loadDirectoryTreeFlat({ actorUserId: user.id }),
      loadTagsForOwner(user.id),
    ]);

  const tagOptions = tags.map((tag) => ({
    id: tag.id as unknown as string,
    name: tag.name,
  }));

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
        <NewViewButton directories={flat} tags={tagOptions} />
      </div>

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
    </main>
  );
}
