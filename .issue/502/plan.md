# 実装計画 — Issue #502: _app の外に残るその他の認証必須ルート(/export, /notes/$noteId/export)に AppShell が付かない

**Issue:** #502
**作成日:** 2026-06-06
**複雑度:** 中〜大規模

---

## 目的

#475(PR #501) で `/views`・`/exports` を `_app` 配下へ取り込み AppShell(Header/Sidebar) を付与したのと同型の積み残しを解消する。`_app` 外に取り残された認証必須ルート `/export`（一括エクスポート）と `/notes/$noteId/export`（単一ノートエクスポート）を `_app` 配下へ取り込み、他の認証済みページと一貫した Header/Sidebar 付きレイアウトで表示する。**URL は維持**する。

## スコープ

### 含まれるもの
- `app/routes/export/index.tsx` → `app/routes/_app/export/index.tsx` への移動と `_app` パターンへの書き換え
- `app/routes/notes/$noteId/export.tsx` → `app/routes/_app/notes/$noteId/export.tsx` への移動と書き換え
- leaf 個別の `beforeLoad: requireAuthenticatedRoute` 削除（`_app` の `loadAppShell` 認証ゲートへ委譲）
- `ExportForm/action` の side-effect import を移動先に残し RSC マニフェスト登録を維持
- `loader` / `inputValidator(validateInput(...))` / `staleTime` / `internalRouteHead` の維持（公開 path は URL のまま）
- `routeTree.gen.ts` の再生成（ビルドによる自動生成）

### 含まれないもの
- 公開ノートビュー `app/routes/notes/public/$noteId.tsx` の変更・移動（認証不要・別系統。据え置き）
- `notes/public` への `route.tsx` 新設等のスコープ外な構造変更
- リンク・参照の書き換え（URL 不変のため不要。`NoteActions.tsx:200` の `to="/notes/$noteId/export"` はそのまま動く）
- 防御的 `getCurrentUser` チェックの新規追加（#475 exports leaf に倣い不要）

## 前提条件（重要）

**最新 `origin/main` から新ブランチを切ること。** 現在の worktree ブランチ `issue/498/...` は #475/#501 マージ前の地点にあり `app/routes/_app/exports/`・`_app/views/` が存在しない。`origin/main` には canonical パターン（`_app/exports/{index,route}.tsx`）が存在し、かつ対象2ルートもまだ `_app` 外に残っている（検証済み）。

## 実装ステップ

### 1. 一括エクスポートを `_app` 配下へ移動

- **対象ファイル:** `app/routes/export/index.tsx` → `app/routes/_app/export/index.tsx`
- **変更内容:**
  - `git mv app/routes/export/index.tsx app/routes/_app/export/index.tsx`
  - `createFileRoute("/export/")` → `createFileRoute("/_app/export/")`（index 系は末尾スラッシュ付き）
  - `beforeLoad: requireAuthenticatedRoute` 行と `import { requireAuthenticatedRoute } ...` を削除
  - `import "@/components/export/ExportForm/action";` は**そのまま残す**（RSC マニフェスト登録維持）
  - `staleTime: 0` / `loader` / `internalRouteHead(..., "一括エクスポート", "/export")` は維持（head の path は URL の `/export` のまま）
- **理由:** pathless `_app` 取り込みで AppShell を継承。URL `/export` は不変。

### 2. 単一ノートエクスポートを `_app/notes` 配下へ移動

- **対象ファイル:** `app/routes/notes/$noteId/export.tsx` → `app/routes/_app/notes/$noteId/export.tsx`
- **変更内容:**
  - `git mv app/routes/notes/$noteId/export.tsx app/routes/_app/notes/$noteId/export.tsx`
  - `createFileRoute("/notes/$noteId/export")` → `createFileRoute("/_app/notes/$noteId/export")`（非 index 系はスラッシュなし、隣接 `edit.tsx` と同型）
  - `beforeLoad: requireAuthenticatedRoute` 行と該当 import を削除
  - `import "@/components/export/ExportForm/action";` はそのまま残す
  - `inputValidator(validateInput(z.object({ noteId: z.string().min(1) })))` / `loader` / `staleTime: 0` / `internalRouteHead(..., \`/notes/${params.noteId}/export\`)` は維持
- **理由:** 隣接 `_app/notes/$noteId/{edit,index}.tsx` と同階層に置き AppShell を継承。URL `/notes/$noteId/export` は不変。

### 3. 残骸ディレクトリの整理

