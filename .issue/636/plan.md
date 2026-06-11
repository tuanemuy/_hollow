# 実装計画 — Issue #636: feat(ui): 主要画面を <Suspense> ＋スケルトンで分割描画（#634 Phase 2）

**Issue:** #636
**作成日:** 2026-06-11
**複雑度:** 中〜大規模

---

## 目的

主要な非同期データ取得を `<Suspense>` 境界＋スケルトン（フォールバック）で分割描画し、失敗時はエラー境界で局所化する。1系統の失敗・遅延が画面全体を巻き込まない構成にする。

## スコープ

### 含まれるもの
- ホーム（5系統 `Promise.all` の分割・最優先）、シェル Sidebar、ノート詳細、tags / trash / views / upload / export / exports / exports/$jobId、settings×4、admin×7 への Suspense 境界＋スケルトン＋エラー境界の導入
- 共通 `SectionErrorBoundary` の新設、アーキタイプ・スケルトン（List / Form / AdminTable）の整備
- Skeleton の a11y 調整（`aria-busy` 追加、`label` 指定時の二重読み上げ解消 — #636 コメントの引き継ぎ事項）

### 含まれないもの
- ミューテーションの楽観的更新・pending 可視化（#635 で実装済み）
- アップロード進捗ストリーミング・リトライ UX の高度化（Phase 3）

## 調査結果（前提）

- `@tanstack/react-start-rsc@0.0.44` の `renderServerComponent` は flight stream を即開始し、デコードは `<Suspense>` 要素で走査を打ち切る。**RSC ツリー内に `<Suspense>` を張ればシェルは即解決され、境界内は streaming で後から埋まる**。route の `pendingComponent` / deferred loader は不要。
- 現状のように handler 内で `Promise.all` を await してから props で渡す限り Suspense は効かない。**データ取得を子の async サーバーコンポーネントへ移すことが本質的な変更**。
- ローダー群は `cache(serverData(...))` でメモ化済みのため、複数セクションが同じローダーを await しても同一レンダー内で dedup される。
- 共通資産: `app/components/common/Skeleton.tsx`（`Skeleton`/`SkeletonBar`、`role="status"`+`aria-live` 済み・`aria-busy` 無し）、`Spinner.tsx`。`<Suspense>`/ErrorBoundary は現状 0 件。
- モック P10 の境界①②（ディレクトリツリー・保存ビュー）は `_app` シェル側 `app/components/layout/Sidebar.tsx` に対応。③タグ ④referencing title ⑤ノート一覧がホーム本体。
- streaming 後に RSC 内で throw されたエラーは server fn の `errorResponseMiddleware` を通らず flight stream 経由でクライアント境界に届く（本番では React により redact される）。

## 実装ステップ

### 1. 共通エラー境界の新設

- **対象ファイル:** `app/components/common/SectionErrorBoundary.tsx`（新規、`"use client"`）
- **変更内容:** class ErrorBoundary。`role="alert"` の小型パネル＋「再読み込み」ボタン（`useTransition` + `router.invalidate()`、`app/components/common/routerInvalidate.ts` 再利用）。メッセージは redaction 前提の汎用文言＋セクション名。
- **理由:** 規約4（エラー境界＋リトライ導線）を満たす。

### 2. Skeleton の a11y 調整

- **対象ファイル:** `app/components/common/Skeleton.tsx`
- **対象ファイル（追加）:** `app/components/common/Spinner.tsx`
- **変更内容:** Skeleton に `aria-busy="true"` を追加（モック準拠）。`label` 指定時は既定 `aria-label` を出さない（二重読み上げ対策）。Spinner には `motion-reduce:animate-none`（＋静止時も pending とわかる代替表示）を追加 — #636 コメントで「実利用が入る Phase 2 で対応判断」と引き継がれた件。Spinner は #635 のミューテーション pending 可視化で既に実利用されているため本 Issue で対応する。
- **理由:** #636 コメントで #635 から引き継がれた a11y 指摘（2件とも）の解消。

### 3. アーキタイプ・スケルトンの整備

- **対象ファイル:** `app/components/common/`（新規: `ListPageSkeleton`、`FormSkeleton`、`AdminTableSkeleton`）、ホーム/ノート詳細用は各 feature ディレクトリにローカル定義
- **変更内容:** モック準拠（P18 / P21 / P45 / P10 / P11）のフォールバックを utility-first＋`SkeletonBar` 合成で実装。
- **理由:** 対象全画面でアーキタイプを再利用する Issue の方針。

### 4. ホーム分割（最優先）

