/**
 * `_app` AppShell のキャッシュ制御（invalidate / clearCache）を集約するモジュール。
 *
 * 公開 API は 3 つあり、補完関係にある:
 *   - `routerInvalidate(router, filter?)`: `_app` とエディター系ルートを
 *     **常に除外** して invalidate
 *   - `appShellInvalidate(router)`: `_app` のみを **狙って** invalidate
 *     （navigate を伴わず AppShell を in-place 再評価したい場面）
 *   - `clearAppShellCache(router)`: `_app` の cached match を **clearCache で
 *     破棄** する（navigate を伴う auth 遷移の直前。in-place 再評価を起こさない）
 *
 * AppShell loader (`_app.loader`) の `staleTime: Infinity` を mutation 後にも
 * 維持しつつ、セッション失効・errorComponent retry など「navigate を伴わず
 * AppShell を再評価したい」場面では `appShellInvalidate` を、
 * ログイン/ログアウト/リセット確認/退会など「navigate を伴う auth 遷移の直前に
 * AppShell を破棄したい」場面では `clearAppShellCache` を使う、という意味分担で
 * routeId のリネームにも 1 ファイル / 1 定数で追従できる。
 *
 * `.issue/293/adr.md` ADR-010 / `.issue/299/adr.md` / `.issue/300/adr.md`
 * ADR-005 / `.issue/728/adr.md` ADR-001 を参照。
 */
import type { AnyRouter } from "@tanstack/react-router";

const APP_SHELL_ROUTE_ID = "/_app";

/**
 * Editor routes are excluded from `routerInvalidate` unconditionally
 * (`.issue/669/adr.md` ADR-003): their loaders only seed the
 * editor's initial values — after mount the source of truth is the
 * editor's local state — so re-running the loader has no benefit and, at
 * worst, may destroy in-progress edits.
 * Both routes use `staleTime: 0`, so the next navigation into an
 * editor always fresh-loads; skipping invalidation cannot serve stale data.
 *
 * Note the loaders also supply auxiliary display data (e.g. the directory
 * `tree` fed to `DirectoryPicker`), which is therefore frozen while the
 * editor stays mounted — `routerInvalidate`-driven mutations elsewhere
 * (e.g. UploadDialog ingestion) won't refresh the picker's options until
 * the next navigation into the editor. Directory mutations launched from
 * inside the editor use the raw `router.invalidate()` (rule 2) and do
 * refresh. Keep this freeze in mind before growing the editor loaders.
 */
const EDITOR_ROUTE_IDS: readonly string[] = [
  "/_app/notes/$noteId/edit",
  "/_app/notes/new",
];

type InvalidateOpts = NonNullable<Parameters<AnyRouter["invalidate"]>[0]>;
type InvalidateFilter = NonNullable<InvalidateOpts["filter"]>;

/**
 * `router.invalidate()` のラッパー。`_app` layout route と
 * エディター系ルート（`/_app/notes/$noteId/edit` / `/_app/notes/new`）を
 * **常に除外** する。invalidate は「表示系ルートの再評価」であり、
 * エディタールートの loader は初期値 seed 専用（source of truth は
 * ローカル state）かつ `staleTime: 0` で再進入時に必ず fresh load される
 * ため、構造的に invalidate の対象外（`.issue/669/adr.md` ADR-003）。
 *
 * 追加の `filter` を渡した場合は上記除外と **AND 合成** され、
 * 除外の不変条件はラッパー経由では絶対にすり抜けない。
 *
 * 以下のいずれかに該当する mutation でのみ生の `router.invalidate()`
 * を直接呼ぶこと（navigate を伴わず AppShell を in-place 再評価させたいケース）:
 *   rule 1. 認証状態が変わる（未認証 ⇄ 認証）
 *   rule 2. Sidebar の directory tree を改変する
 *   rule 3. Header の `displayName` を改変する
 *
 * ただし rule 1 のうち **navigate を伴う auth 遷移**（ログイン/ログアウト/
 * リセット確認/退会）は `clearAppShellCache(router)` + navigate を使う
 * （navigate 直前に AppShell を破棄し、in-place 再評価で未認証 UI を
 * 1 フレーム描画する race を避ける。`.issue/728/adr.md` ADR-001）。
 * 生 invalidate を直接呼ぶのは navigate を伴わずに AppShell を再評価したい
 * ケース（rule 2/3、および認証状態を変えない invalidate-only フローの
 * `_app` 再評価）に限る。rule 2/3 は引き続き生 invalidate で正しい。
 *
 * `sync` / `forcePending` を必要とする場合はラッパーを拡張するか
 * 生の `router.invalidate()` を使う。経緯は `.issue/293/adr.md`
 * ADR-010 と `.issue/299/adr.md` を参照。
 */
