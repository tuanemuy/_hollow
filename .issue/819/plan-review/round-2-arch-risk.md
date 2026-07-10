# plan.md レビュー Round 2 — アーキテクチャ整合性・実現可能性・リスク

**対象:** `.issue/819/plan.md` / `.issue/819/adr.md`
**視点:** プロジェクトのあるべきアーキテクチャとの整合性・実現可能性・リスク
**日付:** 2026-07-10

## 総評

1周目の指摘は**すべて正しく反映されている**。中核前提を実装コードで再検証したところ、乖離は無い。

1周目指摘の反映状況:

- **[R1 P-001] AC-7 事実誤認 → 修正済み。** AC 表の由来を「意図的変更: detail との整合性向上」に改め、リスク欄・テスト方針・レビュー履歴すべてで「旧フルページ `RouteErrorFallback` → インライン not-found への統一」を期待値として明記。多層防御（catch 付け忘れ時も `SectionErrorBoundary` が flight ストリーム経由で捕捉し 500 にならない）も追記済み。`edit.tsx` L14-19 の現状（server fn handler が await 中に `NotFoundError` を throw → `errorComponent`）を確認、記述と一致。
- **[R1 coverage P-002 / S-002] ちらつき緩和 → 確定済み。** 「純 CSS の opacity トランジション（表示即時、消える側のみ短フェード ≤120ms）、JS 遅延タイマー不採用」を設計・ステップ1・リスク欄・ADR-002 で一貫記述。AC-1「200ms 以内」が常に成立する論拠（`isLoading` は navigation コミット開始時に同期 true）も明示。
- **[R1 arch-risk S-001] decorative 化 → 反映済み。** ADR-002・設計・ステップ1・テスト方針で `RouteProgressBar` を `aria-hidden`（`role`/`aria-live` なし）に統一し、SR 通知はスケルトンの `aria-live` に一本化。既存 `common/ProgressBar.tsx` の `decorative` オプション（L33-40, L47-48）と同思想であることを確認。
- **[R1 arch-risk S-003] 既存 ProgressBar → 追記済み。** 調査結果 L42 に別関心（インライン job 進捗 vs route 遷移バー）ゆえ新設する棲み分けと、indeterminate 表現の作法を既存に揃える方針を明記。
- **[R1 arch-risk S-004] ADR-001 A/B 分担 → 補正済み。** ADR-001 L17 に「A=進捗バー主、B=スケルトン主、`isLoading` はシェル到着で false へ落ちる」分担説明を追加。
- **[R1 coverage P-001 / S-002] AC-6 対応ステップ・モバイル検証 → 反映済み。** AC-6 を「1,2,4」に、AC-3 検証を「タッチ/hover 無効エミュレーション or `defaultPreload` off ＋単体テスト担保」に補正。

コードによる中核前提の再検証:

- **detail パターン（収束先）が計画記述どおり:** `index.tsx` L14-34 は getCurrentUser＋redirect ガードを await 後、データ取得を await せず即 `renderServerComponent(<NoteDetail/>)`。`NoteDetail.tsx` は `Section(server 同期) → Suspense(fallback=NoteDetailSkeleton) → NoteDetailContent(async) → not-found は try/catch で `isNotFoundError` JSX 返却`（L49-99）。`SectionErrorBoundary section="ノート" resetKey={noteId}`。編集の移植先構造と完全一致。
- **編集ルート現状も記述どおり:** `edit.tsx` は 3クエリ `Promise.all` を await 完了後に `renderServerComponent(<NoteEditor>)`（L27-63）。`initialTagNames`（L38-40）/`initialEditLock`（L42-49）導出ロジックが存在し、ステップ4の `NoteEditorLoader` へ移設可能。`head` は `match.context?.config` のみ依存（L68-76）で loader 戻り値と独立 → 「即返し化」が head と干渉しない（R1 で指摘のリスクは形式確認で足りる）ことを再確認。
- **NoteEditor の props 契約・lazy 初期化が不変前提と一致:** `mode="edit"` の props（`initialTitle`/`initialContentHtml`/`initialFrontMatter`/`initialTagNames`/`initialDirectoryId`/`initialEditLock?`/`tree`）が L84-100 に定義。`useReducer(editorReducer, undefined, () => …)` の lazy initializer が「初回マウントのみ seed、loader 再実行で編集中状態をリセットしない」設計（L116-132）で、リスク欄の「不変に保つ」担保対象と一致。`useEditLock` は client マウント後の副作用（L187-193）で、Suspense 化しても挙動不変。
- **z-index 競合が正確:** header `sticky top-0 z-50`（`layout/styles.ts` L6）、drawer `z-[100]`（L92）、overlay `z-[90]`（L97）、dialogBackdrop `z-[100]`（`common/styles.ts` L324）。`RouteProgressBar` の `z-[110]` がすべてに勝つ。
- **root への client 設置が妥当:** `RootDocument` の `<body>` に既に client の `TanStackRouterDevtools` を配置（`__root.tsx` L118）。同じ body 位置に `"use client"` の `RouteProgressBar` を置く前例あり。RouterProvider 配下なので `useRouterState` 購読可、SSR 時 `isLoading=false` でハイドレーション不整合なし（R1 検証を追認）。