- **対象ファイル:** `app/routes/_app/index.tsx`、`app/components/note/HomePage.tsx`、`app/components/note/NoteList.tsx`
- **変更内容:** handler から 5系統 `Promise.all` を撤去。auth・viewId 解決・`redirect` 判定・`baseSearch`/page/limit 算出は handler に残す。`HomePage` を「`SelectionProvider`＋見出し枠のシェル＋セクション async RSC」に再構成し、**境界はローダー単位を基本**とする（Issue「5系統を個別の境界へ分割」・モック P10 準拠）: ③ `TagsSection`（`loadAllTags`、タグチップ群を独立境界に）、④ `ReferencingTitleSection`、⑤ `NotesSection`（`loadOwnedNotes`。件数見出し「N 件のノート」は `owned.count` 依存のためこのセクション側へ移す。search のみ依存の `headingText` はシェル側で即描画）。Toolbar のように複数データ（tags+tree+savedViews）を単一 client コンポーネントが要する箇所は構造的制約として最小限の合流境界 `ToolbarSection` に留める（ADR-004）。`BulkActionBar` は props が `tree` のみなので tree を await する境界側に含める（cache dedup で重複取得なし）。各セクションを `<SectionErrorBoundary>`+`<Suspense fallback>` で包む。`NoteList.tsx` は分割に合わせて解体（client 子コンポーネントはそのまま）。
- **理由:** Issue 最優先対象。1系統の失敗で全体が落ちる構成の解消。

### 5. シェル Sidebar 分割（モック①②）

- **対象ファイル:** `app/components/layout/Sidebar.tsx`
- **変更内容:** `Promise.all` を `DirectoryTreeSection` / `SavedViewsSection` の async RSC に分け、それぞれ独立境界化。Sidebar が取得する第3のデータ `loadOwnedNotes({limit:1})` の noteCount（「すべてのノート」バッジ）はライブラリナビと一体の `DirectoryTreeSection` 側に含める（第3境界は作らない）。
- **理由:** P10 モックの境界①②に対応。

### 6. 単一データ系統ルートの一括適用

- **対象ファイル:** notes/$noteId、tags、trash、views、upload、export、exports、exports/$jobId、settings×4、admin×7 の各 route / Page コンポーネント
- **変更内容:** server fn handler は「auth＋`renderServerComponent(<Page …/>)`」のみとし、Page RSC を「静的見出し（即描画）＋`<SectionErrorBoundary><Suspense fallback={アーキタイプSkeleton}>`＋データ await する async セクション」に再構成。ノート詳細は P11 通り本文/メタ/バックリンクを独立境界に分ける（既存ローダーが分かれている場合）。`admin/design` は P45 のテーブルアーキタイプ対象外（users・jobs・prompts・llm・registration・metrics の6画面のみ）なので、`FormSkeleton` を適用する。
- **注意（redirect/notFound）:** `notes/$noteId` の not-found 判定、`exports/$jobId` のジョブ存在確認など、`redirect` / `notFound` を throw しうる判定は handler に残す（Suspense 境界内で throw すると機能しない）。
- **注意（loader 再実行時のフリッカー — 一般方針）:** `awaitLazyElements` は Suspense 境界で走査を打ち切るため、loader 再実行（ポーリング・invalidate・検索条件変更・`appShellInvalidate` 経由の Sidebar 再取得）のたびに境界内がフォールバックへ戻る公算が高い。対象はポーリング2ルート（`upload`・`exports/$jobId`）に限らず、Sidebar とホーム⑤（検索・ページ送り）も該当する。**ホーム実装直後に検証し**、旧コンテンツが保持されない場合は影響ルートごとに次の順で対応する: (a) まず `router.invalidate()` / ポーリング / 検索ナビゲーションを `startTransition` でラップする等の緩和策を試す → (b) それでも解消しない境界のみ handler 内 await を維持（Suspense 適用外・エラー局所化のみ適用）。(b) を取る場合は DoD との差分になるため、**Issue #636 にコメントでスコープ調整を記録する**。Sidebar は (b) でもミューテーション後の体験劣化が大きいので (a) を優先、ホーム⑤は初回 SSR のみストリーミングでも DoD（初回分割描画＋失敗局所化）を満たせることを判断基準とする。
- **理由:** Issue の対象全画面への適用。

## 設計判断

詳細は adr.md を参照。

- route-level deferred loader ではなく RSC 内 Suspense を採用（ADR-001）
- データ共有は props 持ち回りをやめ、各セクションが cache 済みローダーを直接 await（ADR-002）
- セクション失敗はクライアント ErrorBoundary で受け、kind 別メッセージ分岐はせず汎用文言＋リトライに留める（ADR-003）
- ホームの境界はローダー単位を基本とし、Toolbar のみ構造的制約として合流境界を許容（ADR-004）

