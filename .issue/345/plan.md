# 実装計画 — Issue #345: 認証必須ルートのガードを共通化し /exports・/views にも適用する

**Issue:** #345
**作成日:** 2026-05-31
**複雑度:** 中〜大規模

---

## 目的

`/settings`・`/login`・`/signup` の各ルートにコピペされている「認証状態を確認する GET server function + `beforeLoad` redirect」を presentation 層の共有モジュールに1度だけ定義し、各ルートから import する形に整理する。あわせて、認証必須なのにガードを持たない `/exports`・`/views` レイアウトルートに同じガードを適用し、未認証アクセスを `/login` へリダイレクトさせる（#342 と同型の「エラーが発生しました」シェル表示バグを予防）。

## スコープ

### 含まれるもの
- 共有認証ガードモジュールの新設（`app/core/presentation/authGuard.ts`）
  - `createServerFn({ method: "GET" })` で `{ authenticated }` を返す関数を1度だけ定義
  - `beforeLoad` 用ヘルパー2種（認証必須 → `/login` / ゲスト専用 → ホーム）を提供
- `/settings`・`/login`・`/signup` のローカル定義を共有ガードへ差し替え（課題2）
- `/exports`・`/views` レイアウトに `beforeLoad` 認証ガードを追加（課題1）
- `/export`（単数・bulk export）・`/notes/$noteId/export`（単一ノート export）に `beforeLoad` 認証ガードを追加（課題1の棚卸しで判明した #342 同型バグ。単一ページルートに直接 `beforeLoad` を付与）
- 認証必須ルートの棚卸し（対象 = `/exports`・`/views` レイアウト + `/export`・`/notes/$noteId/export` 単一ページ）

### 含まれないもの
- `/admin`（および配下）— `requireAdminUser`（admin 専用・別概念の認可）を子 RSC で使い `beforeLoad` を持たない。未認証/非admin時に #342 同型の errorComponent 落ちが潜在するが、redirect 先が `/login` 固定ではなく admin 固有になりうるため共有ヘルパーを流用できない。本Issue（認証ガード共通化）とは別軸のため対象外。
- `_app` 配下の認証必須ルート — `app/routes/_app/route.tsx` が既に `beforeLoad` ガードを持つ（ただし未認証を `/`＝landing 兼用ルートへ送る別系統）。本Issueの共有ヘルパーは `/login` 行きなので `_app` 配下は対象外で正しい。
- `/media/$mediaId` — 公開含む下流判定で `getCurrentUser` を使うが認証必須ではない。対象外。
- `setup.tsx` の `beforeLoad`（`checkSetupEnabled`）— 構造は酷似するが認証ガードではなくセットアップ有効性チェック。対象外。
- 子ルート RSC 内の `requireCurrentUser()` 呼び出しの削除（補足項目）— 戻り値の `user` を各ページが実際に使用しており、削除すると別途ユーザー取得手段が必要で差分が膨らむ。多層防御として残す（後述）。

## 実装ステップ

### 1. 共有認証ガードモジュールを新設

- **対象ファイル:** `app/core/presentation/authGuard.ts`（新規）
- **変更内容:**
  - `createServerFn({ method: "GET" }).middleware([errorResponseMiddleware]).handler(...)` で、ハンドラ内 `await import("@/core/presentation/authMiddleware")` → `getCurrentUser()` を呼び `{ authenticated: user !== null }` を返す関数 `checkAuthenticated` を**1度だけ**定義（module-private）。
  - `beforeLoad` 用 export ヘルパー2種:
    - `requireAuthenticatedRoute(): Promise<void>` — `if (!authenticated) throw redirect({ to: "/login" })`
    - `redirectAuthenticatedRoute(): Promise<void>` — `if (authenticated) throw redirect({ to: "/", search: HOME_SEARCH })`
