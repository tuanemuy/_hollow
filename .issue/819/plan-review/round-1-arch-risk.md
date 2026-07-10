# plan.md レビュー Round 1 — アーキテクチャ整合性・実現可能性・リスク

**対象:** `.issue/819/plan.md` / `.issue/819/adr.md`
**視点:** プロジェクトのあるべきアーキテクチャとの整合性・実現可能性・リスク
**日付:** 2026-07-10

## 総評

全体として**実装可能性が高く、既存の確立パターンへの収束として正しく設計された良質な計画**。
編集ルートを詳細ルート（`renderNoteDetail` → 即 `renderServerComponent` → `NoteDetail` = server 同期ラッパ ＋ `NoteDetailContent` = async ＋ not-found JSX 返却）と同型に揃える方針は、`.issue/12/adr.md` ADR-004 が確立した「RSC 経由の `throw notFound()`/`redirect()` は機能せず、JSX 返却なら Suspense 内でも安全」という制約に正しく沿っている。グローバル進捗バーの `useRouterState({ select: s => s.isLoading })` 購読も既存 `NoteListViews.tsx` の作法どおり。

実装コードとの照合で、計画の中核前提を検証済み:

- **`isLoading` のライフサイクル検証（AC-1/AC-3 の裏取り）**: `router-core` の実装上、`isLoading` は navigation コミット開始時（`commitLocation` の batch）で**同期的に `true`** になり（`router.js` L527）、loader 解決後の `onReady` で `false` になる（L581）。つまりクリック直後・旧ページ表示中に即 `true` になるため、進捗バーが「遷移直後のフィードバック」を担えるという計画の前提は正しい。intent プリロードが効かないモバイルでも round-trip 全期間 `true` になる（AC-3 成立）。
- **head 干渉（リスク欄の確認事項）**: 編集ルートの `head` は `match.context?.config`（root の `beforeLoad` 由来）にのみ依存し、loader 戻り値とは独立。詳細ルートが `renderServerComponent` を await せず返す構成で既に `head` と共存できている以上、編集ルートも構造同型で成立する。**このリスクは詳細ルート先例で実質デリスク済み**であり、確認は形式的で足りる。
- **root への client コンポーネント設置の妥当性**: `RootDocument`（server component）は RouterProvider 配下でレンダされるため、`"use client"` の `RouteProgressBar` から `useRouterState` を購読可能（既に `TanStackRouterDevtools` という client を body 内に置いている前例あり）。SSR 時は `isLoading=false`（idle）でハイドレーション不整合も出ない。

以下は**軽微な指摘**にとどまる。ブロッカーは無い。

## 問題点（要修正）

- **[P-001]** AC-7 の「既存挙動の維持（回帰防止）」という位置づけが**事実と異なる**（実際は意図的な挙動変更）
  - 理由: 現状の編集ルートで非存在ノートを開くと、`renderNoteEditor`（server fn handler 内）の `loadNoteDetail` が `NotFoundError` を throw → `errorResponseMiddleware` がシリアライズ → loader が reject → route の `errorComponent`（`RouteErrorFallback`）が発火し、**フルページの「エラーが発生しました」パネル**（`sanitizeRouteError` 表示）になる。本計画の Suspense ストリーミング化後は、not-found は `NoteEditorLoader`（RSC）内で `isNotFoundError` を catch して詳細と同じインライン「ノートが見つかりません」JSX を返す形になり、`_app` シェル（ヘッダ/サイドバー）を保ったまま**セクション内インライン表示**へ変わる。これは詳細ルートとの一貫性という点で望ましい変更だが、「既存挙動の維持」ではなく**明確な挙動変更**である。plan / AC-7 が「維持」と記述していると、実装者・テスターが旧 `RouteErrorFallback` を期待し、変わったことを「回帰」と誤判定するおそれがある。
  - 提案: AC-7 の由来を「既存挙動の維持（回帰防止）」から「**詳細ルートと一貫した not-found 表示への統一（意図的変更）**」に改める。テスト方針・手動確認の期待値も「フルページのエラーパネルではなく、`_app` シェル内インラインの『ノートが見つかりません』が出ること」に更新する。あわせて、万一 `NoteEditorLoader` の try/catch を付け忘れて生 `NotFoundError` が RSC 内で throw された場合は（ADR-004 のとおり）`SectionErrorBoundary` が flight ストリーム経由でこれを捕捉し「ノートを読み込めませんでした」を出す＝ 500 にはならない、という多層防御を明記しておくと安全。