- **対象:** `app/routes/export/`（移動で空）と `app/routes/notes/$noteId/`（移動で空）
- **変更内容:** 空ディレクトリを削除。`app/routes/notes/` 配下は `public/$noteId.tsx` のみ残す。
- **理由:** 公開 `notes/` ツリーが公開ビュー専用に純化され、認証必須ページとの混在が解消される（Issue 注意点A への対処）。

### 4. routeTree 再生成と検証

- **対象ファイル:** `app/routeTree.gen.ts`（自動生成）
- **変更内容:** `pnpm build`（または `pnpm dev`）で再生成。手動編集しない。続けて `pnpm typecheck && pnpm lint:fix && pnpm format`。
- **理由:** ファイルベースルーティングのツリーを最新化し、型・lint を担保。

## 設計判断

詳細は `.issue/502/adr.md` を参照。

- **ADR-001:** 公開 `notes/` ツリーは据え置き、export leaf のみ抜き出す。公開ビューは認証不要・別系統のため `_app` へ取り込まない。
- **ADR-002:** 防御的 `getCurrentUser` チェックは追加しない。両 leaf は `getCurrentUser` を呼ばず `ExportFormPage` に値を渡すだけなので、#475 exports leaf の前例（防御チェックなし）に揃える。
- **ADR-003:** `ExportForm/action` の import は各 leaf に残す（`_app/route.tsx` へ集約しない）。両 leaf に共通の `route.tsx` が無く、再 import は冪等で無害。

## リスクと注意点

- **作業ブランチの基点:** 必ず最新 `origin/main` から分岐。古い地点だと `_app/exports`・`_app/views` が無くコンフリクト・重複の原因になる。
- **RSC マニフェスト登録:** `import "@/components/export/ExportForm/action"` を両 leaf に残すこと。落とすと start/enqueue/cancel/download の server-fn がクライアントビルドで未登録になりエクスポート操作が壊れる。
- **`createFileRoute` 文字列の更新漏れ:** `git mv` だけでは型エラー。`/_app/...` プレフィックス付きへ必ず書き換える。
- **head の path 文字列は URL のまま:** `internalRouteHead(..., "/export")` と `` `/notes/${params.noteId}/export` `` は canonical URL を表すので `/_app` を付けない。
- **`validateSearch` / `staleTime`:** 両ルートとも `staleTime: 0` を維持。`validateSearch` は両ルートとも持たない（`/notes/$noteId/export` は params ベースの `inputValidator`、`/export` は入力なし）。
- **routeTree.gen.ts:** 手動編集禁止。ビルドで再生成。差分が大きく出るが正常。
- **redirect 先の挙動変更:** 未認証直アクセス時の redirect が `/login` → `/`(+`HOME_SEARCH`) に変わる（#293 ADR-006・意図通り）。テストで確認する。

## テスト方針

- `pnpm typecheck && pnpm lint:fix && pnpm format` がクリーンに通る。
- `pnpm test`（unit/integration）がグリーン（ルーティング構造変更のみだが回帰確認として）。
- `pnpm build`（または `pnpm dev`）で `routeTree.gen.ts` が再生成され、`/_app/export/` と `/_app/notes/$noteId/export` がツリーに現れる。
- ブラウザ動作確認:
  - 認証済みで `/export` を開き AppShell 付きで一括エクスポートフォーム（`noteId=null`）が表示・機能する。
  - 認証済みで `/notes/$noteId/export` を開き AppShell 付きで単一ノートエクスポートが表示・機能する。`NoteActions` のエクスポートリンクから遷移できる。
  - 未認証で両 URL に直アクセス → `/`(+`HOME_SEARCH`) へ redirect（旧 `/login` ではない）。
  - 公開ビュー `/notes/public/$noteId` が従来通り（AppShell 無し）で動く（リグレッション確認）。

## レビュー履歴

### 1周目
**修正した点**:
- 問題点ゼロ（両視点とも要修正なし）

**取り込んだ改善提案**:
- S-001（要件視点・アーキ視点 共通）: `createFileRoute` のスラッシュ規約（index 系=末尾スラッシュ付き / 非 index 系=なし）を実装ステップに注記。
- S-002（アーキ視点）: テスト方針に `pnpm test`（unit/integration）グリーン確認を追加。

**見送った提案とその理由**:
- S-002（要件視点・`NoteActions` リンクの型解決根拠の精緻化）/ S-003（要件視点・errorComponent 委譲の明文化）: いずれも plan/ADR の既存記述で結論は正しく、説明の精緻化のみ。実装挙動に影響しないため本文への追記は見送り（本履歴に記録）。`/export` leaf は errorComponent を新設せず `_app/route.tsx` の `AppErrorFallback` を継承する（#475 と同方針）。

1周目で両視点とも問題点ゼロのため、レビューループを終了。
