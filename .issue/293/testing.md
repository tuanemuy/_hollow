# 動作確認計画 — Issue #293: ページ遷移ごとに AppShell ごと全体が再描画される

**Issue:** #293
**作成日:** 2026-05-28

---

## 確認環境

このIssueの変更を確認するために必要な手順のみ記載。

### 検証環境の起動

```bash
pnpm dev
```

`pnpm dev` は `vite dev --config vite.config.cloudflare.ts` を実行し、Cloudflare Workers の dev サーバーを立ち上げる（package.json `scripts.dev` で確認）。

### 静的検証

```bash
pnpm typecheck
pnpm lint:fix
pnpm format
pnpm test
```

- `pnpm typecheck` (`tsgo`) — `Route.useLoaderData()` 型整合、routeTree.gen.ts の再生成結果
- `pnpm lint:fix` (`biome check --write`) — コード規約
- `pnpm format` (`biome format --write`) — フォーマット
- `pnpm test` — `pnpm test:unit && pnpm test:integration` で既存テストへの影響なしを確認

### デプロイ方法

なし（検証環境のみで確認できる）。

---

## 確認項目

### 1. `/` → `/notes/$noteId/` 遷移で AppShell の同一性が保たれる

- **目的:** Issue 主目的の中核 — 認証済みページ遷移で Header / Sidebar が再マウントされない
- **手順:**
  1. ログイン状態で `/` を開く
  2. Sidebar の任意のディレクトリを展開して状態を保持
  3. Header 検索 input にカーソルを置きフォーカス + 文字列「test」を入力（送信はしない）
  4. ブラウザの React DevTools を開き、`AppShellFrame` (または Header / Sidebar) の fiber ID を控える
  5. ノートを 1 件クリックして `/notes/$noteId/` に遷移
  6. ブラウザバックで `/` に戻る
- **期待結果:**
  - 遷移後も Sidebar の展開状態が保持
  - 遷移後も Header 検索 input のフォーカス + 入力値「test」が保持
  - React DevTools の `AppShellFrame` / Header / Sidebar fiber ID が遷移前後で同一
- **確認ポイント:** ちらつきがないか、メインコンテンツ領域のみがフェード/差し替えされる

### 2. 認証済みルート連続遷移での AppShell 維持

- **目的:** Issue 本文の主要シナリオ `/` → `/notes/$noteId` → `/tags` → `/trash` の遷移で AppShell が再マウントされない
- **手順:**
  1. ログイン状態で `/` を開く
  2. Sidebar から `/notes/$noteId` を選んで遷移
  3. Sidebar から `/tags` に遷移
  4. Sidebar から `/trash` に遷移
  5. Sidebar から `/notes/new` に遷移
  6. ブラウザの DevTools Network タブで `loadDirectoryTree` の server fn 呼び出し回数を確認
- **期待結果:**
  - 全遷移で AppShell が再マウントされない（DevTools React Inspector で fiber 同一）
  - `loadDirectoryTree` の server fn 呼び出しは **初回の `/` 着地時の 1 回のみ**（連続遷移時には呼ばれない）
- **確認ポイント:** Sidebar 内のディレクトリ展開状態 / スクロール位置 / Header 検索 input フォーカスが全遷移をまたいで保持されること

### 3. `/upload` 遷移時の UploadDialogMount 抑制

- **目的:** `_app` で常時マウントされる UploadDialogMount が `/upload` ページでは抑制される
- **手順:**
  1. ログイン状態で `/` から `/upload` に遷移
  2. URL ハッシュ `#upload` を付けて `/upload#upload` を試行
- **期待結果:**
  - `/upload` ページに到達した時点で UploadDialog がモーダルとして表示されない（ページ自体がアップロード画面のため）
  - 他のページ（`/`, `/notes/...` 等）では `#upload` ハッシュで UploadDialog が開く
- **確認ポイント:** `UploadDialogMount` の `normalizePathname(pathname) !== "/upload"` セレクタが機能する

### 4. `/notes/$noteId/edit` ⇄ `/notes/$noteId/` 遷移

- **目的:** 編集モードと閲覧モードを行き来する際にメインコンテンツのみが差し替わる
- **手順:**
  1. ログイン状態で `/notes/$noteId/` を開く
  2. 編集ボタンで `/notes/$noteId/edit` に遷移
  3. 戻るボタンまたは保存後リダイレクトで `/notes/$noteId/` に戻る
- **期待結果:** Header / Sidebar はマウント維持。メインコンテンツのみ閲覧 ⇄ 編集 UI で切り替わる
- **確認ポイント:** Sidebar 展開状態が保持される

### 5. Header 検索フォーム（フルページ遷移）動作

- **目的:** Header の `<form action="/" method="get">` が `_app` 配下の `/` に着地しても正しく動く
- **手順:**
  1. ログイン状態で `/tags` を開く
  2. Header 検索 input に「example」を入力し Enter
  3. `/?q=example` に遷移する
- **期待結果:**
  - URL が `/?q=example` になる
  - 検索結果（`q=example` でフィルタされた NoteList）が表示される
  - フルページ遷移後も AppShell（Header / Sidebar）が表示される
- **確認ポイント:** `validateSearch: noteListSearchSchema.parse(search)` が `q=example` を正しくパースし、エラーにならない（`_app.beforeLoad` の `/` 例外も走る）

### 6. ノート履歴ルートの遷移