## 改善提案（検討推奨）

- **[S-001]** グローバル進捗バーの `aria-live` ライブリージョンが**全ルートの遷移ごとに読み上げを発火**し、既存のページ別スケルトンのライブリージョンと二重通知になる
  - 理由: 計画では `RouteProgressBar` に `role="status" aria-live="polite" aria-label="ページを読み込み中"` を持たせる（ADR-002）。一方 `NoteDetailSkeleton`（`aria-label="ノートを読み込み中"`）・新設 `NoteEditorSkeleton`（`aria-label="エディタを読み込み中"`）・`NoteListViews`（`aria-busy`）も各自ライブリージョンを持つ。詳細/編集への遷移では「ページを読み込み中」→「(ノート|エディタ)を読み込み中」が polite キューで連続読み上げされ冗長。しかも**進捗バーは今後アプリ全ルートの毎クリックで発話**することになり、SR ユーザーには騒がしい。NProgress 系のトップバーは通常 decorative（視覚のみ）で実装されるのが一般的で、既存 `common/ProgressBar.tsx` にも `decorative`（`aria-hidden`）オプションがある。
  - 提案: `RouteProgressBar` を**視覚のみ（`aria-hidden` / decorative）**にし、SR へのロード通知は各ページのスケルトン既存ライブリージョンに委ねるのが素直（スケルトンの無いルートの遷移は概ね高速で、通知の実益も小さい）。逆に「スケルトンの無いルートでも SR 通知したい」を優先するなら、進捗バーにのみライブリージョンを残しスケルトン側を decorative に寄せる、といった**ライブリージョンの単一化**方針を plan で明示する。少なくとも二重通知の相互作用を設計判断として言及すべき。

- **[S-002]** 進捗バーのちらつき緩和策が「検討」止まりで、AC-1（200ms 以内フィードバック）との整合が未確定
  - 理由: `defaultPreload: "intent"` によりデスクトップのホバー予読でキャッシュヒットすると `isLoading` が一瞬だけ `true` になり点滅しうる（plan L137 も認識）。しかし緩和を「CSS の短い遅延/フェード」または「進捗バー側の表示遅延」と両論併記のまま TBD にしている。JS タイマーで表示を遅延させる方式は、遅延値が大きいと AC-1（モバイルの往復で 200ms 以内に視覚変化）と競合し、実装が state 管理を持ち込む分だけ ADR-002 の「NProgress 風の数値管理は持たない」方針とも緊張する。
  - 提案: 緩和は**純 CSS の opacity トランジション（`data-[loading]:` で `opacity-0 → opacity-100`）**で表現し、フェードイン時間は AC-1 を侵さない範囲（例: `--duration-fast` 120ms 相当以下、かつ十分小さく）に固定する方針を plan に明記する。`prefers-reduced-motion: reduce` 時はフェードを 0ms（即時表示）にする（spec/design L93）。JS の遅延タイマーは持ち込まない（`useRouterState` 購読 ＋ CSS variant のみで完結させる）と決め切ると、ADR-002 の「`useRouterState` だけで完結」とも整合する。

