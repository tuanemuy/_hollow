# PR Review R3 — Issue #819 ページ遷移フィードバック（RSC/Architecture 観点）

**対象:** PR #826 / ブランチ `issue/819/route-loading-feedback`
**Round:** 3回目（ゼロベース・フルレビュー）
**Date:** 2026-07-10
**参照:** `.issue/819/plan.md`, `.issue/819/adr.md`, `.issue/12/adr.md` ADR-004, R2 (`review-002-rsc.md`)

R2（APPROVED）を前提とせず、`main` の旧 `edit.tsx` と現行実装を1行ずつ突き合わせてゼロベースで再確認した。

## Summary

- Blockers: 0
- Warnings: 1
- Notes: 5
- Verdict: **APPROVED**（Warning は benign な既定変更の是非確認。マージ阻害はしないが記録・意図確認を推奨）

typecheck 相当は R2 で確認済み。対象・周辺テスト 477 件 PASS（`NoteEditorLoader` / `NoteEditorSection` / `RouteProgressBar` / `skeletonAria` を含む）。

---

### RSC/Architecture

#### Blockers

なし

#### Warnings

- **[W-001] `NoteEditor` の props 契約は「不変」ではない — 編集ルートに `tagSuggestions` が新規追加されている（plan/ADR/R2 の「逐語移設・props 契約不変」記述と齟齬）。**
  - 場所: `app/components/note/editor/NoteEditorLoader.tsx:80`（`tagSuggestions={tags.tags.map((t) => t.name)}`）
  - 事実: `main` の旧 `app/routes/_app/notes/$noteId/edit.tsx` が組み立てていた `<NoteEditor mode="edit" ...>` は `mode/noteId/initialTitle/initialContentHtml/initialFrontMatter/initialTagNames/initialDirectoryId/initialEditLock?/tree` の **9 props のみ**で、`tagSuggestions` を**渡していない**（`git show main:.../edit.tsx` で確認）。現行 `NoteEditorLoader` はここに `tagSuggestions` を**追加**している。`tagSuggestions` は `SharedProps` の optional（`NoteEditor.tsx:98-103`、既定 `[]`、`TagsInput` の autocomplete 供給源＝`NoteEditor.tsx:501`）で、従来 create ルート（`app/routes/_app/notes/new.tsx:33`）だけが渡していた。
  - 影響: 編集画面のタグ入力オートコンプリートが **従来「候補ゼロ」→ 本 PR で「全タグ候補あり」** に変わる。データは元々 `loadAllTags` で取得済み（`tags.tags`）なので追加 I/O・型リスクはなく、create モードとの一貫性が増す**望ましい方向**の変更ではある。
  - 理由（なぜ指摘するか）: 本タスクの検証項目そのもの（「`NoteEditor` の props 契約・lazy 初期化が不変か」）に対し、契約は**不変ではない**。plan L64/L123・ADR 実装メモ L82・R2 の N-003（「10 props ＋導出ロジックを逐語移設・差分なし」と明記し `tagSuggestions` を移設対象に数えている）は**事実と食い違う**。Issue #819 のスコープは「読み込みフィードバック」であり、編集エディタの機能追加（タグ候補の付与）は計画にも「含まれないもの」にも記載がない。benign だが**未文書のスコープ外挙動変更**であり、意図的（＝編集モードにも候補を出すべき、という是正）か、`new.tsx` からのコピー時の巻き込みかを切り分けるべき。
  - 提案: (a) 意図的なら plan/ADR に「編集モードにもタグ候補を付与（create と一貫化、既取得データの再利用）」を1行残して意図を明示する、または (b) スコープ厳格化を優先するなら本 prop を落として旧挙動（候補ゼロ）に戻す。いずれでも技術的には成立する。**benign かつ望ましい方向のため (a) を推奨。** マージ阻害はしない。

#### Notes

- **[N-001] Suspense 内 throw を正しく回避（ADR-004 準拠）。** `renderNoteEditor`（`edit.tsx:22`）は redirect ガード（`throw redirect()`）を Suspense **外**（server fn 本体）に残し、`renderServerComponent(<NoteEditorSection .../>)` をデータ await せず即返す。not-found は `NoteEditorLoader.tsx:42-52` で `try/catch`＋`isNotFoundError` によりインライン JSX を**返却**（throw しない）。`NoteDetail`/`NoteDetailContent`（`NoteDetail.tsx:59-99`）と構造・文言（`role="alert"` / 「ノートが見つかりません」）まで同型。非 NotFoundError は `throw e`（`:51`）で再送出され、多層防御として `SectionErrorBoundary` が flight ストリーム経由で捕捉しセクション内エラーに落ちる（500 化しない）。AC-2/AC-7 成立。テスト `NoteEditorLoader.test.tsx` が notFound JSX / 正常 / 非NotFound再throw / lock 有無の分岐を網羅。

