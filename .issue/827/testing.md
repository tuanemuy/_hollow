# 動作確認計画 — Issue #827: RootDocument が特定ルート（/notes）で二重描画され head メタ（charset/viewport）が重複する

**Issue:** #827
**作成日:** 2026-07-10

---

## 確認環境

このIssueの変更を確認するために必要な手順のみ記載（プロジェクト全体のセットアップは省略）。変更はプレゼンテーション層（`app/routes/__root.tsx` のシェルを `shellComponent` に一元化）に閉じるため、DB スキーマ変更はなし。

### 検証環境の起動

クライアント DOM の要素数を計測するだけなので vite dev で足りる。

```bash
pnpm dev   # vite dev on http://localhost:3000（ポート使用中なら自動で繰り上がる。実ポートは起動ログで確認）
```

SSR→hydration の DOM ラップ位置変化を本番相当で最終確認したい場合のみ wrangler dev も併用する:

```bash
pnpm build && pnpm start   # wrangler dev。dist/worker を配信（先に build 必須）
```

### シードデータ

`/notes`（notFound）・実在ルート・root error を認証済みで確認するため、ログインユーザーとノートが最低 1 件必要。

1. スキーマ適用（未適用なら）:

   ```bash
   pnpm db:migrate
   ```

2. 決定論的な管理ユーザー＋有効セッションを投入（冪等）:

   ```bash
   pnpm seed:dev-admin
   ```

   出力されるセッショントークンを CDP 経由で注入（cookie 名 `__Host-session` は Secure 必須で `document.cookie` 不可）:

   ```bash
   agent-browser cookies set "__Host-session" "<token>" \
     --url http://localhost:<port> --path / --secure --sameSite Lax
   ```

3. 実在ルート（`/notes/$noteId`・`/notes/$noteId/edit`）の確認にはノートが 1 件必要。既存が無ければブラウザ上で新規作成（`/notes/new`）でも可。SQL で直接投入する場合は `db:execute:local` で流す:

   ```bash
   pnpm db:execute:local <ノート投入SQLファイル>
   ```

### デプロイ方法

なし（検証環境のみで確認できる。ステージング反映が要る場合は `pnpm deploy:staging` だが本 Issue の確認には不要）。

### 自動テストの実行

```bash
pnpm typecheck && pnpm lint && pnpm test
```

---

## 計測方法（共通）

各ルートを開いたあと、クライアント DOM で以下を数える（`.issue/819/manual-test/results/analysis.md` の計測方式を踏襲）。ブラウザの DevTools コンソール、または agent-browser の evaluate で次を実行:

```js
({
  charset: document.querySelectorAll('meta[charset], meta[charSet]').length,
  viewport: document.querySelectorAll('meta[name="viewport"]').length,
  progressbar: document.querySelectorAll('[data-route-progress], .route-progress-bar').length, // 実セレクタは RouteProgressBar の実装に合わせる
  html: document.querySelectorAll('html').length,
})
```

`progressbar` のセレクタは `app/components/layout/RouteProgressBar` の実際の識別子（`aria-hidden` の装飾バー）に合わせて調整する。要点は「charset 数・viewport 数・progressbar 数が一致し、いずれも 1 になる」こと。

---

## 確認項目

### 1. `/notes`（未定義 URL＝notFound）でシェルが単一描画される

- **対応する受け入れ基準:** AC-1, AC-2
- **目的:** 二重描画の解消。`/notes` は一致する leaf ルートが無く root notFound になる代表ケース。
- **手順:**
  1. 認証済み状態で `/notes` を開く
  2. 計測方法のスニペットを実行して各要素数を数える
  3. notFound 画面（`ErrorPage kind="notFound"`）が単一シェル内に表示されていることを目視
- **期待結果:** `charset = 1`、`viewport = 1`、`progressbar = 1`、`ErrorPage(notFound) コンテナ = 1`。notFound 画面が従来どおり表示される（機能退行なし）。
- **確認ポイント:** 修正前は `/notes` で charset=2/viewport=2/progressbar=2 だった箇所が、すべて 1 に減っていること。