- **[S-003]** 既存 `app/components/common/ProgressBar.tsx` との関係・命名整理への言及がない
  - 理由: プロジェクトには既にインライン用の presentational `ProgressBar`（determinate/indeterminate、`TRACK`+`FILL`、`decorative` オプション、`motion-safe:animate-pulse`）が存在する。本計画の新設 `RouteProgressBar`（`layout/`、fixed トップ、route 遷移専用）は関心が異なり別コンポーネントで妥当だが、plan/調査結果に既存 `ProgressBar` への言及が無く、レビュアーやテスターが命名・役割を混同するおそれがある。indeterminate バーの視覚表現（`motion-safe:animate-pulse` の accent フィル、a11y 分岐）は既存 `ProgressBar` と設計思想が重なるため、参考にできる。
  - 提案: 調査結果に既存 `common/ProgressBar.tsx` を挙げ、「別関心（インライン job 進捗 vs グローバル route 遷移バー）ゆえ再利用せず新設する」旨と、indeterminate 表現の作法（`motion-safe:` パルス、reduced-motion 静的、decorative オプションの有無）を既存に揃える方針を一行添える。

- **[S-004]** ADR-001 の「案2 は A/B 双方の**全期間**で `isLoading` が true」という記述は、案1（Suspense ストリーミング化）採用後は不正確
  - 理由: 案1で loader が即解決（RSC シェルを await せず返却）すると、シェル到達＝`onReady` で `isLoading` は `false` になり、空白 B（3クエリ完了まで）は**進捗バーではなく Suspense スケルトン**がカバーする。実際の UX（A=進捗バー、B=スケルトン）は妥当だが、ADR-001 の「A/B 双方の全期間で true」という因果説明は案1適用後の実挙動と食い違う。
  - 提案: ADR-001 を「案2 は空白 A（往復）を進捗バーで、案1は空白 B（クエリ完了まで）をスケルトンで担い、両者が空白を分担してカバーする」という**分担の説明**に補正する（結論・採用判断は変えなくてよい）。

## 良い点

- **確立パターンへの収束が正しい**: 編集ルートを詳細ルートの `Section(server 同期) → Suspense(fallback=Skeleton) → Loader(server async) → not-found JSX 返却` 構造へ揃える方針が、`.issue/12/adr.md` ADR-004 の「RSC 内 `throw notFound()/redirect()` は不可、JSX 返却は可」制約を踏まえて設計されている。redirect ガードを server fn 側（Suspense 外）に残す判断も正確。
- **レイヤー影響範囲の把握が正確**: ドメイン/ユースケース/アダプター無影響、プレゼンテーション層限定という切り分けが妥当。`NoteEditor` client 本体の props 契約・lazy initializer による初回のみ seed（loader 再実行で編集中状態をリセットしない設計）を「不変に保つ」とリスク欄で明示しており、回帰の勘所を押さえている。
- **スタイリング規約への準拠**: Tailwind ユーティリティのみ・`data-loading={isLoading || undefined}` ＋ `data-[loading]:` variant・`motion-safe:`/`motion-reduce:` 分岐・反復ユーティリティの module-scope 定数化・デザイントークン（`--color-accent`）利用と、CLAUDE.md スタイリング規約と ADR-003（`data-*` 慣習）を正しく踏襲。新規 CSS/`@apply` を持ち込まない。
- **`staleTime: 0` 維持の判断（ADR-003）が妥当**: 編集は最新本文・最新ロック前提であり、キャッシュ短絡の整合性リスクが体感改善を上回る、Suspense で待ち時間は視覚的にマスクされる、という論理が正しい。案5 を採らない理由が明確。
- **スコープ規律**: `pendingComponent`/`defaultPendingMs`（案3）・ページトランジション（案4）を「重複」「装飾は入れない方針（spec/design L93）に不一致」として明示的に除外し、Issue 受け入れ基準を満たす最小構成に絞っている。過剰実装を避けている。
- **`z-index` 競合の洗い出し**: ヘッダ `z-50`・ドロワー `z-[100]`・オーバーレイ `z-[90]` を調査し `z-[110]` で最上位に置く判断が具体的（なお `common/styles.ts` の `dialogBackdrop` も `z-[100]` だが `z-[110]` が勝つため問題なし）。
- **テスト方針が既存テスト形態に接地**: `NoteListViews.test.tsx` の `useRouterState` を vi.mock する既存パターン、`NoteDetailSkeleton`/`skeletonAria.test` の a11y 検証パターンに倣う方針で、実装可能性が高い。
