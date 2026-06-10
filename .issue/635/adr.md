# ADR — Issue #635: 共通ローディングUX資産＋ミューテーションの楽観/pending

## ADR-001: パルス/スピンに新トークンを追加せず Tailwind 標準アニメーションを踏襲

### Status
Proposed

### Context
spec/design は「ロード状態はスケルトン（`--color-surface` 矩形＋微パルス）」を規定するが、`app/styles/tokens.css` にはパルス/スピン用のアニメーション変数（keyframes / duration）が無い。一方で実コードは Tailwind v4 標準の `animate-pulse` を `motion-safe:` 付きで使う慣習を既に持つ（`ingestion/UploadDialog` の `SkeletonBlock`、`tag/styles.ts` の `progressBarIndeterminate`）。選択肢は (a) tokens.css に独自パルストークン＋index.css の `@theme inline` 橋渡しを追加、(b) Tailwind 標準 `animate-pulse` / `animate-spin` を踏襲。

### Decision
(b) を採用。`motion-safe:animate-pulse`（Skeleton）/ `motion-safe:animate-spin`（Spinner）を使い、新トークンは追加しない。`prefers-reduced-motion: reduce` は `motion-safe:` バリアントで自動的に尊重される。

### Consequences
- 良い点: 既存慣習と一致。トークン SSOT を増やさない。styling 規約（ユーティリティファースト・新規 CSS 禁止）に適合。
- トレードオフ: パルスのタイミングが Tailwind 既定（2s ease-in-out）に固定される。デザイン上「微パルス」の範囲内であり問題にならない。

---

## ADR-002: BulkActionBar の dim は SelectionContext を最小拡張して行側で表現

### Status
Proposed

### Context
一括ゴミ箱処理中に対象アイテムを dim したい。dim 対象は `state.ids`（選択中行）。pending は `BulkActionBar` の `useTransition` が持つが、行（`ListView`/`TileView`）はその pending を知らない。選択肢は (a) 新規の専用 context を足す、(b) 既存 `SelectionContext` に `pendingBulk` を追加、(c) prop drilling で各行へ渡す。

### Decision
(b) を採用。`SelectionContext`（`SelectionState`/reducer）に `pendingBulk: boolean` を加え、`BulkActionBar` が transition 開始/終了時に dispatch。行側は `pendingBulk && state.ids.has(id)` で `data-pending` を付け、`NoteListViews` と同じ `transition-opacity motion-reduce:transition-none data-[pending]:opacity-60` で dim する。

### Consequences
- 良い点: context を増やさない。既存の dim 視覚（`data-[pending]:opacity-60`）と統一。`useSelection()` を既に使う行コンポーネントにそのまま乗る。
- トレードオフ: `SelectionState` に処理中フラグが混ざる（選択状態と pending の関心がやや混在）。ただし両者は同じ「一括操作」のライフサイクルに属するため許容範囲。

---

## ADR-003: 楽観的更新 vs pending 可視化の振り分け基準

### Status
Proposed

### Context
Issue は「リスト変更系は楽観化、難しい箇所は pending 可視化」を求める。既存実装には両パターンが混在し、docs L772-775 は「`useOptimistic` は親所有データに使えない／リストからの項目削除等は `router.invalidate()` 経路に任せる」と規定している。一貫した判断基準が必要。

### Decision
以下を基準とし、docs にも明文化する:
- (a) 自コンポーネントが所有する単一状態のトグル/インライン編集 → `useOptimistic`（例: DirectoryTree のリネーム、FilterBar のフィルタ選択）。
- (b) 親が所有するリストの add/remove/rename → 親の `useOptimistic`(reducer) に集約（例: TagList の create/delete/rename/merge）。
- (c) navigate を伴う作成/削除、またはダイアログ form 経由の確定操作 → pending 可視化（disabled + pending ラベル + 必要に応じ `aria-busy`）。

この基準により、note 作成/削除/リネーム（navigate 伴う）と各種ダイアログ（move/visibility/directory）は (c)、publication 可視性変更も (c)（ダイアログ form）と判定し、今回は新規の楽観化を追加しない。

### Consequences
- 良い点: 既存の確立パターンと整合。`useOptimistic` の制約に反する無理な楽観化を避ける。判断根拠が docs に残り、将来の横展開がぶれない。
- トレードオフ: navigate 系操作は楽観的な即時反映にならない（pending 表示で許容）。Issue の「難しい箇所は最低限 pending 可視化」に合致。

---

## ADR-004: Spinner は土台として新設するが Phase 1 で必須組み込みはしない

### Status
Proposed

### Context
DoD は「共通 Skeleton / Spinner 資産が用意される」こと。一方 spec/design は「スピナーよりスケルトン優先・スピナー多用は避ける」。Phase 1 でスピナーを各所に組み込む要件は無い。

### Decision
`Spinner` コンポーネントは資産として新設し単体テストを置くが、Phase 1 では既存 UI への必須組み込みはしない。インライン小領域向けの控えめな実装に留め、「多用しない」方針を JSDoc に明記。NoteEditor 保存ボタン（B-2）でのみ任意採用の余地を残す。

### Consequences
- 良い点: DoD を満たしつつデザイン方針（スケルトン優先）を侵さない。Phase 2 以降で必要になったとき即使える。
- トレードオフ: Phase 1 時点で Spinner の実利用箇所がほぼ無く「未使用資産」になりうる。土台整備という Issue の主旨に沿うため許容。

---

## ADR-005: 共通 Skeleton バーの角丸は既存 SkeletonBlock（rounded-md）を踏襲

### Status
Accepted（review-001 N-001 を受けて確定）

### Context
P13a モックの `.skeleton-bar` は `border-radius: var(--radius-sm)`（6px）だが、置換前の `UploadDialog.SkeletonBlock` は `rounded-md`（8px）を使っていた。共通 `Skeleton` をどちらに合わせるか。

### Decision
`rounded-md`（既存 `SkeletonBlock` の値）を踏襲する。P13a の `--radius-sm` に厳密一致させると現行 UploadDialog の表示を 8px→6px に変える（微小な regression）ことになるため。

### Consequences
- 良い点: 既存表示に対する regression ゼロ。12px 高のバーで 6px↔8px の角丸差は視認困難で実害なし。
- トレードオフ: P13a モックの radius-sm とは 2px 乖離する。デザイン SSOT との厳密一致より既存挙動の維持を優先した。Phase 2 でスケルトンを各所へ展開する際、デザインと厳密に揃える必要が出たら再検討。
