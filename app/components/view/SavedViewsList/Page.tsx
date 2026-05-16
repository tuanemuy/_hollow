import { requireCurrentUser } from "@/lib/server/currentUser";
import { SavedViewsList } from "./index";
import { loadSavedViews } from "./loader";

export async function SavedViewsListPage({
  kind,
}: {
  kind: "personal" | "public";
}) {
  const user = await requireCurrentUser();
  const { views: personal } = await loadSavedViews({
    actorUserId: user.id,
    kind: "personal",
  });
  const { views: shared } = await loadSavedViews({
    actorUserId: user.id,
    kind: "public",
  });

  return (
    <main>
      <h1>保存ビュー</h1>
      <section>
        <h2>個人ビュー</h2>
        <SavedViewsList views={personal} />
      </section>
      <section>
        <h2>共有ビュー</h2>
        <SavedViewsList views={shared} />
      </section>
      <p>表示中タブ: {kind === "personal" ? "個人" : "共有"}</p>
    </main>
  );
}