export function routerInvalidate(
  router: AnyRouter,
  filter?: InvalidateFilter,
): Promise<void> {
  return router.invalidate({
    filter: (match) =>
      match.routeId !== APP_SHELL_ROUTE_ID &&
      !EDITOR_ROUTE_IDS.includes(match.routeId) &&
      (filter?.(match) ?? true),
  });
}

/**
 * `router.invalidate()` のラッパー。`_app` layout route **のみ**
 * を狙って invalidate する。leaf match や `/_app/notes` のような
 * prefix 一致 leaf は通さず、`routeId === "/_app"` の厳密一致のみ通る。
 *
 * セッション失効を leaf 側で観測したタイミング（`useAuthGuardEffect`）や
 * `_app.errorComponent` の retry 動線など、AppShell loader の cached
 * `userDto` を明示的に破棄して再評価したい場面で使う。
 *
 * `routerInvalidate` と補完関係にある:
 *   - `routerInvalidate(router)` = `_app` 除外（mutation 後の通常経路）
 *   - `appShellInvalidate(router)` = `_app` 専用（AppShell 再評価専用）
 *
 * rule 2/3（directory / displayName mutation）は **AppShell の依存データ
 * 自体が変わる** ため、引き続き生の `router.invalidate()` を使う
 * （現在ルートに留まったまま leaf も併せて再評価される必要があるため）。
 * rule 1（認証状態変化）のうち **navigate を伴う auth 遷移は
 * `clearAppShellCache` を使い**、ここ（`appShellInvalidate`）を使うのは
 * navigate を伴わない `_app` 再評価（session 失効観測・errorComponent retry）
 * のみ。navigate で別ルートへ遷移するフローは現在 leaf を破棄して遷移するため
 * in-place 再評価が不要で、破棄のみで足りる（`.issue/728/adr.md` ADR-001）。
 * 経緯は `.issue/300/adr.md` ADR-005 を参照。
 */
export function appShellInvalidate(router: AnyRouter): Promise<void> {
  return router.invalidate({
    filter: (match) => match.routeId === APP_SHELL_ROUTE_ID,
  });
}

/**
 * 認証状態が変わる mutation 直後、navigate 前に呼ぶ。
 * cached `_app` match を clearCache で破棄する（in-place 再評価を起こさない）。
 * これにより直後の `router.navigate` が完了する前に、新しい認証状態で
 * 現在ルートが再描画される race を避けられる。`appShellInvalidate`
 * （invalidate ベース）と違い同期 `void` で、await 対象ではない。
 *
 * navigate はこのヘルパーに含めず、呼び出し側に
 * `clearAppShellCache(router); await router.navigate({ to, search? });` の形で
 * 残す（`router.navigate` は per-call で `TTo`/`TFrom`/search スキーマを推論する
 * generic なので、単一インスタンス型に落とすと search 付き navigate が型エラーに
 * なる。`.issue/728/adr.md` ADR-001 P-001）。`appShellInvalidate` と同じ
 * `APP_SHELL_ROUTE_ID` 厳密一致 filter を使う。
 */
export function clearAppShellCache(router: AnyRouter): void {
  router.clearCache({
    filter: (match) => match.routeId === APP_SHELL_ROUTE_ID,
  });
}