- **目的:** `notes/$noteId/history/route.tsx` の path-based レイアウト + `_app` の組み合わせが正しく動く
- **手順:**
  1. `/notes/$noteId/` から `/notes/$noteId/history/` に遷移
  2. 履歴一覧から `/notes/$noteId/history/$revisionId` に遷移
  3. ブラウザバックで戻る
- **期待結果:** すべての遷移で AppShell が維持、メインコンテンツのみ差し替わる
- **確認ポイント:** `route.tsx`（`<Outlet />` のみ）が pathless `_app` の中で正しくネストされる

---

## エッジケース・異常系

### 1. 未ログインで `/` を直アクセス

- **目的:** `_app.beforeLoad` の `/` 例外が機能し、ランディングが表示される
- **手順:**
  1. ログアウトする（または別ブラウザ / プライベートモード）
  2. `/` を直アクセス
- **期待結果:**
  - `<LandingPage />` が表示される
  - AppShell（Header / Sidebar）が **表示されない**
  - `<html lang="ja">` は `__root.tsx` で保証される

### 2. 未ログインで認証必須ルートを直アクセス

- **目的:** 既存 redirect 挙動（`/` + `HOME_SEARCH`）が維持される
- **手順:**
  1. ログアウト状態で `/trash`、`/tags`、`/notes/new`、`/upload`、`/notes/$noteId/`、`/notes/$noteId/edit` を順に直アクセス
- **期待結果:** すべて `/` + `HOME_SEARCH`（クエリ付き `/` ランディング）にリダイレクトされる
- **確認ポイント:** `/login` に飛ばない（既存挙動の維持）

### 3. `_app.beforeLoad` 失敗時のエラー表示

- **目的:** DB 障害等で `getCurrentUser` が throw した場合に AppShell なしのエラー画面が出る
- **手順:** （本番環境では再現困難。ローカルで `getCurrentUser` をモック等で意図的に throw させるか、コンソール / Cloudflare Workers ログでエラーログを確認）
- **期待結果:** `_app.errorComponent` が AppShell なしで表示される
- **確認ポイント:** クライアント JS が壊れずエラー画面が描画される

### 4. ノート単体の `errorComponent` 動作

- **目的:** リーフが throw しても AppShell は描画され続け、`<Outlet />` 位置にリーフの `errorComponent` が出る
- **手順:** 存在しない noteId で `/notes/invalid-id/` にアクセス
- **期待結果:**
  - AppShell（Header / Sidebar）が表示される
  - メインコンテンツ領域に `notFoundComponent` または `errorComponent` の内容が表示される
- **確認ポイント:** リーフのエラーが `_app.errorComponent` まで bubble up しない

---

## 既存機能への影響確認

- **`<Link to="/" search={HOME_SEARCH}>` 互換性** — Sidebar、Header、設定ページ、admin ページの「ホームに戻る」リンクがすべて `/` に正しく遷移し、`HOME_SEARCH` パラメータが付与される
- **`/settings/*` / `/admin/*` ルートへの影響なし** — `_app` 配下にないので影響を受けない。設定ページ表示で AppShell が出ないことを確認
- **`/exports/*` / `/views/*` / `/search` ルートへの影響なし** — `_app` 配下にないが、認証が必要なルートなので、これらのルートが個別に redirect ガードを持つことを再確認（本 Issue では変更しない）
- **公開ノート `/share/*`、`/u/*`、`/about`、`/login`、`/signup` 等の未認証ルート** — `_app` の影響なし、表示・遷移が正しい
- **side-effect import の RSC manifest 登録** — `useServerFn` を叩く UI（ノート作成、保存、削除、ディレクトリ移動、タグ操作、savedView 操作、ingestion、publication）が `"missing handler"` エラーなく動作する

---

## 確認チェックリスト

- [ ] `/` → `/notes/$noteId/` 遷移で AppShell が同一 fiber（React DevTools）
- [ ] `/` → `/tags` → `/trash` → `/notes/new` 連続遷移で AppShell 維持
- [ ] 連続遷移時に `loadDirectoryTree` server fn が 1 回しか呼ばれない（Network タブ）
- [ ] Sidebar 展開状態 / スクロール位置 / Header 検索 input フォーカスが遷移をまたいで保持
- [ ] `/upload` 遷移時に UploadDialog が抑制
- [ ] `/notes/$noteId/edit` ⇄ `/notes/$noteId/` 遷移でメインのみ差し替わり
- [ ] Header 検索フォーム経由 `/?q=...` 遷移で AppShell 維持 + 検索結果反映
- [ ] `/notes/$noteId/history/` 配下の path-based ネストが正しく動作
- [ ] 未ログイン `/` 直アクセスで `<LandingPage />`（AppShell なし）
- [ ] 未ログイン認証必須ルートで `/` + `HOME_SEARCH` にリダイレクト（`/login` ではない）
- [ ] 存在しない noteId アクセスで AppShell 維持 + `notFoundComponent` 表示
- [ ] `<Link to="/" search={HOME_SEARCH}>` 互換性維持
- [ ] `/settings/*` / `/admin/*` / 公開ルートに影響なし
- [ ] `useServerFn` を叩く UI が `"missing handler"` エラーなく動作
- [ ] `pnpm typecheck` がクリーン
- [ ] `pnpm lint:fix` がクリーン
- [ ] `pnpm test` がクリーン