### 2. 実在ルートで各要素が従来どおり単一のまま（回帰なし）

- **対応する受け入れ基準:** AC-3, AC-6
- **目的:** シェル一元化が実在ルートの描画を壊していないことの確認。
- **手順:**
  1. `/`（ノート一覧＝ホーム）を開いて計測
  2. `/notes/$noteId`（ノート詳細）を開いて計測
  3. `/notes/$noteId/edit`（ノート編集）を開いて計測
  4. 各ルートで `<html lang="ja">`・favicon/manifest リンク・stylesheet・`HeadContent`・`Scripts`・`RouteProgressBar` が 1 組ずつ出力されていることを確認
- **期待結果:** すべてのルートで `charset = 1`、`viewport = 1`、`progressbar = 1`、`html = 1`、アプリコンテナ = 1。ページの機能・表示に退行がない。
- **確認ポイント:** ブラウザコンソールに hydration mismatch の warning が出ていないこと（AC-6）。

### 3. 別の未定義 URL でも root notFound が単一シェルになる（一般ケース）

- **対応する受け入れ基準:** AC-4
- **目的:** `/notes` は一例に過ぎず、あらゆる未定義 URL で二重描画が起きないことの確認。
- **手順:**
  1. `/notes` 以外の未定義 URL を 1〜2 個開く（例: `/this-route-does-not-exist`、`/notes/`）
  2. 各要素数を計測
- **期待結果:** いずれも `charset = 1`、`viewport = 1`、`progressbar = 1`、notFound 画面が単一シェル内に表示。
- **確認ポイント:** notFound の一般ケースが `/notes` と同じく単一化されていること。

## エッジケース・異常系

### 1. root error 経路でシェルが保たれたまま単一表示される

- **対応する受け入れ基準:** AC-5
- **目的:** root の `component`/loader が throw したときに `errorComponent`（`ErrorPage kind="system"`）が `html>head>body` シェル内に単一表示されること（error/notFound シェルカバレッジの維持）。
- **手順:**
  1. root の error 経路に到達させる。リーフルートでの throw は各リーフ/`_app` の `errorComponent` に捕捉され root には届かないため、**root の `beforeLoad`/loader 段（`loadAppContext` / `resolveAppContext`）を一時的に throw させる**（例: `loadAppContext` の handler 冒頭に `throw new Error("test")` を一時挿入）
  2. 任意のルートを開き、`ErrorPage kind="system"` が表示されることを確認
  3. 計測方法のスニペットで各要素数を数える
  4. 確認後、一時挿入した throw を必ず元に戻す
- **期待結果:** `ErrorPage(system)` が `<html>`/`<head>`/`<body>` シェル内に表示され、`charset = 1`、`viewport = 1`、`progressbar = 1`。シェルが消失していない。
- **確認ポイント:** `shellComponent`（静的 `RootDocument`）は throw し得ないため、error 時もシェルは常に残る（現構造より堅い）ことを確認。

## 既存機能への影響確認

- **全ルートの notFound / error 挙動:** 変更は root に閉じるが影響は「あらゆる未定義 URL の 404」と「root レベル error」全体に及ぶ。確認項目 1・3 とエッジケース 1 で網羅する。リーフ・`_app` レイヤの `errorComponent`/`notFoundComponent` は Outlet 位置描画のため無影響（変更なし）。
- **`RouteProgressBar`（#819）:** ページ遷移時の進捗バー表示が従来どおり機能すること。従来 `/notes` で 2 個だったバーが 1 個になるのは純粋な改善（#819 の「decorative・完全重なりで実害なし」評価どおり、UX 退行なし）。
- **head メタ生成（`buildHead`）・canonical 除去ロジック:** 変更していないため、各ルートの `<title>`・OG メタ・canonical が従来どおり出力されること。
</content>
</invoke>
