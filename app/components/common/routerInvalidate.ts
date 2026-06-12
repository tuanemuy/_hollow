/**
 * `_app` AppShell に対する `router.invalidate()` 制御を集約するモジュール。
 *
 * 公開 API は 2 つあり、補完関係にある:
 *   - `routerInvalidate(router, filter?)`: `_app` とエディター系ルートを
 *     **常に除外** して invalidate
 *   - `appShellInvalidate(router)`: `_app` のみを **狙って** invalidate
 *
 * AppShell loader (`_app.loader`) の `staleTime: Infinity` を mutation 後にも
 * 維持しつつ、セッション失効・errorComponent retry など「明示的に AppShell を
 * 再評価したい」場面では `appShellInvalidate` を使う、という意味分担で
 * routeId のリネームにも 1 ファイル / 1 定数で追従できる。
 *
 * `.issue/293/adr.md` ADR-010 / `.issue/299/adr.md` / `.issue/300/adr.md`
 * ADR-005 を参照。
 */
import type { AnyRouter } from "@tanstack/react-router";

const APP_SHELL_ROUTE_ID = "/_app";

/**
 * Editor routes are excluded from `routerInvalidate` unconditionally
 * (Issue #669, `.issue/669/adr.md` ADR-003): their loaders only seed the
 * editor's initial values — after mount the source of truth is the
 * editor's local state — so re-running the loader either does nothing or
 * destroys in-progress edits (RSC tree swap remounts the editor and drops
 * focus). Both routes use `staleTime: 0`, so the next navigation into an
 * editor always fresh-loads; skipping invalidation cannot serve stale data.
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
 * ため、構造的に invalidate の対象外（Issue #669 / `.issue/669/adr.md`
 * ADR-003）。
 *
 * 追加の `filter` を渡した場合は上記除外と **AND 合成** され、
 * 除外の不変条件はラッパー経由では絶対にすり抜けない。
 *
 * 以下のいずれかに該当する mutation でのみ生の `router.invalidate()`
 * を直接呼ぶこと（AppShell を再評価させたいケース）:
 *   rule 1. 認証状態が変わる（未認証 ⇄ 認証）
 *   rule 2. Sidebar の directory tree を改変する
 *   rule 3. Header の `displayName` を改変する
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
 * 3 rule 例外（auth / directory / displayName mutation）は **AppShell の
 * 依存データ自体が変わる** ため、引き続き生の `router.invalidate()` を
 * 使う（leaf も併せて再評価される必要があるため）。経緯は
 * `.issue/300/adr.md` ADR-005 を参照。
 */
export function appShellInvalidate(router: AnyRouter): Promise<void> {
  return router.invalidate({
    filter: (match) => match.routeId === APP_SHELL_ROUTE_ID,
  });
}
