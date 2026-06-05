# 実装計画 — Issue #475: fix(ui): _app の外に取り残された認証必須ルート(/views, /exports, /settings)に AppShell(Header/Sidebar)が付かない

**Issue:** #475
**作成日:** 2026-06-05
**複雑度:** 中〜大規模（調査により機械的変更に収束）

---

## 目的

認証必須ルートのうち `_app` ルートグループの外に取り残されているものを `_app` 配下へ取り込み、他の認証済みページと一貫した Header/Sidebar 付き AppShell レイアウトで表示する。URL は維持する。

## スコープ

### 含まれるもの

- `/views`（保存ビュー）を `app/routes/_app/views/` へ取り込む
- `/exports`（エクスポート、`/exports/$jobId` 含む）を `app/routes/_app/exports/` へ取り込む
- 取り込みに伴う routeId（`createFileRoute` 文字列）の `/_app` プレフィックス付与
- `_app` 配下の確立パターンに合わせた認証ガードの委譲（leaf 個別 `beforeLoad` の削除）
- 各ルートの server-fn action side-effect import / loader / `validateSearch` / `staleTime` / `head` の移行後維持

### 含まれないもの

- **`/settings` の取り込み** — main 時点で既に `app/routes/_app/settings/` 配下に取り込み済み（#463→PR #485、#486→#490、#487→#492 で完了）。本 Issue の残作業は `/views` `/exports` のみ。
- `/admin/*`（独立した管理シェル）、`/search`（公開ページ）— Issue 本文の通り対象外。
- `/export`（`app/routes/export/index.tsx`）・`/notes/$noteId/export`（`app/routes/notes/$noteId/export.tsx`）— レビューで発見した、同型の `_app` 外取り残し認証ルート（`beforeLoad: requireAuthenticatedRoute` 付き）。本 Issue が明示する 3 ルート（views/exports/settings）の範囲外のため取り込まない。Phase 4 でスコープ外 Issue として扱う。
- errorComponent の大規模リデザイン（#474 の領分）。views/exports の route.tsx errorComponent は `_app` の leaf 兄弟（tags/trash）と既に同形の `<div role="alert">` なので追加変更不要。
- 新規 UI 画面・新規デザイントークン（既存 AppShell を載せるだけ。デザイン HTML は元から shell 込みを想定）。

## 調査結果（確定事項）

- `_app/route.tsx` の `loadAppShell` が認証ゲート（未認証は landing 以外 `/` へ redirect）と Header/Sidebar の RSC ロードを `staleTime: Infinity` で一括処理。子 leaf（tags/trash）は**自前の認証 `beforeLoad` を持たず**、`_app` の loader に委譲している。
- `app/components/layout/AppShellDrawer.tsx` は `inSettings = pathname.startsWith("/settings")` のときのみ `settingsSidebar` を出し、それ以外は通常 `sidebar`。`/views` `/exports` は `inSettings=false` なので通常 Sidebar を**自動継承**（追加対応不要）。
- **action モジュールは別物（重要）:**
  - `_app/route.tsx` が import 済みの `@/components/view/actions` = `createSavedViewFn` のみ。
  - `views/route.tsx` が import している `@/components/view/SavedViewsList/action` = `deleteSavedViewFn` / `setDefaultSavedViewFn` / `renameSavedViewFn` / `updateSavedViewFn` / `duplicateSavedViewFn` / `repairSavedViewFn` の **6 mutation**。
  - → これらは**別ファイル・別関数**。`SavedViewsList/action` の import を消すと 6 mutation が RSC マニフェスト未登録になるため、**移動先 `views/route.tsx` に import をそのまま残す**。
  - `exports` 系は `@/components/export/ExportForm/action` を `route.tsx` と `$jobId.tsx` の両方で side-effect import。barrel は無い。これも**移動先にそのまま残す**。
- `internalRouteHead(config, title, path)` の `path` は公開 URL 用引数。`_app` プレフィックスとは無関係なので `"/views"` `"/exports"` `/exports/${jobId}` のまま維持。
- `routeTree.gen.ts` は tanstackStart vite plugin が自動生成。`git mv` ＋ `createFileRoute` 文字列変更で `pnpm dev`/`build` 時に再生成される。
- テストの直接 route 参照は views/exports に無し（移動による既存テスト破壊リスクは低い）。

## 実装ステップ

### 1. `app/routes/views/` を `app/routes/_app/views/` へ移動

- **対象:** `git mv app/routes/views app/routes/_app/views`（route.tsx, index.tsx）
- **理由:** pathless `_app` 配下に置くことで AppShell（Header/Sidebar）を継承させる。URL は不変。

### 2. `_app/views/route.tsx` を修正

- **変更内容:**
  - `createFileRoute("/views")` → `createFileRoute("/_app/views")`
  - `beforeLoad: requireAuthenticatedRoute` と `import { requireAuthenticatedRoute } ...` を削除（認証は `_app` loader に委譲。tags/trash と同方針）
  - `import "@/components/view/SavedViewsList/action"` は**維持**（6 mutation の登録元）
  - `head`（buildHead, noIndex）、errorComponent、`ViewsLayout`（`<Outlet/>`）は維持
- **理由:** routeId を `_app` 配下に合わせ、認証ガードを親へ委譲して `_app` の確立パターンに揃える。

### 3. `_app/views/index.tsx` を修正