## リスクと注意点

- **スケルトン・フリッカー（最重要）:** loader 再実行（ポーリング・invalidate・検索条件変更・`appShellInvalidate` 経由の Sidebar 再取得）のたびに境界がスケルトンへ戻る可能性。ホーム実装直後に検証し、フリッカーが出る場合の対応方針はステップ6の注意書きに従う。
- `NoteList` 解体は `SelectionProvider`/BulkActionBar の tree 依存に波及（BulkActionBar は tree を await する境界側に含める。`SelectionProvider` はシェル側に残し、Suspense を跨いだ選択状態共有は children 透過で機能する）。
- 本番ビルド（Cloudflare Workers / wrangler）での streaming 動作を実機確認。SSR 初回ロードとクライアントナビゲーション双方で skeleton→解決を確認。
- `redirect` を伴う処理（home の SavedView 正規化、auth fail-safe）は境界の外（handler）に残す。Suspense 内で throw すると redirect が機能しない。
- `staleTime: POSITIVE_INFINITY` の settings 系は skeleton が出るのは初回のみ（期待動作）。

## テスト方針

- 単体: `Skeleton` の aria 変更、`SectionErrorBoundary`（fallback 表示・retry で invalidate 呼び出し）、ホーム分割後も既存 `index.loaderDeps.test.ts` 等が通ること。
- `pnpm typecheck && pnpm lint:fix && pnpm format && pnpm test:unit`
- 手動: dev サーバーでスロットリングし、ホームで境界が独立解決すること、1系統の失敗が当該セクションのみに局所化されること、reduced-motion でパルス・スピンが止まることを確認。
- 手動: invalidate / ポーリング（upload・exports/$jobId）・検索条件変更時に旧コンテンツが保持され、スケルトンが点滅しないことを確認。
- 手動: シェル/ページ間の局所化の組合せ — Sidebar（境界①②）の失敗時にホーム本体が影響を受けないことを確認。
- 実装時確認: `SectionErrorBoundary` のリトライ（全体 `router.invalidate()`）が他境界の再ストリーミングと相互作用しても許容範囲であること（セクション単位リトライは RSC 構成上困難なため全体 invalidate は妥協として妥当）。

## レビュー履歴

### 1周目
**修正した点**:
- P-001（要件カバレッジ視点）: ホームの境界粒度を「ローダー単位を基本」に変更。タグチップ群（境界③）を独立境界化し、Toolbar の合流のみ ADR-004 として記録。
- P-001（アーキ・リスク視点）: ポーリング2ルート（upload・exports/$jobId）のスケルトン・フリッカー懸念をステップ6の注意書き＋リスク＋検証項目に追加。フォールバック方針（handler await 維持）を事前定義。

**取り込んだ改善提案**:
- S-001（要件）: Spinner の reduced-motion 対応をステップ2に追加（#635 で実利用済みのため本 Issue で対応）。
- S-002（要件）: `admin/design` には FormSkeleton を適用と明記。
- S-001（アーキ）: ADR-002 に handler/RSC レンダー間で cache スコープが分かれる可能性の注記を追加。
- S-002（アーキ）: Sidebar の noteCount を `DirectoryTreeSection` 側に含めると明記。
- S-003（アーキ）: BulkActionBar を tree を await する境界側に含めると明記。
- S-004（アーキ）: 件数見出しを NotesSection 側へ移すと明記。

**見送った提案とその理由**: なし

### 2周目
**修正した点**:
- P-001（両視点共通）: フリッカー対応方針を一般化。緩和策（startTransition ラップ）を先に試す手順、Suspense 適用外とする場合の Issue コメントでのスコープ調整記録、Sidebar / ホーム⑤の判断基準を明記。

**取り込んだ改善提案**:
- S-001（要件）: Sidebar 失敗時にホーム本体が影響を受けない組合せ確認を手動テストに追加。
- S-001（アーキ）: redirect / notFound 判定を handler に残す注意をステップ6に明記。
- S-002（アーキ）: SectionErrorBoundary のリトライ＝全体 invalidate の相互作用確認をテスト方針に追加。

### 3周目
両視点とも問題点ゼロで終了。実装時の注意として引き継ぐ提案: (1) Sidebar をスコープに含めた旨を PR 説明に一言残す、(2) admin ガード（権限チェック）が Suspense 境界内へ滑り込まないよう handler に残す。
