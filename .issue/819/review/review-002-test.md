# PR Review #002 — Test 観点 — Issue #819: ページ遷移の読み込みフィードバック

**Issue:** #819
**Date:** 2026-07-10
**Round:** 2回目（R1 の「reduced-motion 契約テスト追加」の反映確認を含むゼロベースレビュー）
**対象ブランチ:** `issue/819/route-loading-feedback`（PR 未作成。作業ツリー上の未コミット差分をレビュー）

> 注記: 依頼文の「PR 820」は誤り。PR #820 は Issue #817（admin 日付 hydration）で既に MERGED 済み。実際の #819 実装は本ブランチの未コミット変更として存在する。以下はその実体をレビューした。

## Summary

- Blockers: 1
- Warnings: 2
- Notes: 4

## レビュー対象テスト

- `app/components/layout/__tests__/RouteProgressBar.test.tsx`（新規）
- `app/components/note/editor/__tests__/NoteEditorLoader.test.tsx`（新規）
- `app/components/note/editor/__tests__/NoteEditorSection.test.tsx`（新規）
- `app/components/common/__tests__/skeletonAria.test.tsx`（NoteEditorSkeleton 追加分）

---

### Test

#### Blockers

- **[B-001]** AC-6（`prefers-reduced-motion: reduce` 時にアニメが 0ms 相当）に対する自動検証が存在しない。R1 で「修正済み」とされた *reduced-motion 契約テスト* が作業ツリーに反映されていない。
  - 場所: `app/components/layout/__tests__/RouteProgressBar.test.tsx`（該当アサーション欠落） / 検証対象は `app/components/layout/styles.ts:191`（`ROUTE_PROGRESS_BAR`）・`:197`（`ROUTE_PROGRESS_BAR_FILL`）
  - 理由: `RouteProgressBar.test.tsx` は `data-loading` の付与/除去と decorative a11y（aria-hidden・role/aria-live なし）のみを検証し、AC-6 の要である motion 系クラス契約 — 外側バーの `motion-reduce:transition-none` / `data-[loading]:transition-none`（reduced-motion / 即時表示）、内側 fill の `motion-safe:animate-pulse`（reduced-motion で静的） — を一切アサートしていない。リポジトリには**同型の確立パターンが既にある**（`app/components/common/__tests__/ProgressBar.test.tsx:45-50`「guards the indeterminate animation with motion-safe」で `motion-safe:animate-pulse` を string-contains 検証、`Skeleton.test.tsx:69-75` も同様）。`RouteProgressBar` 自身のコメントが「mirroring the indeterminate treatment of `common/ProgressBar`」と明記しているのに、その sibling が持つ契約テストだけが欠けている。結果、誰かが `ROUTE_PROGRESS_BAR_FILL` から `motion-safe:` を落とす／`ROUTE_PROGRESS_BAR` から `motion-reduce:transition-none` を落としても、どのテストも落ちず AC-6 が沈黙のうちに壊れる。加えて依頼文が「R1 指摘は修正済み（reduced-motion 契約テスト追加）」と明言している以上、その不在は R1 修正の未適用＝回帰確認の失敗にあたる。
  - 提案: `ProgressBar.test.tsx` に倣い、`RouteProgressBar` をレンダーして外側 `div` の `className` が `motion-reduce:transition-none` と `data-[loading]:transition-none` を含むこと、内側 fill が `motion-safe:animate-pulse` を含むことを string-contains で 1〜2 本アサートする（happy-dom では media query 実評価はできないため、この repo 既定の「クラス契約を固定する」方式が妥当）。

#### Warnings

- **[W-001]** `NoteEditorLoader` の初期状態導出ロジック（`initialTagNames` の名前解決＋`undefined` フィルタ、`initialEditLock` の acquired 状態構築）が振る舞いとして一切検証されていない。
  - 場所: `app/components/note/editor/__tests__/NoteEditorLoader.test.tsx:56-74`（"renders the editor" ケース） / 対象ロジック `app/components/note/editor/NoteEditorLoader.tsx:56-67`
  - 理由: 正常系テストは解決するノートを `editLock: null` / `tagIds: []` で与えているため、`note.editLock !== null` の acquired-lock 構築（`expiresAt: new Date(...).getTime()` への変換）と `tagIds → tags.byId → 名前` の解決/フィルタの**両分岐が一度も実行されない**。`NoteEditor` はスタブされ、渡される props（`initialTagNames`/`initialEditLock`/`initialDirectoryId`/`tagSuggestions`/`tree`）を誰もアサートしていない（`html` に `"note-editor"` が含まれるかだけ）。この導出は現行 server fn から移設したまさに plan「リスクと注意点」の"編集の初期状態リセット回帰"の中心であり、無検証のまま置くと `getTime()` の取り違え・タグ取りこぼし等が回帰しても緑になる。
  - 提案: `editLock`（`expiresAt` 付き）と実 `tagIds` を持つノートで解決させ、`NoteEditor` スパイに渡る `initialEditLock`（`state:"acquired"` / 期待 `expiresAt` ミリ秒）と `initialTagNames`（解決済みの名前配列、未知 id が落ちること）をアサートするケースを追加する。既存 `noteEditorSeedOnce.test.tsx` 等は `NoteEditor` へ直接 props を渡しており、loader の導出はそれらでもカバーされない。

