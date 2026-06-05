# PR Review #001 — fix(ui): /views と /exports を _app 配下へ取り込み AppShell を付与

**PR:** #501
**Date:** 2026-06-05
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 12
- Verdict: **APPROVED**

レビュー観点: Frontend/Routing と Security/Architecture の2レイヤー並列。両レイヤーとも Blocker・Warning ゼロ。1ラウンドでクリーンのため完了。

---

## Frontend / Routing

### Blockers
なし

### Warnings
なし

### Notes
- **[N-001]** URL 不変が完全維持。`routeTree.gen.ts` の `path`/`fullPath`/`FileRoutesByTo`/`declare module` すべてで `/views`・`/exports`・`/exports/$jobId` が従来通り。新 entry は routeId のみ `/_app/...`。`to="/views"`/`to="/exports"` の既存ナビリンク（Sidebar.tsx・ExportJobDetail）も typecheck 通過。
- **[N-002]** routeTree に移動漏れ・旧パス残骸・重複なし。旧 `ViewsRouteRoute` 等の import/update/WithChildren/RootRouteChildren/declare module がすべて削除され新 `App*` 版に置換。旧ディレクトリも消去。
- **[N-003]** 各 leaf の loader/validateSearch/loaderDeps/staleTime/head が維持。`internalRouteHead` の `path` 引数は公開 URL のまま（`_app` 付与なし）。
- **[N-004]** sidebar 分岐正常。`inSettings = pathname.startsWith("/settings")` は views/exports で false ＝通常 sidebar を継承し settingsSidebar 分岐に入らない。
- **[N-005]** errorComponent が兄弟 leaf（tags/trash）と一貫。`$jobId.tsx` の独自文言は移動前から存在し本 PR で不変。
- **[N-006]** ADR-001/002 準拠。`beforeLoad`/import 削除、action side-effect import の維持を確認。未使用 import・相対 import 破壊なし。
- **[N-007]** スコープ整合。`/export`・`/notes/$noteId/export` のスコープ外宣言を確認。

検証: diff・plan/adr・移動後5ファイル・routeTree.gen.ts 全体・_app/route.tsx・tags/trash・AppShellDrawer、`pnpm typecheck`（クリーン）。

---

## Security / Architecture

### Blockers
なし

### Warnings
なし

### Notes
- **[N-001]** 認証 fail-closed を維持（最重要・問題なし）。未認証は二重に塞がれる：(1) `loadAppShell` が非 landing path で `/`(+HOME_SEARCH) へ redirect、(2) 各 RSC Page の `requireCurrentUser()` が `/login` redirect を防御層として残す。抜け穴なし。TC-Edge で実証。
- **[N-002]** redirect 先変化（`/login`→`/`）は意図的・副作用なし。`_app` の他 leaf と同一挙動。CLAUDE.md の認可方針・バリデーション境界と矛盾なし。
- **[N-003]** RSC マニフェスト登録を維持。`SavedViewsList/action`（6 mutation）は `_app/views/route.tsx:5`、`ExportForm/action`（4 fn）は `_app/exports/route.tsx:5` と `$jobId.tsx:9` の side-effect import で保持。`view/actions`（createSavedViewFn）とは別モジュール。TC-02 で `deleteSavedViewFn` の end-to-end 発火を実証。
- **[N-004]** 各 server-fn の内部認可（`requireCurrentUser()`）はルート委譲変更の影響を受けない。認可層と認証ガード層が直交。
- **[N-005]** 移動の完全性を確認。旧ディレクトリ・旧 routeId 参照の残存なし。`requireAuthenticatedRoute` 自体はスコープ外の2ルートが利用中でデッドコードではない。

検証: diff・plan/adr・loadAppShell・authGuard・移動後3ファイル・各 action モジュール・各 Page の requireCurrentUser。

---

## Design Decisions

このラウンドで新たな設計判断なし（ADR-001/002 で既出）。特になし。