以下は**任意の軽微な指摘**にとどまる。ブロッカーは無い。

## 問題点（要修正）

問題点ゼロ。

## 改善提案（検討推奨）

- **[S-001]** `RouteProgressBar` の設置箇所を `RootComponent` か `RootDocument` かで一意に決めておくと実装が迷わない
  - 理由: ステップ2は「`RootDocument` の `<body>` 内 children の直前/直後」とする。`RootDocument` は正常時（`RootComponent`）だけでなく root の `errorComponent`・`notFoundComponent` からも `<RootDocument><ErrorPage/></RootDocument>` として再利用される（`__root.tsx` L90-99）。`RootDocument` に置くと root エラー画面でもバーが常設される（decorative かつ非ロード時 opacity-0 なので実害はなく、むしろ root エラー画面からの再遷移でもフィードバックが出る利点がある）。挙動として妥当だが、「意図どおり全 RootDocument 使用箇所に出る」ことを一言明記しておくと、実装者が `RootComponent` の Outlet 隣に絞るべきか迷わない。どちらでも成立するため設計判断の確認レベル。

- **[S-002]** スケルトンを持たないルート（settings/admin/public フォームなど）では decorative 化により遷移時の SR ロード通知が一切なくなる点を、許容トレードオフとして一行残すと親切
  - 理由: ADR-002 で「スケルトンの無いルートの遷移は概ね高速で通知の実益も小さい」と judgment 済みで方針として妥当。ただし本文（設計/リスク欄）側には「スケルトン無しルートは SR ロード通知ゼロになる」ことの明示が薄い。将来スケルトン非搭載の重いルートが増えた場合の再検討ポイントとして、リスク欄に一行残しておくと後続の判断材料になる（今回の対応スコープは変えなくてよい）。

## 良い点

- **1周目指摘の反映が過不足なく、記述が全セクションで整合している。** AC 表・設計・実装ステップ・リスク欄・ADR・テスト方針・レビュー履歴が相互に矛盾せず、特に「ちらつき緩和＝純 CSS opacity・JS タイマー不採用」「進捗バー decorative」「AC-7 意図的変更」の 3 点が全箇所で一貫している。
- **中核前提がすべて実コードで裏取り可能。** detail 収束先構造・編集ルート現状・NoteEditor props/lazy init・head の loader 非依存・z-index・root への client 設置いずれも、計画の記述とコードが一致。実装可能性が高い。
- **意図的挙動変更（AC-7）の扱いが誠実。** 「既存維持」ではなく「detail との整合を狙った変更」と明示し、テスト/手動確認の期待値を旧フルページエラー → インライン表示に更新。多層防御（catch 漏れ時も `SectionErrorBoundary` で 500 回避）まで踏み込んでおり、実装・レビュー時の誤判定リスクを潰している。
- **スコープ規律が維持されている。** 案3（`pendingComponent`/`defaultPendingMs`）・案4（トランジション）・案5（`staleTime` 変更）を明確な理由付きで除外し、Issue 受け入れ基準を満たす最小構成（進捗バー＋編集 Suspense 化）に絞っている。ADR-003 の `staleTime: 0` 維持（編集ロック・最新本文の整合性優先）も妥当。
- **アーキテクチャ規約準拠。** プレゼンテーション層限定、`.issue/12/adr.md` ADR-004（RSC 内 `throw notFound()/redirect()` 不可・JSX 返却は可）への準拠、Tailwind ユーティリティ＋`data-*` variant＋module-scope 定数化＋デザイントークン利用、既存テストパターン（`useRouterState` を vi.mock、skeletonAria）への接地が正しい。
