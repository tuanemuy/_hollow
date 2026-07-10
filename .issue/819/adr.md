# ADR — Issue #819: ページ遷移時に「読み込んでいる感」がなく操作にラグを感じる

## ADR-001: 編集フィードバックは「Suspense ストリーミング化＋グローバル進捗バー」の2本立てで実現する

### Status
Proposed

### Context
Issue は改善案を優先度順に5つ挙げている: (1) 編集ルートを詳細と同じ Suspense ストリーミングに揃える, (2) グローバルなトップ進捗バー, (3) 編集ルートに `pendingComponent`＋`defaultPendingMs`, (4) ページ遷移トランジション, (5) `staleTime` 見直し。

問題の本質は 2 つの空白にある:
- **A. loader ラウンドトリップ中**（クリック→server fn が RSC シェルを返すまで）: TanStack Router は `pendingComponent` が無いと旧ページ（詳細）を無変化で表示し続ける。ここが「無反応」の主因。
- **B. RSC シェル到着後**（3クエリ完了まで）: 編集は Suspense 境界を持たないため、loader が全 await 後にしか解決せず、空白 A が B の分だけ長引く。

案1（Suspense 化）は B を解消し、詳細ルートと同じ「即スケルトン→ストリーム」を編集にもたらす。ただし空白 A（シェル到着までの往復）は依然残る。案2（グローバル進捗バー, `useRouterState.isLoading`）は navigation コミット開始時に同期的に `isLoading=true` になり、往復中の即時フィードバックを与え、かつ intent プリロードが効かないモバイルでも機能する（受け入れ基準2）。

なお視覚フィードバックの**主体はフェーズで分担する**: 空白 A（loader 往復中）は進捗バーが主で、シェル到着（`onReady`）で `isLoading` が `false` に戻り、空白 B（3クエリ完了まで）は Suspense スケルトンが主になる。`isLoading` 自体は往復中（A）に true・シェル到着（B 開始）で false へ落ちるので「A/B 全期間で true」ではなく、両者が空白を**分担**してカバーする関係である。

案3（`pendingComponent`＋`defaultPendingMs`）は A を埋める代替だが、案1で loader が即解決するようになるとほぼ発火せず、案2と役割が重複する。案4（トランジション）は spec/design「装飾は入れない」に反しちらつきリスクが高い。

### Decision
案1（編集ルートの Suspense ストリーミング化）と案2（グローバルトップ進捗バー）を**併用**する。
- 案2 が空白 A の即時フィードバック（200ms 以内, モバイル対応）を担う主レバー。
- 案1 が空白 B を解消し、詳細ルートと一貫した編集スケルトンのストリーミングを担う。
- 案3・案4 は採用しない（重複・方針不一致）。

編集ルートの Suspense 化は、詳細ルート（`NoteDetail` = server 同期ラッパ ＋ `NoteDetailContent` = async ＋ not-found JSX 返却）で既に確立したパターンへの収束であり、盲目的模倣ではなくプロジェクトの「あるべき姿」への是正である。

### Consequences
- 良い点: 空白 A/B を両方カバーし、全ルートで一貫した遷移フィードバック。編集ルートが詳細ルートと同じアーキテクチャに揃い、非対称が解消。ルート個別の `pendingComponent` を増やさずグローバルに底上げできる。
- トレードオフ: 進捗バーの client 購読（`useRouterState`）を全ルートに常設する。新規コンポーネント3つ（Section/Loader/Skeleton）＋進捗バーで表面積が増える。高速遷移時の進捗バーちらつきは純 CSS の opacity フェード（消える側のみ、JS タイマー無し）で緩和する（ADR-002）。

---

## ADR-002: グローバル進捗バーの配置・可視化・アクセシビリティ方式

### Status
Proposed

### Context
進捗バーをどこに置き、どう可視化し、スクリーンリーダー・`prefers-reduced-motion` にどう配慮するかを決める必要がある。制約: ヘッダは `sticky top-0 z-50`、モバイルドロワー `z-[100]`、オーバーレイ `z-[90]`。spec/design はスピナー回避・スケルトン優先、アニメは状態遷移補助のみ・`prefers-reduced-motion: reduce` で 0ms、状態通知は `aria-live="polite"`。

選択肢:
- 配置先: `__root.tsx`（全ルート共通, 最上位） vs `_app/route.tsx`（認証レイアウトのみ）。
- 可視化: NProgress 風の擬似進捗（進行率を演出） vs indeterminate な薄いバー。