- **[N-002] 詳細ルートの確立パターンへ正しく収束。** `NoteEditorSection`（server 同期 `<SectionErrorBoundary section="ノート" resetKey={noteId}><Suspense fallback={<NoteEditorSkeleton/>}><NoteEditorLoader/></Suspense></SectionErrorBoundary>`）は `NoteDetail`（`NoteDetail.tsx:49-57`）と 1:1 で一致。server fn が `NoteEditorSection` を dynamic import し、Section が children を static import する構造も detail と同型。`NoteEditorSkeleton` は `NoteDetailSkeleton` に倣い `role="status" aria-live="polite" aria-busy="true"` を単一で持ち、装飾要素は `aria-hidden`、`SKELETON_BAR`/`SKELETON_PILL` を使用（AC-6 の a11y/reduced-motion 契約は fill の `motion-safe:animate-pulse` に内包）。

- **[N-003] head 干渉なし・`staleTime`/route 契約不変。** `edit.tsx` の `head`（`:39-47`）は `match.context?.config` のみ依存で loader 戻り値と独立。`renderServerComponent` を await せず即返す形は detail（`index.tsx:27-34`）で成立済みの同型で head と干渉しない。`staleTime: 0`（ADR-003 維持）・`errorComponent: RouteErrorFallback`・`component`・`loader` シグネチャは旧実装と一致。

- **[N-004] lazy 初期化・編集中リセット回帰なし。** `NoteEditor` の `useReducer(editorReducer, undefined, () => …)` lazy initializer（`NoteEditor.tsx:117-135`、「初回マウントのみ seed、loader 再実行で編集中状態をリセットしない」設計）は本 PR で無改変。導出ロジック（`initialTagNames`＝`tags.byId` 名前解決／`initialEditLock`＝`as const` acquired seed、`initialEditLock` の条件付きスプレッド）も旧 server fn から逐語移設で一致（`NoteEditorLoader.tsx:56-67, 78`）。呼び出し経路が server fn → server async component に移っただけで client 本体は無改変。

- **[N-005] 依存方向・レイヤー責務・スタイリング規約に適合。** 新規 3 コンポーネントは presentation（`components/note/editor/`, `components/layout/`）内に収まり、`@/core/application`（`UserDTO` 型・`isNotFoundError`）への presentation→application 依存のみ（`NoteDetail` と同一依存形）。逆方向・ドメイン混入なし。`RouteProgressBar` は `"use client"` で `useRouterState({select: s => s.isLoading})` のみ購読し状態管理を持ち込まず、`RootDocument`（error/notFound 画面からも再利用される最上位、`__root.tsx:111-129`）に一意設置。`aria-hidden` decorative でロード読み上げは skeleton 側 `aria-live` に一本化。スタイルは `layout/styles.ts` の module-scope 定数（`ROUTE_PROGRESS_BAR`/`ROUTE_PROGRESS_BAR_FILL`）に集約、`data-[loading]:` variant＋トークン参照、`group` によるフィル pulse ゲート（idle 時に keyframes を回さない配慮）、表示即時（`data-[loading]:transition-none`）・消滅フェード・`motion-reduce:transition-none`、`pointer-events-none fixed`・z 順（header 50 / drawer 100 / scrim 90 < 110）まで CLAUDE.md 規約・ADR-002 と一致。SSR `isLoading=false` でハイドレーション不整合なし。

#### 参考（スコープ外・回帰ではない）

- `NoteEditorSection`/`NoteEditorLoader` は `user: UserDTO` 全体を渡すが実使用は `user.id` のみ。`NoteDetail` の既存パターンに沿っており実害なし（RSC シリアライズ最小化の観点で将来 id のみに絞る余地はある）。
- 別ノート間の編集遷移（`/notes/A/edit`→`/notes/B/edit`）で lazy-init-once により状態が保持されうる論点は `key` 未付与の既存挙動で本 PR による悪化はない。スコープ外。
