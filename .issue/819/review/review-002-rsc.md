# PR Review R2 — Issue #819 ページ遷移フィードバック（RSC/Architecture 観点）

**対象:** ブランチ `issue/819/route-loading-feedback`（作業ツリー未コミット差分。タスクの「PR 820」は実際には Issue #817 のマージ済み PR であり、本レビューは #819 の作業ツリー実装を対象とする）
**Round:** 2回目（ゼロベース・フルレビュー）
**Date:** 2026-07-10

R1 修正の反映（`resetKey={props.noteId}` 追加、not-found 判定→seed 導出の順序補正）を含め、全面的に再確認した。

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 6
- Verdict: **APPROVED**

typecheck 通過（`tsgo` エラーなし）、対象テスト 15 件全 PASS（`NoteEditorLoader` / `NoteEditorSection` / `RouteProgressBar` / `skeletonAria`）。

---

### RSC/Architecture

#### Blockers

なし

#### Warnings

なし

強く見た主要リスク（Suspense 内 throw / head 干渉 / props 契約・lazy 初期化 / 依存方向）はいずれも収束先パターン（`NoteDetail`）と一致しており、問題は検出されなかった。根拠は Notes に記す。

#### Notes

- **[N-001] Suspense 内 throw を正しく回避している。** `renderNoteEditor`（`edit.tsx:22`）は redirect ガード（`throw redirect()`）を Suspense 境界の**外側**（server fn 本体）に残し、`renderServerComponent(<NoteEditorSection .../>)` をデータ await せず即返している。not-found は `NoteEditorLoader.tsx:42-52` で `try/catch` + `isNotFoundError` によりインライン JSX を**返却**（throw しない）。`.issue/12/adr.md` ADR-004 の「RSC 内 `throw notFound()/redirect()` は router に届かない」制約に完全準拠し、`NoteDetail`/`NoteDetailContent` と同型。

- **[N-002] not-found 判定→seed 導出の順序が正しい（R1 修正の確認）。** `NoteEditorLoader` は `Promise.all` を `try/catch` で囲み、NotFound を先に処理してから `detail` を分解し `initialTagNames`/`initialEditLock` を導出する（`:54-67`）。not-found 時に未定義の `detail` へ触れる経路はない。非 NotFoundError は `throw e`（`:51`）で再送出され、多層防御として `SectionErrorBoundary` が flight ストリーム経由で捕捉しセクション内エラーに落ちる（500 化しない）。テスト `NoteEditorLoader.test.tsx` が 3 分岐（notFound JSX / 正常 / 再throw）を網羅。

- **[N-003] `NoteEditor` の props 契約・lazy 初期化が不変。** 旧 `edit.tsx` server fn が組み立てていた 10 個の props（`mode`/`noteId`/`initialTitle`/`initialContentHtml`/`initialFrontMatter`/`initialTagNames`/`initialDirectoryId`/`initialEditLock`（条件付きスプレッド）/`tree`/`tagSuggestions`）と導出ロジック（`tagIds`→`tags.byId` 名前解決、`editLock`→`acquired` の `as const`）が `NoteEditorLoader.tsx:56-82` へ**逐語移設**されており差分なし。呼び出し経路が server fn → server async component に移っただけで client 本体は無改変。`NoteEditor` の lazy `useReducer` 初期化（初回のみ seed）も不変。

- **[N-004] 同一ノートの編集中状態リセット回帰は発生しない。** `NoteEditor` は保存後に `router.navigate({ to: "/notes/$noteId" })` で**離脱**する（`NoteEditor.tsx:374,396`）だけで、編集ルート loader を in-place で `router.invalidate()` しない。よって Suspense 化後も「編集中に自ルート loader が再走 → Suspense 再サスペンド → skeleton → 再マウントで seed リセット」という経路は成立しない。唯一の再走経路は `SectionErrorBoundary` の retry だが、これは既にエラー表示（編集中状態を保持していない）からの再取得であり回帰にあたらない。lazy 初期化の設計意図はストリーミング化後も維持される。

- **[N-005] `head` 干渉なし。** `edit.tsx` の `head`（`:39-47`）は `match.context?.config` からのみ算出され loader データに依存しない。`renderServerComponent` を await せず即返す形は詳細ルート（`index.tsx`）で成立済みの同型であり、`head` 生成（route 側の独立関数）と干渉しない。`staleTime: 0`（ADR-003）・`errorComponent: RouteErrorFallback`・`component` も不変。

- **[N-006] 依存方向・レイヤー責務・スタイリング規約に適合。**
  - 新規 3 コンポーネントは presentation（`app/components/note/editor/`, `app/components/layout/`）に収まり、`@/core/application`（`UserDTO` 型・`isNotFoundError`）への presentation→application 依存のみ（`NoteDetail` と同一の依存形）。逆方向・ドメイン混入なし。
  - `RouteProgressBar` は `"use client"` で `useRouterState` のみ購読し状態管理を持ち込まず、`RootDocument`（`RootComponent` ではなく error/notFound 画面からも再利用される最上位）に一意設置（ADR-002 準拠）。`aria-hidden` の decorative でロード読み上げは skeleton 側 `aria-live` に一本化（二重読み上げ回避）。
  - スタイルは `layout/styles.ts` の module-scope 定数（`ROUTE_PROGRESS_BAR`/`ROUTE_PROGRESS_BAR_FILL`）に集約し `data-[loading]:` variant ＋トークン参照（`--duration-fast`/`--ease-standard`/`z-[110]`）。表示即時・消滅フェード・`motion-reduce:transition-none`・外側/内側の opacity 制御分離（実装メモ）まで CLAUDE.md スタイリング規約と ADR に一致。`pointer-events-none fixed` でレイアウト非侵襲、z 順（header 50 / drawer 100 / scrim 90 < 110）も正しい。

#### 参考（スコープ外・回帰ではない）

- 別ノート間の編集遷移（`/notes/A/edit`→`/notes/B/edit`）で `NoteEditor` の lazy-init-once により状態が保持されうる論点は、`key` 未付与の**既存挙動**であり本 PR で悪化していない（`resetKey` 変更で Suspense が skeleton にフォールバックする分、むしろ再マウントで解消される可能性がある）。本 Issue スコープ外。
- `NoteEditorSection` は `user: UserDTO` 全体を Loader に渡すが実使用は `user.id` のみ。`NoteDetail` も full DTO を渡す既存パターンに沿っており実害なし。将来 RSC シリアライズ最小化の観点で id のみに絞る余地はあるが本 PR の判断としては妥当。