### Decision
- **配置**: `__root.tsx` の `RootDocument` `<body>` 内に `"use client"` の `RouteProgressBar` を常設。public/auth を含む全ルートで一貫させ、認証レイアウト外の遷移でもフィードバックを出す。
- **スタイル**: `fixed top-0 inset-x-0`, 高さ 2px（`h-0.5`）, `bg-accent`, `z-[110]`（ヘッダ/ドロワー/オーバーレイより上）。可視/不可視は `data-loading={isLoading || undefined}` ＋ `data-[loading]:` variant で切替。レイアウトを侵さない fixed。
- **アニメ／ちらつき緩和**: 進行率演出（NProgress 風の数値管理）は持たず、`isLoading` の間だけ表示する indeterminate バー。動きは `motion-safe:` でのみ、`motion-reduce:` では静的バー（spec/design L93, L217）。高速遷移のちらつき緩和は**純 CSS の opacity トランジション**で行う — 表示は即時（`data-[loading]:opacity-100`）、消える側にのみ短いフェード（`--duration-fast` 120ms 相当以下）。**JS の遅延タイマー（表示遅延の `setTimeout` / `defaultPendingMs` 相当）は導入しない**ので、表示を遅らせず AC-1「200ms 以内」を常に満たす。`prefers-reduced-motion: reduce` 時はトランジションも 0ms（即時）。反復ユーティリティは module-scope 定数化（CLAUDE.md スタイリング規約）。
- **a11y**: 進捗バーは **decorative（`aria-hidden`、`role`/`aria-live` なし）**。バー矩形は純粋な視覚グリフであり、ロード状態の SR 通知は各ページ側スケルトンの `aria-live`（`NoteDetailSkeleton`/`NoteEditorSkeleton` 等）に一本化する。進捗バーにライブリージョンを持たせると全ルートの毎クリックで発話し、スケルトンの `aria-live` と二重読み上げになり騒がしいため。既存 `common/ProgressBar.tsx` の `decorative` オプションと同じ設計思想。

### Consequences
- 良い点: 全ルート一貫・非侵襲・トークン準拠・a11y/reduced-motion 準拠。NProgress 等の外部依存を持ち込まず、`useRouterState` だけで完結。
- トレードオフ: 進行率を演出しないため「あと何割」は伝わらない（ただし Issue が求めるのは「遷移している感」であり進行率ではない）。高速遷移のちらつきは純 CSS の opacity フェード（消える側のみ）で吸収し、JS タイマーは持ち込まない。

---

## ADR-003: 編集ルートの `staleTime: 0` は変更しない

### Status
Proposed

### Context
改善案5は「`staleTime` の見直し」で、再取得コスト＝待ち時間の削減を挙げる。編集ルートは現在 `staleTime: 0` で毎回フル再実行。詳細ルートは `import.meta.env.DEV ? 0 : Infinity`。

編集画面は「最新本文の取得」と「編集ロックの取得」を前提とする。`staleTime` を延ばすとナビゲーションで前回のスナップショットを再表示し、他デバイス/他タブでの更新やロック状態を取りこぼすリスクがある。

### Decision
`staleTime: 0` を維持する。Suspense ストリーミング化（ADR-001）で待ち時間は視覚的にマスクされるため、キャッシュ短絡による体感改善より編集データの整合性を優先する。

### Consequences
- 良い点: 編集画面が常に最新本文・最新ロック状態で開く。データ不整合リスクを排除。
- トレードオフ: ナビゲーションのたびに loader が再実行される。ただし進捗バー＋スケルトンで往復中もフィードバックが出るため、体感上の「無反応」は解消される。

---

## 実装メモ（2026-07-10, 実装時に確定）

- **進捗バーの2要素構成**: `RouteProgressBar` は外側コンテナ（fixed/z-index/opacity での表示制御）＋内側フィル（`bg-accent` + `motion-safe:animate-pulse`）の2要素に分けた。indeterminate の pulse は `animate-pulse`（opacity を 1↔0.5 でアニメ）であり、これを表示/非表示の opacity トランジションと同一要素に載せると両者の opacity 制御が衝突する。関心を分離し、外側が「見える/消える」を、内側が「進行中の動き」を担う。ADR-002 の可視化・アニメ方針はそのまま満たす。
- **duration トークンの参照**: フェードは既存コード同様 `duration-[var(--duration-fast)] ease-[var(--ease-standard)]`（admin フォーム群・public drawer と同じ書式）で `--duration-fast: 120ms` を参照。
- **`NoteEditorLoader` の notFound 分岐**: `NoteDetailContent` と同じく `try/catch` + `isNotFoundError` でインライン JSX を返す。`initialEditLock` の導出は現行 server fn のロジック（`as const`）をそのまま移設し、`NoteEditor` の props 契約・lazy 初期化は不変。
