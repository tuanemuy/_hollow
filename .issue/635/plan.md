# 実装計画 — Issue #635: feat(ui): 共通ローディングUX資産の整備＋ミューテーションの楽観的更新/pending可視化（#634 Phase 1）

**Issue:** #635
**作成日:** 2026-06-11
**複雑度:** 中〜大規模

---

## 目的

#634 Phase 1 として、(1) 再利用可能な共通 `Skeleton` / `Spinner` コンポーネントを `app/components/common/` に新設し、(2) `docs/frontend_implementation_example.md` に Pending UX / 楽観的更新 / Suspense フォールバック規約を明文化し、(3) リスト変更系・送信ボタンで pending 可視化／楽観的更新が抜けている箇所を既存パターンの横展開で埋める。DoD は「すべてのミューテーションが楽観的更新または pending 可視化のいずれかを持つ」「共通 Skeleton/Spinner 資産＋docs 規約が揃う」。

## スコープ

### 含まれるもの

- 共通 `Skeleton` / `Spinner` コンポーネント新設（`app/components/common/`）。
- `docs/frontend_implementation_example.md` への「Pending UX / 楽観的更新 / Suspense フォールバック規約」節の追記。
- リスト変更系ミューテーションの pending 可視化／楽観的更新の補完（後述のとおり、実コードでは大半が既に対応済み。残る具体的ギャップのみ着手）。
- `tag/CreateTagForm` 送信ボタンの pending 表示。
- `note/editor/NoteEditor` 保存ボタンの視覚フィードバック強化。
- NoteEditor 内 DirectoryPicker のインライン作成（保存時の自動作成）フィードバック。
- `note/list/BulkActionBar` 一括ゴミ箱操作中の対象アイテム dim。
- 既存 `ingestion/UploadDialog` のローカル `SkeletonBlock` を共通 `Skeleton` で置き換え（資産の単一化）。

### 含まれないもの（スコープ外）

- `<Suspense>` 境界の導入（→ Phase 2 / #634 別サブIssue）。**今回 Skeleton/Spinner はあくまで土台として作るだけで、ルート/コンポーネントに `<Suspense fallback>` を張る作業はしない。**
- アップロード進捗ストリーミング・`useFormStatus`（→ Phase 3 / #634 別サブIssue）。
- 既に pending 可視化・楽観的更新が成立している箇所の再実装・リファクタ（後述「既存実装の状態」参照）。

## 調査結果

### あるべきアーキテクチャ（CLAUDE.md / docs / spec から）

- **React 19 プリミティブを直接使う。** `useActionState` / `useTransition` / `useOptimistic` を直接使い、汎用ラッパー（`useServerAction` 風フック）は作らない（`docs/frontend_implementation_example.md` 「Server Function (mutation)」節で明文化済み）。Skeleton/Spinner も「プレースホルダー DOM を返すだけの presentational コンポーネント」に留め、ロジックを持たせない。
- **スタイルはユーティリティファースト＋既存トークン。** 新規 CSS ファイル・`@apply` は作らない。状態は `data-*` 属性 + `data-[name]:` バリアントで表現し、`data-x={value || undefined}` で falsy 時に消す（CLAUDE.md Styling / ADR-003）。繰り返す utility 文字列は module-scoped 定数に hoist できる（`app/components/common/styles.ts` 等）。
- **デザイン言語（spec/design/index.md）:**
  - 「ロード状態」(L92): スピナーよりスケルトン優先。`--color-surface` の矩形＋微パルス。
  - 「インタラクションの即時 feedback」(L232): 非同期ボタンは押下直後に disabled + ローディング状態。
  - 「アニメーション」(L93): 装飾は入れない。`prefers-reduced-motion: reduce` 時は transition 0ms。→ パルスは `motion-safe:` でガードする（既存実例に倣う）。
  - `aria-live` (L234): 状態遷移・完了・失敗の通知に使用。