- **理由:** 横断的関心事（ルート認証ガード）を presentation 層に集約。`createServerFn` は client バンドルにも参照される isomorphic コードのため、`import "@tanstack/react-start/server-only"` を持つ `authMiddleware.ts` には同居させず、新ファイルに置く（詳細は adr.md ADR-001）。redirect の向き（条件・遷移先）まで settings/exports/views と login/signup で各々共通なので、`{ authenticated }` の取得だけでなく redirect ロジックごとヘルパー化して重複を完全に排除する。

### 2. `/settings`・`/login`・`/signup` を共有ガードへ差し替え

- **対象ファイル:** `app/routes/settings/route.tsx`, `app/routes/login.tsx`, `app/routes/signup.tsx`
- **変更内容:**
  - 各ファイルローカルの `checkAuthenticated` / `checkAlreadyAuthenticated`（`createServerFn` 定義）を削除。
  - `beforeLoad` を共有ヘルパー参照に置換: settings → `beforeLoad: requireAuthenticatedRoute`、login・signup → `beforeLoad: redirectAuthenticatedRoute`。
  - 不要になった import（`createServerFn`, `errorResponseMiddleware`, settings の `HOME_SEARCH` が未使用化しないか確認のうえ整理）を削除。`@/components/.../action` の side-effect import は維持。
- **理由:** 課題2の重複排除。

### 3. `/exports`・`/views` レイアウトに `beforeLoad` 認証ガードを追加

- **対象ファイル:** `app/routes/exports/route.tsx`, `app/routes/views/route.tsx`
- **変更内容:** `requireAuthenticatedRoute` を import し、`createFileRoute(...)` に `beforeLoad: requireAuthenticatedRoute` を追加。既存の side-effect action import（`@/components/export/ExportForm/action`, `@/components/view/SavedViewsList/action`）と `errorComponent`・`component`（`<Outlet />`）はそのまま維持。
- **理由:** 課題1。未認証アクセスを loader 到達前に `/login` へ送り、子 RSC の `requireCurrentUser` throw が loader 経由で `errorComponent`（「エラーが発生しました」）に化ける #342 同型不具合を防ぐ。

### 4. `/export`・`/notes/$noteId/export` 単一ページに `beforeLoad` 認証ガードを追加

- **対象ファイル:** `app/routes/export/index.tsx`, `app/routes/notes/$noteId/export.tsx`
- **変更内容:** `requireAuthenticatedRoute` を import し、各 `createFileRoute(...)` に `beforeLoad: requireAuthenticatedRoute` を1行追加。既存の GET loader（`renderBulkExportPage` / `renderSingleExportPage`）・`component`・side-effect action import はそのまま維持。
- **理由:** 棚卸しで判明した #342 同型バグの修正。両ルートとも GET loader が `ExportFormPage`（`requireCurrentUser()` を呼ぶ）をレンダリングし、未認証時に loader 内 throw redirect が `errorComponent` に化ける。レイアウトルートは不要で、単一ページルートにも `beforeLoad` を直接付与できる（`login.tsx` / `signup.tsx` が前例）。`/notes/$noteId/export` は root 直下で親ガードを持たないため特に必要。

### 5. 子ルート冗長ガードの扱い（補足・見送り）

- 子 RSC（`ExportJobsList/Page.tsx` 等、identity 配下フォーム）の `requireCurrentUser()` は**残す**。レイアウト `beforeLoad` を一次ガードとし、子 RSC は多層防御 + ユーザー取得手段として機能する。
- コード削除はしない（戻り値 `user` を各ページが使用）。コメント追記も必須ではないため、過剰なコメントを避ける CLAUDE.md 方針に沿って原則そのまま。

## 設計判断

- **共有モジュールの配置先:** `@/core/presentation/authGuard.ts`（新規）。presentation 層がルート認証ガードの横断的責務を持つため。authMiddleware.ts には server-only マーカーがあり `createServerFn`（isomorphic）を置けないため別ファイル化。→ adr.md ADR-001。
- **共有粒度:** `{ authenticated }` の取得 + redirect ロジックをまとめた beforeLoad ヘルパーを共有する（redirect 向きが2系統に確定するため）。→ adr.md ADR-002。
- 詳細は `.issue/345/adr.md` 参照。