- **[W-002]** 編集ルート（`edit.tsx`）の streaming 契約 — 「データを await せずに `NoteEditorSection` を即返す」「redirect ガードを Suspense 外に保つ」— に対する回帰テストがない。plan テスト方針 L147 が求めた「編集ルート streaming の回帰テスト」が未実装。
  - 場所: `app/routes/_app/notes/$noteId/edit.tsx:28-35`（await せず返す本体）
  - 理由: AC-2/AC-1 の本質は「loader が即解決してスケルトンが先に出る」ことだが、それを担保しているのは *ルートが 3 クエリを await せず返す* 点。将来 `NoteEditorLoader` の `await Promise.all` をルート側に戻す（＝バグ再導入）変更をしても、`NoteEditorSection` のテスト（loader を suspend-forever スタブ）と `NoteEditorLoader` の単体テストは緑のまま通り、劣化を検知できない。AC-7 の not-found→インライン化は loader 層で捕捉済み（[N-002]）だが、ルートの「await しない／redirect は Suspense 外」不変条件は無防備。
  - 提案: `createServerFn` + `renderServerComponent` はユニット化が重いため、最低限「`renderNoteEditor` 相当の呼び出しが `loadNoteDetail` を await 完了する前に解決（＝ローダーの Promise が data 解決前に settle）する」ことを示すテスト、あるいは本項を明示的に manual-test（testing.md）の受け入れ条件として固定する。ユニット化が現実的でないなら Note 降格でも可だが、AC-2 の中核不変条件が自動網から外れている点は記録に残すべき。

#### Notes

- **[N-001]** `skeletonAria.test.tsx` への `NoteEditorSkeleton` 追加は良質。既存の共有契約（#636 TS-W-001: 単一 `role="status"` ＋ `aria-live="polite"` ＋ `aria-busy="true"` ＋ 全 `animate-pulse` プレースホルダが `aria-hidden` 配下）に `it.each` パラメータで組み込んだだけで、AC-5/二重読み上げ回避の回帰ガードが 1 行で効く。`ToolbarSkeleton` の decorative 例外も同ファイルで対比検証されており、`NoteEditorSkeleton` が誤って装飾専用化した場合も落ちる。適切な再利用。
- **[N-002]** `NoteEditorLoader.test.tsx` の notFound 分岐 3 本（`NotFoundError`→インライン `role="alert"` JSX、正常解決→エディタ、その他 error→再 throw）は AC-7 の意図的挙動変更を正しく振る舞いで固定している。`NoteDetail.test.tsx:63-64` と同一のアサーション（`role="alert"` ＋「ノートが見つかりません」）で detail とのパリティも担保。実 JSX を `renderToStaticMarkup` で検証しており脆くない。
- **[N-003]** `RouteProgressBar.test.tsx` は `useRouterState` を `vi.mock`（`NoteListViews.test.tsx` の既存作法に準拠）し、`isLoading` を直接注入して preload 状態非依存を表現。decorative a11y（`aria-hidden="true"`、`role`/`aria-live` 不在、サブツリーに `[role="status"]`/`[aria-live]` が皆無）を明示アサートしており、ADR-002（進捗バーは読み上げない・通知はスケルトンに一本化）を過不足なくコード化。`data-loading` 偽時の `hasAttribute===false` 検証も `isLoading || undefined` 契約と整合。
- **[N-004]** `NoteEditorSection.test.tsx` は `NoteEditorLoader` を「永久 suspend（`throw new Promise(()=>{})`）」スタブにして Suspense fallback が `NoteEditorSkeleton` であることを確定的に検証。`SectionErrorBoundary` を passthrough スタブ化して関心を fallback に絞る設計もクリーン。AC-2 の「スケルトン先出し」を実 async を待たずに固定できている。