- **既存トークン:** `--color-surface` (#f5f5f7)、`--radius-sm`、`--opacity-disabled` (0.55) は存在する。**パルス用の専用アニメーショントークンは tokens.css に無い**。プロジェクトは Tailwind v4 標準の `animate-pulse` を `motion-safe:` 付きで使う方針が既に定着している（`ingestion/UploadDialog` の `SkeletonBlock`、`tag/styles.ts` の `progressBarIndeterminate`）。→ **新トークンは追加せず Tailwind 標準 `motion-safe:animate-pulse` を踏襲する**。
- **デザインの正（P13a-upload-modal.html）:** `.skeleton`（中央寄せコンテナ、`padding: var(--space-8) 0`）／ `.skeleton-bar`（`height: 12px`、`background: var(--color-surface)`、`border-radius: var(--radius-sm)`、幅 75/50/66%）／ `.skeleton-text`（`--color-ink-secondary`）／ `.skeleton-sub`（`--color-ink-tertiary`）。`aria-live="polite"` を skeleton コンテナに付与している。既存 `UploadDialog.SkeletonBlock` はこのパターンを高さ `h-3`(=12px) ＝ `bg-surface rounded-md` ＝ `motion-safe:animate-pulse` で実装済み。

### 関連ファイル

**共通基盤の追加先:**
- `app/components/common/` — 既存に `BrandLogo` / `ConfirmDialog` / `Dialog` / `Icon` / `Menu` / `Popover` / `styles.ts` 等。ここに `Skeleton.tsx` / `Spinner.tsx` を新設。
- `app/components/common/__tests__/` — `ConfirmDialog.test.tsx` 等の vitest + Testing Library パターンあり。Skeleton/Spinner の軽い描画テストを追加できる。
- `docs/frontend_implementation_example.md` — 既存の「Server Function (mutation)」「行内アクションは useTransition + useOptimistic」節の末尾／後ろに新節を追記。

**確立済み `useOptimistic` 実例（6ファイル、横展開の参照元）:**
- `app/components/note/list/FilterBar.tsx` — フィルタ選択を `useOptimistic` でミラー、transition 内で `applyOptimistic` → `router.navigate` を await（#354/#478 ADR）。`aria-busy={isPending}`。
- `app/components/tag/TagList.tsx` — **create/delete/rename/merge をすべて `useOptimistic`（reduceTags）で楽観更新**。temp id での楽観 add、snap-back で確定行に置換（ADR-002）。**note 作成/削除/リネームの理想形リファレンス**。
- `app/components/tag/TagListToolbar.tsx` — sort/order を `useOptimistic`。`aria-busy`。
- `app/components/directory/DirectoryTree.tsx` — 行内リネームのみ `useOptimistic`（optimisticName）。move/delete/createChild はダイアログ。
- `app/components/view/SavedViewsList/index.tsx` — list add/remove + row の name/isDefault/broken を `useOptimistic`。
- `app/components/ingestion/IngestionJobRow.tsx` — ジョブ行の楽観更新。

**今回の対象ミューテーション系コンポーネントの現状:**
- `app/components/tag/CreateTagForm.tsx` — 楽観 add は親 `TagList` 所有。**フォーム自身は `isPending` を持たず、送信ボタンに pending 表示が無い**（`onCreate` は fire-and-forget）。→ **要対応**。
- `app/components/note/editor/NoteEditor.tsx` — 保存/作成は `useTransition`。保存ボタンは `disabled={saveDisabled}` ＋ `{isPending ? "保存中..." : ...}` で**既に pending ラベルあり**。ただし `data-primary` の primary ボタンに `aria-busy` が無く、視覚フィードバックが「文言＋disabled」のみ。→ **強化（aria-busy + 軽い視覚状態）**。
- `app/components/note/editor/DirectoryPicker.tsx` + NoteEditor の `resolveDirectoryId()` — 新規ディレクトリ名は保存時に `createDirectoryFn` で作成される（`pendingDirectoryName`）。作成は保存 transition 内で走り、`disabled={isPending}` でフィールドは固まるが、**「ディレクトリ作成中」という固有のフィードバックが無い**。→ **要対応（保存ボタンのラベルを段階表示 or インラインの作成中表示）**。
- `app/components/note/list/BulkActionBar.tsx` — ゴミ箱一括は `useTransition`、ボタン `disabled` ＋ `{isPending ? "処理中..." : ...}` ＋ `aria-live` の件数あり。**しかし確定まで対象アイテムを dim していない**。→ **要対応（dim）**。
- `app/components/note/detail/NoteActions.tsx` — 削除（→ゴミ箱）は `ConfirmDialog`（`isPending`/`削除中...`）、複製・移動も pending あり。**対応済み**。
- `app/components/note/list/MoveNoteDialog.tsx` — `disabled` ＋ `{isPending ? "移動中..." : ...}` ＋ `closable={!isPending}`。**対応済み**。
- `app/components/publication/PublishSettings/index.tsx` — 可視性変更は `useActionState`、`disabled` ＋ `aria-busy` ＋ `{visibilityPending ? "適用中..." : ...}`。リンク発行・row 操作も同様。**pending 可視化は対応済み**（後述「設計判断」で楽観 vs pending の振り分け）。
- `app/components/note/list/BulkVisibilityDialog.tsx` — `useTransition` ＋ `aria-live` の「N 件処理中…」＋ `disabled` ＋ `{isPending ? "適用中..." : ...}`。**対応済み**。
- `app/components/directory/{Create,Rename,Move,Delete}DirectoryDialog.tsx` — いずれも `isPending` ＋ pending ラベル ＋ `closable={!isPending}`。**対応済み**。
- `app/components/ingestion/UploadDialog.tsx` — ローカル `SkeletonBlock`（L835-843）。→ 共通 `Skeleton` に置換。

**dim の足場（既存）:**
- `app/components/note/list/NoteListViews.tsx` — フィルタ navigation 中に `data-[pending]:opacity-60` でリストを dim する既存パターン（`isLoading` 駆動）。これと同じ「`data-pending` + `transition-opacity motion-reduce:transition-none data-[pending]:opacity-60`」を BulkActionBar 由来の dim に流用する。
- `app/components/note/list/{ListView,TileView}.tsx` — `useSelection()` で `state.ids.has(note.id)` を読み `data-selected` を出している。ここに「一括処理中かつ選択中」の dim を足せる。
- `app/components/note/list/SelectionContext.tsx` / `listSelectors.ts` — `SelectionState = { ids, mode }`。**処理中フラグは持っていない**。

### 既存実装の状態（要約）

- **楽観的更新／pending のパターンは確立済みで、Issue が列挙する「未対応」の多くは実コードでは既に解消されている**（note 削除/移動、publication 可視性変更、directory 各種ダイアログ、bulk visibility 等）。Issue 本文はインベントリ時点の指摘で、現状コードはそれより進んでいる。
- **実際に残っている具体的ギャップは次の4点に集約される:**
  1. `CreateTagForm` 送信ボタンに pending 表示が無い（親に `isPending` を持たせて伝播する必要）。
  2. `NoteEditor` 保存ボタンの視覚フィードバックが文言＋disabled のみ（`aria-busy` 等の強化余地）。
  3. NoteEditor の DirectoryPicker インライン作成に固有フィードバックが無い。
  4. `BulkActionBar` 一括処理中に対象アイテムが dim されない。
  5. `trash/TrashRowActions` の「復元」ボタンに pending ラベルが無い（`disabled` のみ。list-change 系の取りこぼし）。
- **送信ボタン pending ラベルの全数調査結果:** `useServerFn` を使う client コンポーネントを全走査し、pending 表示が無いものを確認した。上記 1・5 以外（`MediaUploader`=独自 uploading 状態、`VerifyEmail`=「送信中…」あり、`EmailChangeConfirm`=自動確認で送信ボタン無し、`NewViewButton`=ダイアログを開くだけで作成は `ViewFormDialog` 所有、`IngestionQueue`=read polling、autosave/editLock=バックグラウンド）は対応済み or 対象外。
- 共通 `Skeleton` / `Spinner` は存在しない（`UploadDialog` にローカル `SkeletonBlock` が1つあるのみ）。
- docs にローディング/Suspense 規約の節が無い。

### 依存関係

- `Skeleton` の置換で `ingestion/UploadDialog.tsx` が共通コンポーネントに依存する（ローカル `SkeletonBlock` を削除）。
- `CreateTagForm` の signature 変更（`isPending` prop 追加）は呼び出し元 `TagList.tsx` に影響する。`TagList` は既に作成 transition（`startMutation`）を持つため、その pending を子へ流す。
- `BulkActionBar` の dim は `SelectionContext` / `ListView` / `TileView` に「一括処理中フラグ」を伝える経路が必要（設計判断参照）。
- Spinner を Phase 1 で UI に組み込む必須要件は無い（土台作成のみ）。ただし「資産が用意される」DoD を満たすため新設し、最低限の単体テストを置く。

## 実装ステップ

### A. 共通基盤

#### A-1. 共通 `Skeleton` コンポーネント新設

- **対象ファイル:** `app/components/common/Skeleton.tsx`（新規）
- **変更内容:** P13a の `.skeleton` / `.skeleton-bar` / `.skeleton-text` / `.skeleton-sub` をユーティリティファーストで再現する presentational コンポーネント群を作る。最小構成:
  - `SkeletonBar`（単一の矩形バー）: `h-3 bg-surface rounded-md motion-safe:animate-pulse`。`width` は `className` で上書き可能にする（既定 `w-full`）。`aria-hidden="true"`。
  - `Skeleton`（複数バー＋任意のキャプションを束ねるコンテナ）: `role="status"` ＋ `aria-live="polite"` ＋ `aria-label`（既定「読み込み中」）。中に `SkeletonBar` を `bars`（本数 or 幅配列）ぶん並べ、`label` / `sublabel` props で `--color-ink-secondary` / `--color-ink-tertiary` のテキストを出す。これが既存 `UploadDialog.SkeletonBlock` を吸収できる形。
  - スタイルは inline utility。繰り返す文字列のみ module-scoped 定数化（`app/components/common/styles.ts` に追記する判断は実装時に行う。`Skeleton.tsx` ローカル定数で足りるならそれでもよい）。
- **理由:** Phase 2 の Suspense フォールバック土台。スピナーよりスケルトン優先のデザイン方針に沿う。`motion-safe:` で `prefers-reduced-motion` 規約を満たす。

#### A-2. 共通 `Spinner` コンポーネント新設

- **対象ファイル:** `app/components/common/Spinner.tsx`（新規）
- **変更内容:** 限定用途（スケルトンが過剰な小領域・ボタン内など）向けの控えめなスピナー。Tailwind 標準 `animate-spin` を `motion-safe:` でガードし、`currentColor` ベースのリング（`border-2 border-current border-t-transparent rounded-full`）で実装。`size`（`sm`/`md`）と `className` を受ける。`role="status"` ＋ `aria-label`（既定「読み込み中」）＋ `motion-reduce:` 時はパルス無し（静的リング表示）。**装飾的な多用はしない方針を JSDoc に明記**。
- **理由:** DoD の「Skeleton / Spinner 資産」を満たす。デザイン上はスケルトン優先だが、スピナーが適切な箇所（インライン小領域）向けの最小資産を用意する。Phase 1 では既存 UI への必須組み込みは無いが、土台として提供する。

#### A-3. `UploadDialog` のローカル SkeletonBlock を共通 Skeleton に置換

- **対象ファイル:** `app/components/ingestion/UploadDialog.tsx`（L835-843 の `SkeletonBlock` と呼び出し箇所）
- **変更内容:** ローカル `SkeletonBlock` を削除し、共通 `Skeleton`（3本バー＋既存のキャプション文言）に置き換える。既存の `aria-live` 文言（「3 件のファイルをアップロード中...」「LLM がタイトルとメタデータを提案中...」等）は呼び出し側で `label` / `sublabel` として渡す形に移す。
- **理由:** 「再利用可能なものは無く、ローカルな SkeletonBlock が1つあるのみ」という現状を解消し、資産を単一化する。見た目を変えないこと（regression 無し）を前提に最小差分で行う。

#### A-4. docs 規約節の追記

- **対象ファイル:** `docs/frontend_implementation_example.md`
- **変更内容:** 「Pending UX / 楽観的更新 / Suspense フォールバック規約」節を追記。最低限:
  - **規約1:** ミューテーションは「`useOptimistic` による楽観的更新」または「`useTransition` / `useActionState` の pending 可視化（disabled + ラベル + 必要に応じ `aria-busy`）」のいずれかを必ず持つ。送信ボタンには pending ラベル（「保存中…」等）を付ける。
  - **規約2:** 楽観 vs pending の振り分け基準（本計画「設計判断」の表をそのまま明文化）。`useOptimistic` は自身が所有する状態にのみ使い、親所有データのリスト変更は親の `useOptimistic`（reducer）に集約するか `router.invalidate()` 経路に任せる（既存 docs L772-775 の制約を参照リンク）。
  - **規約3:** 非同期データ取得は `<Suspense>` ＋ 共通 `Skeleton` をフォールバックにする（**Phase 2 で導入。本節は方針の明文化のみ**）。スピナーよりスケルトン優先（spec/design 準拠）。
  - **規約4:** 失敗時はエラー境界（route の `errorComponent`）＋リトライ導線。mutation の `catch` は `extractSerializedError` で `kind` 分岐（既存節へのリンク）。
  - **規約5:** 共通資産は `app/components/common/Skeleton.tsx` / `Spinner.tsx`。パルス/スピンは `motion-safe:` でガードし `prefers-reduced-motion` を尊重。汎用ラッパーは作らず React 19 プリミティブを直接使う方針を再掲。
- **理由:** DoD「docs に規約が追記されている」。既存 docs のトーン（日本語・規約表・既存節へのクロスリンク）に合わせる。

### B. ミューテーション系の pending 可視化／楽観的更新の補完

#### B-1. `CreateTagForm` 送信ボタンの pending 表示

- **対象ファイル:** `app/components/tag/CreateTagForm.tsx`、`app/components/tag/TagList.tsx`
- **変更内容:** `TagList` の作成 transition（`startMutation` 由来の `isPending`）を `CreateTagForm` に `isPending` prop として渡す。フォームの送信ボタンを `disabled={isPending}` ＋ `aria-busy={isPending}` ＋ `{isPending ? "追加中..." : "追加"}` にする。入力欄も `disabled={isPending}` にして二重送信を防ぐ（既存の「入力を空にして早期 return」ガードと併用）。
  - 注意: `TagList` は現在 `const [, startMutation] = useTransition();` で pending を捨てている。`const [isCreating, startMutation] = useTransition();` に変え、`isCreating` を `CreateTagForm` に渡す。`isCreating` は create だけでなく rename/delete/merge transition でも立つ（同一 `useTransition`）点に留意。create 専用にしたい場合は実装時に create 用に別 `useTransition` を切るか、現状の共有で許容するか判断する（共有でも「作成中…」が他操作中に出るのは稀かつ無害なので、まず共有で実装し、レビューで判断）。
- **理由:** Issue 明示要件「`tag/CreateTagForm` の送信ボタンに pending 表示」。楽観 add は既に親が持つので、ここは pending 可視化に徹する。

#### B-2. `NoteEditor` 保存ボタンの視覚フィードバック強化

- **対象ファイル:** `app/components/note/editor/NoteEditor.tsx`
- **変更内容:** 保存/作成ボタン（L297-304）に `aria-busy={isPending}` を追加。pending ラベルは既存（「保存中...」/「作成」「保存」）。`spec/design` の「押下直後に disabled + ローディング状態」に合わせ、`pillBtnPrimary` の primary ボタンが pending 中だと分かる最小の視覚状態を付ける（例: ボタン内に共通 `Spinner`（size sm）を文言の前に出す、または `data-busy` を付けて既存スタイルの範囲で表現）。装飾過多は避ける（`spec/design` L93）。
- **理由:** Issue 明示要件「保存ボタンの視覚フィードバックを強化」。スコープ外の挙動変更（楽観化など）はしない — 保存は navigate を伴うので pending 可視化が適切。

#### B-3. NoteEditor DirectoryPicker インライン作成のフィードバック

- **対象ファイル:** `app/components/note/editor/NoteEditor.tsx`（必要なら `DirectoryPicker.tsx`）
- **変更内容:** `pendingDirectoryName !== null` の状態で保存した場合、`resolveDirectoryId()` が `createDirectoryFn` を走らせる。これを可視化する:
  - 案（推奨）: NoteEditor に `creatingDirectory` の `useState`(boolean) を追加し、`resolveDirectoryId()` の `createDirectory` await の前後で true/false に切り替える。保存ボタンのラベルを段階化（`creatingDirectory ? "ディレクトリ作成中..." : isPending ? "保存中..." : ...`）。
  - もしくは DirectoryPicker の新規名入力欄付近に `aria-live="polite"` の「保存時に作成します／作成中…」表示を出す。
  - 既存の `disabled={isPending}` でフィールドは既に固まるので、追加するのは「作成中」固有の文言フィードバックのみ。
- **理由:** Issue 明示要件「DirectoryPicker のインライン作成にフィードバックを入れる」。`startTransition` 内の逐次 await（ディレクトリ作成 → ノート作成/保存）の最初の段を可視化する。

#### B-4. `BulkActionBar` 一括処理中の対象アイテム dim

- **対象ファイル:** `app/components/note/list/BulkActionBar.tsx`、`app/components/note/list/SelectionContext.tsx`（または新規の薄い context）、`app/components/note/list/{ListView,TileView}.tsx`
- **変更内容:** 一括ゴミ箱（`runTrash` の `isPending`）が立っている間、選択中アイテム（`state.ids` に含まれる行）を dim する。実装方針（設計判断 ADR-002 参照）:
  - 推奨: `SelectionContext` を拡張して `pendingBulk: boolean` を持たせ、`BulkActionBar` が transition 開始/終了時に dispatch する。`ListView` / `TileView` の各行で `pendingBulk && state.ids.has(note.id)` のとき `data-dim`（or `data-pending`）属性を付け、`NoteListViews` と同じ `transition-opacity motion-reduce:transition-none data-[pending]:opacity-60` を行に適用。
  - dim 中もチェックボックス等を操作不能にするかは UX 判断（処理中は確定待ちなので、選択は据え置きで視覚 dim のみが妥当）。`aria-busy` を dim 行に付ける。
  - `MoveNoteDialog` / `BulkVisibilityDialog` 経由の一括操作はダイアログ側で既に pending を出しているため、今回の dim は **ゴミ箱一括（BulkActionBar 直下の `runTrash`）** を主対象にする。move/visibility にも広げるかはレビューで判断（広げる場合は同じ `pendingBulk` 経路に乗せる）。
- **理由:** Issue 明示要件「一括操作で、確定まで対象アイテムを dim する」。`P10-bulk-visibility-dialog.html` の「N 件処理中…」進捗表示の思想に合わせ、リスト側でも処理対象が分かるようにする。

#### B-5. `trash/TrashRowActions` 復元ボタンの pending ラベル（list-change 系の取りこぼし）

- **対象ファイル:** `app/components/trash/TrashRowActions.tsx`
- **変更内容:** restore / purge はどちらもゴミ箱リストから行を消す list-change ミューテーション（`router.invalidate()` 経由）。現状 `disabled={isPending}` はあるが、**「復元」ボタンに pending ラベルが無い**（purge 側は `ConfirmDialog` の `isPending` で「完全に削除」中を表現済み）。復元ボタンを `aria-busy={isPending}` ＋ `{isPending ? "復元中..." : "復元"}` にする。
  - 楽観 remove（SavedViewsList 流の `useOptimistic`）への昇格は任意。trash 一覧は親（`TrashList`）が所有するため、楽観化するなら親に `useOptimistic`(reduce) を持たせる必要があり差分が大きい。**今回は pending ラベル可視化に留める**（ADR-003 (c)）。レビューで楽観化の要否を判断。
- **理由:** DoD「すべての送信ボタンに pending ラベル」「すべてのミューテーションが楽観/pending を持つ」。調査で見つかった唯一の追加ギャップ。

#### B-6. note 作成/削除/リネーム/移動・publication 可視性変更の楽観化判定（横展開）

- **対象ファイル:** 調査の結果、いずれも既に pending 可視化済み。**追加で楽観化するのは効果・整合性が見合う箇所のみ**。
- **判定（設計判断 ADR-003 の振り分け基準に基づく）:**
  - note 作成（NoteEditor `mode:"new"`）→ 作成後に `/notes/$noteId` へ navigate。リスト上の楽観 add は所有者が異なり navigate を伴うため**楽観化しない（pending 可視化のまま、B-2 で強化）**。
  - note 削除（NoteActions `runDelete`）→ 削除後 `/` へ navigate。詳細画面からの削除なのでリスト楽観 remove の対象ではない。**pending 可視化のまま（対応済み）**。
  - note リネーム → 専用 UI は NoteEditor のタイトル保存（navigate 伴う）。**pending 可視化のまま**。
  - note 移動（MoveNoteDialog）→ 移動後 `router.invalidate()`。ダイアログ form の pending で十分。**pending 可視化のまま（対応済み）**。
  - publication 可視性変更（PublishSettings）→ `useActionState` の pending あり。**任意の追加楽観化**: 可視性 chip / radio の確定表示を `useOptimistic` で即時反映する余地はあるが、`selected` state で URL プレビューは既に即時反映済みで、ダイアログ内 form なので体感差は小さい。**今回は pending 可視化のままとし、楽観化は見送る（スコープ最小化）**。
- **理由:** Issue は「難しい箇所は最低限 pending を可視化」と明記。実コードは既に pending 可視化が成立しており、無理な楽観化は `useOptimistic` の「親所有データに使えない」制約（docs L772-775）と navigate 経路に反するため避ける。**この判定自体を成果物（plan + docs 規約）として残すことが DoD「すべてのミューテーションが楽観/pending のいずれかを持つ」のエビデンスになる**。

### C. テスト・検証

#### C-1. 共通コンポーネントの単体テスト

- **対象ファイル:** `app/components/common/__tests__/Skeleton.test.tsx`、`Spinner.test.tsx`（新規）
- **変更内容:** `role="status"` / `aria-label` が出ること、指定本数のバーが描画されること、`label`/`sublabel` が表示されること程度の軽い描画テスト。既存 `ConfirmDialog.test.tsx` のスタイルに合わせる。
- **理由:** 資産の最低限の回帰防止。過剰なテストは避ける。

#### C-2. 既存テストへの影響確認

- `CreateTagForm` の signature 変更で `tag/__tests__/TagList.test.tsx` 等が影響を受ける可能性。`isPending` prop はオプショナル（既定 false）にして既存テストを壊さない設計にする。
- `UploadDialog` の Skeleton 置換で `ingestion` 系テストが DOM 構造に依存していないか確認。

## 設計判断

詳細は `.issue/635/adr.md` を参照。要約:

- **ADR-001: パルス/スピンに新トークンを追加せず Tailwind 標準 `motion-safe:animate-pulse` / `animate-spin` を踏襲。** tokens.css にアニメーション SSOT が無く、既存実装（UploadDialog / tag styles）が Tailwind 標準を `motion-safe:` 付きで使う慣習を確立しているため。
- **ADR-002: BulkActionBar の dim は `SelectionContext` に `pendingBulk` を足し、行側で `data-pending` + 既存 `data-[pending]:opacity-60` で表現。** 新規 context を増やさず、既存の選択状態 context に最小拡張する。`NoteListViews` の dim パターンと視覚を統一。
- **ADR-003: 楽観 vs pending の振り分け基準。** (a) 自コンポーネントが所有する単一状態のトグル/インライン編集 → `useOptimistic`（DirectoryTree rename, FilterBar 等）。(b) 親が所有するリストの add/remove/rename → 親の `useOptimistic`(reducer) に集約（TagList が範）。(c) navigate を伴う作成/削除、ダイアログ form 経由の確定 → pending 可視化（disabled + ラベル + 必要に応じ aria-busy）。
- **ADR-004: Spinner は土台として新設するが Phase 1 で既存 UI への必須組み込みはしない。** DoD「資産が用意される」を満たしつつ、デザイン方針（スケルトン優先）を尊重。NoteEditor 保存ボタン（B-2）で任意採用の余地を残す。

## リスクと注意点

- **Issue 本文と現状コードの乖離:** Issue が列挙する「未対応」の多くは既に解消済み。実装では「実際のギャップ（B-1〜B-4）」に絞り、既に成立している箇所を作り直さない。レビューでこの判断（B-5 の楽観化見送り含む）が Issue 要件を満たすか確認すること。
- **`TagList` の `useTransition` 共有:** create/rename/delete/merge が同一 transition を共有しているため、`isCreating` を CreateTagForm に渡すと他操作中にも「追加中…」が出うる。実害は小さいが、気になる場合は create 専用 transition を切る。
- **DirectoryPicker フィードバックの位置:** `resolveDirectoryId()` は `startTransition` 内の最初の await。`creatingDirectory` state を transition 内で更新するため、React 19 の transition 中 state 更新の表示タイミングに注意（`useOptimistic` でなく通常 `useState` で十分だが、transition 内 setState は低優先度になりうる。確実に出すなら transition の外で setCreatingDirectory(true) → startTransition、完了/失敗で false に戻す設計を検討）。
- **`prefers-reduced-motion`:** すべてのパルス/スピンに `motion-safe:` を付け、reduce 時は静的表示にする（spec/design L93）。
- **Skeleton の a11y:** フォールバック用途では `role="status"` + `aria-live="polite"` が冗長読み上げにならないよう、装飾的な bar には `aria-hidden`、コンテナ1つに status を集約する。
- **UploadDialog 置換の見た目 regression:** 高さ・幅・パルス・キャプション色を P13a と現行に厳密一致させる。差分が出たら共通 Skeleton 側を P13a に合わせる。
- **スコープ厳守:** `<Suspense>` 境界の実張り・useFormStatus・アップロード進捗ストリーミングは入れない（Phase 2/3）。

## テスト方針

- **自動:** `pnpm typecheck && pnpm lint:fix && pnpm format`。`pnpm test:unit` で新規 Skeleton/Spinner テストと既存 tag/ingestion テストの green を確認。
- **手動（ブラウザ）:** `pnpm dev` で起動し、
  - タグ作成時に「追加中…」＋ボタン disabled が出る。
  - ノート保存/作成時に「保存中…/作成中…」＋ `aria-busy`、新規ディレクトリ名指定時に「ディレクトリ作成中…」段階表示が出る。
  - 一覧で複数選択 → ゴミ箱一括 → 確定まで対象行が dim される。
  - アップロードダイアログのスケルトンが従来どおり表示される。
  - `prefers-reduced-motion: reduce` でパルスが止まる。
- 詳細は `.issue/635/testing.md`。

## レビュー履歴

### 1周目（要件カバレッジ / アーキ・リスクをプランナー自身が検証）

**修正した点（要件カバレッジ）:**
- 送信ボタン pending ラベルの全数調査を実施。`useServerFn` を使う全 client コンポーネントを走査し、pending 表示が無いものを洗い出した結果、計画の B-1〜B-4 以外に **`trash/TrashRowActions` の「復元」ボタンに pending ラベルが無い** list-change 系の取りこぼしを発見。ステップ **B-5** として追加（旧 B-5 は B-6 にリネーム）。「既存実装の状態」にもギャップ5として追記し、全数調査の結論（対象外コンポーネントの理由含む）を明記。

**検証して問題なしと確認した点（アーキ・リスク）:**
- `motion-safe:animate-pulse` / `animate-spin` は Tailwind v4 標準で `index.css` に再定義不要（既存 `UploadDialog`/`tag/styles.ts` で使用実績あり）。ADR-001 の前提を確認。
- ADR-002 の行 dim: `ListView`/`TileView` の行は既に `useSelection()` を読み `data-selected` を合成しているため、`data-pending` + `data-[pending]:opacity-60` の追加は既存構造に無理なく乗る。`NoteListViews` の既存 dim 視覚と統一できる。
- `NewViewButton` の作成 pending は委譲先 `ViewFormDialog`（`isPending` + 「保存中...」）が所有し対応済み。B-1 の CreateTagForm とは別経路で問題なし。
- B-3 の `resolveDirectoryId()` は `createDirectoryFn` 実在を確認。transition 内 setState の表示タイミング懸念は「リスクと注意点」に記載済み。

**取り込んだ改善提案:**
- なし（調査由来の必須修正 B-5 のみ反映）。

**見送った提案とその理由:**
- publication 可視性変更 / trash 復元の `useOptimistic` 昇格は、いずれも親所有リストへの差分が大きく Issue の「難しい箇所は最低限 pending 可視化」の範囲で十分なため見送り（ADR-003 (c)）。実装時にレビューで再判断可能と明記。

### 2周目: 両視点とも問題点ゼロで終了

要件カバレッジ（DoD の Skeleton/Spinner 資産・docs 規約・全ミューテーションの楽観/pending・全送信ボタンの pending ラベル）をステップ A・B が網羅。スコープ外（Suspense 境界実張り・useFormStatus・アップロード進捗）は明示的に除外済み。アーキテクチャ面（React 19 プリミティブ直接利用・ユーティリティファースト・data-* 規約・motion-safe ガード）も計画と整合。追加の必須修正なし。
