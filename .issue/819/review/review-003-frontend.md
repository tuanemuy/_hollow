### Frontend

対象: Issue #819「ページ遷移フィードバック（トップ進捗バー＋編集スケルトンの Suspense ストリーミング）」の frontend 実装（R3 ゼロベースフルレビュー）。ブランチ `issue/819/route-loading-feedback` / コミット `dd02e9d3`。R2 で指摘した W-001（アイドル時パルス）の修正確認を含む。

対象ファイル:
- `app/components/layout/RouteProgressBar.tsx` / `app/components/layout/styles.ts`（`ROUTE_PROGRESS_BAR` / `ROUTE_PROGRESS_BAR_FILL`）
- `app/components/note/editor/NoteEditorSection.tsx` / `NoteEditorLoader.tsx` / `NoteEditorSkeleton.tsx`
- `app/routes/__root.tsx` / `app/routes/_app/notes/$noteId/edit.tsx`
- 各テスト（`RouteProgressBar.test.tsx` / `NoteEditorSection.test.tsx` / `NoteEditorLoader.test.tsx` / `skeletonAria.test.tsx`）

検証: 関連テスト全 PASS（vitest 29ファイル/477件グリーン）。Tailwind v4.3.0 の `compile()` API で `group-data-[loading]:motion-safe:animate-pulse` の生成 CSS を実測確認済み（下記 N-001）。`initialEditLock`/`initialTagNames` 導出が `main` 版と逐語同等であること、not-found JSX が `NoteDetailContent` と同型（`try/catch`＋`isNotFoundError`→`role="alert"` JSX、文言も一致）であることを git 差分・実ファイルで確認済み。

#### Blockers
- なし

#### Warnings
- なし（R2 W-001 は修正済み・実効性を実測確認。N-001 参照）

#### Notes
- **[N-001]** R2 W-001（アイドル時パルスが常時回る）修正の実効性を **Tailwind v4.3.0 実コンパイルで確認**。`ROUTE_PROGRESS_BAR` に `group` を付与し、fill を `group-data-[loading]:motion-safe:animate-pulse` に変更した構成は正しく機能する。生成 CSS は `.group-data-\[loading\]\:motion-safe\:animate-pulse { &:is(:where(.group)[data-loading] *) { @media (prefers-reduced-motion: no-preference) { animation: var(--animate-pulse); } } }`。親（`ROUTE_PROGRESS_BAR`）は `group` を常時持ち `data-loading` 属性のみ条件付き（`data-loading={isLoading || undefined}`）なので、`[data-loading]` が立つロード中だけ子のパルスが発火し、アイドル時（属性不在）は静止する。これで「進捗中モーション」が意味どおりロード中限定になり、off-screen での常時アニメ・出現時の位相ズレ（薄表示）の両懸念が解消。表示ロジックとの相互作用も健全: `isLoading→true` で opacity 即時100＋パルスをフレーム先頭（opacity:1）から新規開始、`isLoading→false` でパルス即停止のうえ 120ms フェードアウト中は fill 静止となり、フェード中の残存パルスも起きない。`场:where(.group)` のゼロ specificity 化も想定どおり。
- **[N-002]** `RouteProgressBar` のコンポーネント設計は堅実。`useRouterState({ select: (s) => s.isLoading })` 単一 selector は `NoteListViews` の既存パターンに一致。decorative（`aria-hidden="true"`、`role`/`aria-live` なし）で ADR-002 の「ロード読み上げはスケルトンの `aria-live` に一本化」を実装。CSS も規約準拠: `z-[110]`（ヘッダ z-50/ドロワー z-[100]/スクリム z-[90] の上）、`fixed inset-x-0 top-0`＋`pointer-events-none` でレイアウト非侵襲・クリック非干渉、`duration-[var(--duration-fast)]`/`ease-[var(--ease-standard)]` は実在トークン参照、表示即時（`data-[loading]:opacity-100`＋`data-[loading]:transition-none`）・消える側のみ 120ms フェード・`motion-reduce:transition-none` で reduced-motion 時は静的（AC-1/AC-6）。SSR 時 `isLoading=false`＝`opacity-0` で hydration 一致。反復ユーティリティは `ROUTE_PROGRESS_BAR`/`_FILL` に集約（CLAUDE.md スタイリング規約）。
- **[N-003]** `NoteEditorSection`/`NoteEditorLoader` は詳細ルート（`NoteDetail`/`NoteDetailContent`）の確立パターンへの忠実な収束。`SectionErrorBoundary`→`Suspense fallback={<NoteEditorSkeleton/>}`→server-async loader の構造が一致。not-found は `NoteDetailContent` と同型（`try/catch` Promise.all ＋`isNotFoundError`→`<div role="alert"><h1>ノートが見つかりません</h1>…` を JSX 返却、非 NotFound は re-throw、文言も一致）で AC-7 の意図的変更（フルページ `RouteErrorFallback`→インライン）を正しく実装。redirect ガードは server fn 側（Suspense 外）に残置（`.issue/12/adr.md` ADR-004 準拠）。`initialTagNames`/`initialEditLock` 導出は `main` 版と逐語同等（`state:"acquired"`/`lockId:null`/`expiresAt` の Date→getTime）で `NoteEditor` の props 契約・lazy 初期化は不変。3ケース（notFound インライン/正常/非 NotFound 再 throw）がテストで担保。
- **[N-004]** `NoteEditorSkeleton` は `NoteDetailSkeleton` の a11y 契約（単一 `role="status"`＋`aria-live="polite"`＋`aria-busy="true"`＋`aria-label`、視覚要素は `aria-hidden` ラッパ配下）を正確にミラー。`skeletonAria.test.tsx` のパラメタライズドテストに登録済み。`SKELETON_BAR`/`SKELETON_PILL` 経由で reduced-motion 下は `motion-safe:animate-pulse` 無効化＝静的（AC-6）。P12（モードタブ/保存アクション/タイトル/ディレクトリピル/タグ行/本文/FrontMatter）を近似しシフト抑制。arbitrary 値（`w-[60%]` 等）は寸法近似でユーティリティ範囲内、新規 CSS なし。
- **[N-005]** `__root.tsx` の設置は `RootDocument`（`RootComponent` ではなく）に一意化され、root の error/notFound 画面からの再遷移もカバー。decorative かつアイドル時 `opacity-0` でそれらの画面で無害という plan の意図どおり。server component から `"use client"` の `RouteProgressBar` を子描画する RSC 作法も適切。
- **[N-006]** （R2 N-006 から継続）`NoteEditorLoader` が `tagSuggestions={tags.tags.map(t => t.name)}` を新規に `NoteEditor` へ渡す。`main` には無く本ブランチで追加された prop（`NoteEditor` は `tagSuggestions?: readonly string[]` を受けるため型・実行とも安全）。タグ combobox（#789）系の付随改善で #819 の厳密スコープからはわずかにはみ出すが害なし。指摘に留める。
- **[N-007]** （R2 N-007 から継続）許容トレードオフ: 進捗バー decorative 化により、スケルトン非搭載ルート（admin/settings/public フォーム等）では遷移中の SR 向けロード通知がゼロ。plan「リスクと注意点」で意図的トレードオフとして受容済み。将来スケルトン非搭載の重いルートが増えた際の再検討ポイントとして記録。
