### Frontend

対象: Issue #819「ページ遷移フィードバック（トップ進捗バー＋編集スケルトン）」の frontend 実装。作業ツリー（ブランチ `issue/819/route-loading-feedback`）の差分をゼロベースでフルレビュー。

対象ファイル:
- `app/components/layout/RouteProgressBar.tsx`（新規, `"use client"`）
- `app/components/layout/styles.ts`（`ROUTE_PROGRESS_BAR` / `ROUTE_PROGRESS_BAR_FILL` 追加）
- `app/components/note/editor/NoteEditorSection.tsx` / `NoteEditorLoader.tsx` / `NoteEditorSkeleton.tsx`（新規）
- `app/routes/__root.tsx` / `app/routes/_app/notes/$noteId/edit.tsx`（改修）
- 各テスト（`RouteProgressBar.test.tsx` / `NoteEditorSection.test.tsx` / `NoteEditorLoader.test.tsx` / `skeletonAria.test.tsx`）

（補足: タスク記載の「PR #820」は実際には Issue #817 の admin 日付 hydration 修正で別物。#819 実装は本ブランチの作業ツリー上にあり、`.issue/819/review/review-001-frontend.md` は未生成のため R1 参照なしでフルレビューした。検証結果: 上記4テスト計15件 PASS、`pnpm typecheck` グリーン。）

#### Blockers
- なし

#### Warnings
- **[W-001]** 進捗バーの indeterminate パルスがアイドル時（バー非表示中）も回り続ける / 場所: `app/components/layout/styles.ts:196-197`（`ROUTE_PROGRESS_BAR_FILL`） / 理由: `ROUTE_PROGRESS_BAR_FILL` の `motion-safe:animate-pulse` は `RouteProgressBar` がマウントされている限り（＝全ルートで常時）走る。親 `ROUTE_PROGRESS_BAR` は非ロード時 `opacity-0` なので視覚的には見えないが、`opacity-0` は `display:none` と違いアニメのキーフレームは進行し続けるため、「進捗中」を表すはずのモーションが実際には「常時進行」になっている（styles.ts のコメントも "in progress motion" と説明しており意味と不一致）。加えて `data-[loading]:opacity-100` で即時表示された瞬間、パルスは任意の位相（例: opacity ~0.5 の谷）で現れうるため、バー出現時にわずかに薄く見える可能性がある。副次的な CPU コスト（off-screen アニメの常時稼働）もある。 / 提案: パルスをロード中だけに限定する。`ROUTE_PROGRESS_BAR` に `group` を付け、fill 側を `group-data-[loading]:motion-safe:animate-pulse` にすれば、`data-loading` が立った時だけパルスが（フル不透明から）開始し、アイドル時は静止する。機能不具合ではなくポリッシュ/効率の指摘なのでブロックにはしない。

#### Notes
- **[N-001]** `RouteProgressBar` のコンポーネント設計は堅実。`useRouterState({ select: (s) => s.isLoading })` の単一 selector 購読は既存 `NoteListViews` パターンに一致。decorative（`aria-hidden="true"`、`role`/`aria-live` なし）で ADR-002 の「ロード読み上げはスケルトンの `aria-live` に一本化」を正しく実装。`data-loading={isLoading || undefined}` は ADR-003 の `data-*` 規約に準拠。反復ユーティリティは module-scope 定数（`ROUTE_PROGRESS_BAR`/`_FILL`）に集約済みで CLAUDE.md スタイリング規約を満たす。
- **[N-002]** 進捗バーの CSS も規約準拠かつ AC 充足。`z-[110]` はヘッダ `z-50`・ドロワー `z-[100]`・スクリム `z-[90]` の上で正しく最上位（リスク欄の z 競合を解消）。`fixed inset-x-0 top-0` ＋ `pointer-events-none` でレイアウト非侵襲・クリック非干渉。`duration-[var(--duration-fast)]`・`ease-[var(--ease-standard)]` は `tokens.css` に実在するトークン参照。表示は即時（`data-[loading]:opacity-100` + `data-[loading]:transition-none`）、消える側のみ 120ms フェード、`motion-reduce:transition-none` で reduced-motion 時は即時表示・即時消去＝静的プレースホルダ（AC-1/AC-6 成立）。SSR 時は `isLoading=false`＝`opacity-0` で server/client 一致し hydration mismatch も起きない。
- **[N-003]** `NoteEditorSection`/`NoteEditorLoader` は詳細ルート（`NoteDetail`/`NoteDetailContent`）の確立パターンへの忠実な収束。`SectionErrorBoundary` → `Suspense fallback={<NoteEditorSkeleton/>}` → server-async loader の構造が一致。`initialTagNames`/`initialEditLock` 導出は元 server fn と逐語同等で `NoteEditor` の props 契約・lazy 初期化は不変（回帰リスク欄を満たす）。redirect ガードは server fn 側（Suspense 外）に残し、not-found は `NoteEditorLoader` 内で JSX 返却（AC-7 の意図的変更＝フルページ `RouteErrorFallback` → インライン表示）を正しく実装。3ケース（notFound インライン / 正常 / 非 NotFound の再 throw）がテストで担保。
- **[N-004]** `NoteEditorSkeleton` は `NoteDetailSkeleton` の a11y 契約（単一 `role="status"` + `aria-live="polite"` + `aria-busy="true"` + `aria-label`、視覚要素は `aria-hidden` ラッパ配下）を正確にミラー。`skeletonAria.test.tsx` のパラメタライズドテストに登録済みで、全 announcing skeleton 共通契約に組み込まれている。`SKELETON_BAR`/`SKELETON_PILL` を使うため reduced-motion 下では `motion-safe:animate-pulse` が無効化され静的（AC-6）。レイアウトは P12（モードタブ/保存アクション/タイトル/ディレクトリピル/タグ行/本文/FrontMatter）を近似しており、実エディタ差し替え時のシフトを抑える意図が満たされている。arbitrary 値（`w-[60%]` 等）は mock 寸法近似で Tailwind ユーティリティの範囲内、新規 CSS は無し。
- **[N-005]** `__root.tsx` の設置は `RootDocument`（`RootComponent` ではなく）に一意化され、root の error/notFound 画面からの再遷移もカバー。decorative かつアイドル時 `opacity-0` なのでそれらの画面で無害、という plan の意図どおり。server component 内から `"use client"` の `RouteProgressBar` を子として描画する RSC 作法も適切。
- **[N-006]** `NoteEditorLoader`/`new.tsx` で `tagSuggestions={tags.tags.map(t => t.name)}` を新たに `NoteEditor` へ渡している。`NoteEditor` は `tagSuggestions?: readonly string[]` を受ける契約なので型・実行とも安全で、オートコンプリートを温める妥当な改善。ただし plan は編集ルートを「呼び出し場所の移設のみ（props 契約不変）」と枠づけていたため、この prop 追加は本ブランチに同居する別系統（タグ combobox）の付随変更で、#819 の厳密なスコープからはわずかにはみ出す。害はないので指摘に留める。
- **[N-007]** 許容トレードオフ（既知・plan に明記済み）: 進捗バーを decorative 化した結果、スケルトン非搭載ルート（admin/settings/public フォーム等）では遷移中のスクリーンリーダー向けロード通知がゼロになる。plan「リスクと注意点」で意図的トレードオフとして受容済みで本 PR の欠陥ではないが、将来スケルトン非搭載の重いルートが増えた際の再検討ポイントとして記録。