- **変更内容:** `createFileRoute("/views/")` → `createFileRoute("/_app/views/")`。`staleTime: 0` / `validateSearch`(viewsSearchSchema) / `loaderDeps` / loader / `internalRouteHead(..., "/views")` は**そのまま維持**。
- **理由:** routeId のみ `_app` 追従。挙動（検索パラメータ・loader・canonical path）は不変。

### 4. `app/routes/exports/` を `app/routes/_app/exports/` へ移動

- **対象:** `git mv app/routes/exports app/routes/_app/exports`（route.tsx, index.tsx, $jobId.tsx）

### 5. `_app/exports/route.tsx` を修正

- **変更内容:**
  - `createFileRoute("/exports")` → `createFileRoute("/_app/exports")`
  - `beforeLoad: requireAuthenticatedRoute` と import を削除
  - `import "@/components/export/ExportForm/action"` は**維持**
  - `head` / errorComponent / `ExportsLayout` 維持
- **理由:** ステップ2と同型。

### 6. `_app/exports/index.tsx` を修正

- **変更内容:** `createFileRoute("/exports/")` → `createFileRoute("/_app/exports/")`。`staleTime` / `validateSearch`(offset) / `loaderDeps` / loader / `internalRouteHead(..., "/exports")` 維持。

### 7. `_app/exports/$jobId.tsx` を修正

- **変更内容:** `createFileRoute("/exports/$jobId")` → `createFileRoute("/_app/exports/$jobId")`。`import "@/components/export/ExportForm/action"`・`staleTime`・`internalRouteHead`・loader・errorComponent 維持。
- **理由:** leaf レベルの action side-effect import は現状で機能している実績があるため、そのまま残す。

### 8. routeTree 再生成と品質ゲート

- `pnpm dev`（または build）で `routeTree.gen.ts` を再生成し、`/views` `/exports/` `/exports/$jobId` の URL（`to`）が従来通り（`_app` は routeId 側のみ）であることを確認。
- `pnpm typecheck && pnpm lint:fix && pnpm format`。routeId 変更が全 leaf に追従しているか型で検証される。

## 設計判断

- **取り込み手段はディレクトリ移動（`git mv`）。** settings が同手法で先行実績あり。`createFileRoute` 文字列を `/_app/...` に変えるだけで routeTree が再生成され、pathless `_app` により URL は不変。
- **認証ガードは leaf 個別 `beforeLoad: requireAuthenticatedRoute` を削除し `_app` loader へ委譲。** これが `_app` 配下の確立パターン（詳細は adr.md）。なお未認証直アクセス時の redirect 先が `/login` → `/`（+HOME_SEARCH）へ**変わる**（等価ではない意図的変更。#293 ADR-006 への統一）。
- **action side-effect import は移動先ファイルに残す（集約しない）。** `view/actions`（createSavedViewFn）と `SavedViewsList/action`（6 mutation）は別モジュールであり、後者を `_app/route.tsx` に統合する利得より、現位置維持の安全性を優先（詳細は adr.md）。

## リスクと注意点

- **action 登録漏れが最大の落とし穴。** `SavedViewsList/action`（views）・`ExportForm/action`（exports）の side-effect import を移動先で確実に残すこと。消すと server-fn が RSC マニフェスト未登録になり、保存ビュー操作 / エクスポート実行が実行時エラーになる。
- **routeId の全 leaf 一括変更。** 5 ファイルすべての `createFileRoute` 文字列を変更。1つでも変え忘れると `routeTree.gen.ts` 再生成時 / typecheck で不整合が出る（=検出されるので致命化はしにくい）。
- **`internalRouteHead` の `path` 引数を `_app` 付きに変えない。** canonical/URL 用の公開パスなので `/views` `/exports` のまま。
- **drawer の `settingsSidebar` 分岐は無影響。** `inSettings` は `/settings` 限定。views/exports は通常 Sidebar を継承。

## テスト方針

- `pnpm typecheck`：routeId 変更の全 leaf 追従を機械検証。
- `pnpm test:unit`：既存ユニットテストが緑。
- ブラウザ（manual-test / agent-browser）:
  - `/views`：URL 不変・Header＋Sidebar 表示・保存ビュー一覧描画・`?kind` の validateSearch・保存ビューの mutation（削除/デフォルト/リネーム等）動作。
  - `/exports`：URL 不変・Header＋Sidebar 表示・ジョブ一覧・`?offset`・エクスポート実行（ExportForm）動作。
  - `/exports/$jobId`：詳細描画・errorComponent。
  - `_app` 内（`/`, `/tags`, `/settings/*`）↔ `/views` `/exports` の SPA 遷移で AppShell が保持される（再マウントされない）こと。
  - 未認証で `/views` `/exports` 直アクセス → `_app` loader 経由で `/` へ redirect。

## レビュー履歴

### 1周目
**修正した点**:
- [P-001] 「`beforeLoad` 削除で認証挙動が `_app` loader と等価」という記述を訂正。実際は未認証 redirect 先が `/login` → `/`(+HOME_SEARCH) に変わる意図的変更。adr.md ADR-001 と plan.md 設計判断に明記。

**取り込んだ改善提案**:
- [S-001] `/export`・`/notes/$noteId/export` も同型の `_app` 外取り残しだが本 Issue スコープ外である旨を「含まれないもの」に追記。Phase 4 でスコープ外 Issue 化を検討。

**見送った提案とその理由**:
- [S-002] layout 側 head（`buildHead`、canonical path 無し）の非対称への言及 — 移行で不変かつ挙動に変化なしのため本文追記は見送り。

両視点とも問題点は P-001 の文言修正のみで、設計方針は APPROVED 相当として 1 周で終了。