## リスクと注意点

- **server-only 境界:** server-only な `getCurrentUser` 実装はハンドラ内動的 import に閉じ込める（既存3ルートの作法を厳守）。共有ファイル `authGuard.ts` には `server-only` マーカーを付けない。
- **RSC manifest 登録:** 共有 `createServerFn` は import 元ルート（settings/login/signup/exports/views）が server グラフに引き込むため、別途 root 登録は不要。typecheck/build が通れば登録は機能している。万一 client で "server function not registered" が出たら、共有ファイルを root の side-effect import に加えるフォールバックを検討。
- **redirect 向きの回帰:** settings/exports/views/export/notes-export は `if (!authenticated)` → `/login`、login/signup は `if (authenticated)` → `/`。ヘルパーの取り違えに注意。
- **`beforeLoad` への裸の関数参照:** `beforeLoad: requireAuthenticatedRoute` は本リポジトリに前例がなく、既存6箇所はすべてインラインのクロージャ。`() => Promise<void>`（ctx 引数を無視・コンテキスト無追加）は `BeforeLoadFn` に代入可能なはずだが型保証はない。万一 typecheck で代入互換エラーが出たら `beforeLoad: () => requireAuthenticatedRoute()` でインライン包装するフォールバックを使う。
- **既存テスト:** 本変更の直接対象テストは無い（`app/routes/__tests__/` は loaderDeps 等）。`pnpm typecheck && pnpm lint:fix && pnpm format` を必ず通す。MEMORY の注意に従い `./node_modules/.bin/biome` で format:check を直接確認。

## テスト方針

- `pnpm typecheck && pnpm lint:fix && pnpm format`（CLAUDE.md 必須）。
- ブラウザ（`.issue/342/testing.md` と同型）:
  - 未認証で `/exports`・`/exports/$jobId`・`/views` → `/login` へリダイレクト（「エラーが発生しました」シェルが出ないこと）。
  - 未認証で `/settings` 系 → 従来どおり `/login`（回帰なし）。
  - 認証済で `/exports`・`/views`・`/settings` → 各ページ表示。
  - 認証済で `/login`・`/signup` → ホームへリダイレクト（逆向きガード回帰なし）。
- 検証は `pnpm build` → `pnpm start`（wrangler dev は dist を配信するためソース変更時 build 必須）。

## レビュー履歴

### 1周目（2視点並列）
**修正した点（両レビュアーが共通指摘した P-001）**:
- 課題1の「棚卸し」要件に対し、`/export`（単数）・`/notes/$noteId/export` が #342 同型バグ（GET loader 内 throw redirect → errorComponent 化け）を抱えたまま漏れていた。実コード（両ルートとも単一ページで GET loader → `ExportFormPage` → `requireCurrentUser()`、`beforeLoad` 無し）を確認のうえ、両ルートをスコープに追加し実装ステップ4を新設。`/export` 見送り理由「ルート構成変更が必要」は事実誤認（単一ページにも `beforeLoad` を付与可能、login/signup が前例）だったため撤回。

**取り込んだ改善提案**:
- [S-001/視点1] `_app` 配下は別系統（未認証→`/` landing 兼用）であえて対象外である旨を「含まれないもの」に明記。
- [S-002/視点1] `setup.tsx` の `checkSetupEnabled` は認証ガードではない旨を「含まれないもの」に明記。
- [S-002/視点2] `/admin` は同型バグが潜在するが redirect 先が admin 固有で別軸のため対象外、と理由を補強。
- [S-001/視点2] `beforeLoad` への裸の関数参照は前例がないため、型エラー時のインライン包装フォールバックをリスク欄に追記。

**見送った提案**: なし（全提案を反映）。

両視点とも、課題2（共通化）・課題1主対象（exports/views）の設計は妥当と評価。残った最大の指摘（P-001 棚卸し漏れ）を解消したため、2周目は不要と判断しレビューループを終了する。
