# 実装計画 — Issue #619: ユーザー公開ページ（P30）をデザインモックに完全一致させる

**Issue:** #619
**作成日:** 2026-06-11
**複雑度:** 中〜大規模

---

## 目的

ユーザー公開ページ（`/u/$username`, P30）の実装をデザインモック（`spec/design/pages/P30-user-public-top.html` / `mobile/P30-user-public-top.html`）にレスポンシブ差分を除き完全一致させる。具体的には、(1) プロフィールヒーローの構造、(2) ソートのドロップダウン化、(3) タグ/ソート/表示モード変更の楽観的即時反映、(4) 期間フィルターの実装、(5) ノート行の日付を「公開日」ベース＋相対表現に合わせる。

## スコープ

### 含まれるもの
- プロフィールヒーローを `.profile-head`（アバター＋ID横並び）→ bio/統計を全幅で下に積む `flex flex-col` 構造へ作り直す（gap・マージンをモックに一致）
- ソートをサイクルトグルから、選択式ドロップダウン（既存 `Popover` + `useRovingMenu` の `role="menu"` パターン）へ変更
- タグトグル・ソート選択・表示モード切替を `useOptimistic` + `useTransition` で即時反映（既存 `FilterBar.tsx` パターン踏襲）
- 「期間」フィルターを URL パラメータ → loaderDeps → ユースケース → アダプター（公開日範囲）まで貫通させて実装
- ノート行の日付を `published_at`（公開日）ベースに変更し、メタ行を「YYYY年M月D日 公開」、右列を相対表現（今日 / M月D日）に合わせる。これに伴い `listUserPublicNotes` の projection を拡張し `PublicNoteItem` に公開日を持たせる

### 含まれないもの
- 「タグを追加(＋)」UI（モック `filter-row` の `＋ タグを追加` chip）の実装 — 設計判断 ADR-004 参照（スコープ外）
- P32（公開検索, #617 / #618）側の変更
- レスポンシブで変化する見た目の差分（モックがブレークポイントで変える部分）
- カレンダービューの集計軸変更（`groupNotesByDay` は据え置き。設計判断 ADR-003 参照）

## 完了条件 → ステップ/ADR 対応表

| Issue 完了条件 | 対応ステップ | 関連 ADR |
|---|---|---|
| 1. プロフィールヒーロー `.profile-head` 構造 | ステップ4 | — |
| 2. ソートのドロップダウン（選択式） | ステップ5 | ADR-002 |
| 3. タグ/ソート/表示モードの楽観的即時反映 | ステップ5 | ADR-002 |
| 4. 期間フィルター実装 | ステップ2・3・5 | ADR-005・006 |
| 5. 日付の公開日ベース＋相対表現 | ステップ1・6 | ADR-001・003 |

（補足: 完了条件5「DTO 拡張の要否を含め判断」→ ADR-001 で「汎用 `NoteListItemDTO` は拡張せず専用出力型で公開日を返す」と結論）

## 実装ステップ

### 1. バックエンド: `listUserPublicNotes` projection に公開日を追加

- **対象ファイル:**
  - `app/core/application/publication/listUserPublicNotes.ts`
- **変更内容:**
  - 出力 DTO（`ListUserPublicNotesOutput.notes`）の各要素に公開日（`publishedAt: string | null`）を含める。`NoteListItemDTO` 自体は汎用 projection（owner-scoped 一覧でも使用）であり公開ドメイン固有の `publishedAt` を持たないので、**`NoteListItemDTO` は変更せず**、本ユースケース専用の出力型 `PublicNoteListItem`（`NoteListItemDTO & { publishedAt: string | null }`）を定義してそれを返す。
  - 公開日の取得方法: 既に UoW 内で `publicationStateRepository` を保持している。**page 確定後の `liveNotes` の id 群**に対し `publicationStateRepository.findByNoteIds(noteIds)` を1回呼び、`PublicationState.publishedAt` を id→公開日の Map に詰めて projection に流し込む（`findByNoteIds` は N+1 回避のための bulk read として既に定義済み）。
  - **重要（公開日の入手経路は path で非対称）:** `publishedAt` path（`listSortedAll` / `listSortedWithinCandidates`）は publication aggregate を直接見るが、`noteColumn` path（`listByNoteColumn`）は publication をまったく見ない。よって「双方の最終 projection 箇所が共通」ではない。両 path とも **page を確定して `liveNotes` の id 群が出揃った後段に共通の後処理（`findByNoteIds` を1回）を1点だけ挟む**設計にして、そこで公開日 Map を引く。これなら path 差を吸収して1回の bulk read で済む（代替: `listSortedWithinCandidates` は既に `published_at` を SELECT 済み（捨てている）なので、それを返すよう拡張して `publishedAt` path だけ後処理を省く案もあるが、両 path 共通後処理に集約する方が単純で採用）。
- **理由:** モックのノート行は「公開日」を表示する（メタ行「YYYY年M月D日 公開」＋右列相対表現）。現状の `updatedAt` ベースでは公開日を出せない。公開日は `PublicationState` が保持しており、ユースケースから到達可能。

### 2. バックエンド: 期間（公開日範囲）フィルターをユースケース・ポート・アダプターに貫通させる

- **対象ファイル:**
  - `app/core/application/publication/listUserPublicNotes.ts`
  - `app/core/domain/publication/ports/publicationStateRepository.ts`（`PublicNoteSortedOpts` 拡張）
  - `app/core/adapters/d1/repositories/publicationStateRepository.ts`（SQL 条件追加）
  - `app/core/domain/note/ports/noteRepository.ts`（`NoteOwnerListOpts` — `noteColumn` path 用、後述の判断次第）
- **変更内容:**
  - 期間は「公開日（`published_at`）の範囲」でフィルタする（P30 は公開ノート一覧なので公開日基準が自然。日付の表示も公開日基準に揃う）。
  - **既存 `DateRange` VO を再利用する（生スカラを足さない）。** ユースケース入力 `ListUserPublicNotesInput` に `publishedRange?: DateRange`（`DateRange = { from: Date | null; to: Date | null }`、`valueObject.ts:448`）を追加。**文字列（`YYYY-MM-DD`）→ Date 変換は presentation 境界（P30 ルートの loader / server-fn）で行い**、ユースケースには `DateRange` で渡す（auth 側 `normalizeListDateRange`（`app/components/note/loaders.ts:136-147`）相当を public 用に薄く再利用/共有）。これは「文字列→Date 変換は presentation 層、ユースケースは VO を受ける」既存規約に合わせるため（ADR-006）。
  - **期間上限（`to`）は inclusive（その日を含む）にする。** auth 側は `to` を `new Date(to)`（その日 UTC 00:00）に変換し `lt(updatedAt, to)` で半開区間 `[from, to)`＝**終了日当日を除外**している（`noteRepository.ts:589`）。P30 のカレンダー UI でユーザーが終了日を選ぶと「その日を含めたい」のが自然なので、`to` を**翌日 00:00 に正規化して `lt`**（= 終了日を含む半開区間）にする。`gte/lte` を素朴に使うと `to` 当日 00:00 までしか入らず逆方向にズレるため使わない。境界（from のみ / to のみ / 同日 from=to）はユニットテスト必須（ADR-006）。
  - `publishedAt` path: `PublicNoteSortedOpts` に `publishedRange?: DateRange` を追加し、アダプターの `listSortedAll` / `listSortedWithinCandidates` 双方の `whereClause` に `gte(publishedStates.publishedAt, from)` / `lt(publishedStates.publishedAt, toExclusive)` を追加（page と count で同一 where を使うため両方に効く）。`PublicNoteSortedOpts.noteIds` は既存で `publishedAt` path に流用可。
  - **重要:** `NoteOwnerFilters.dateRange` は既存だがアダプターで **`notes.updatedAt`** に効く（`noteRepository.ts:585-589`）ため、公開日範囲フィルタとしては流用できない（更新日基準になりモックの公開日基準とズレる）。期間は publication 側で公開日範囲を解決する。
  - `noteColumn` path（`updatedAt` / `createdAt` / `title` ソート時）: このパスは `noteRepository.listWithCount`（note 列ソート）で取得しており publication の `published_at` を見ていない。期間は公開日基準で一貫させたいので、期間指定時は `publicationStateRepository` で「owner ＋ 公開日範囲 ＋（タグ候補があれば）候補 id」に合致する note id 群を先に解決し、それを `noteRepository.listWithCount` の候補集合（`noteIds IN (...)`）として渡す方式を採る。`NoteOwnerListOpts`/`NoteOwnerFilters` に候補 id フィルタ（`noteIds`）が無ければ追加する。
    - **実装方針（既存 `candidateSets` 機構への合流）:** `buildOwnerListWhere`（`noteRepository.ts:569-671`）は既に `tagIds`/`visibility`/`directoryIds`/`referencingNoteId` を `candidateSets` に集めて `intersectIdSets` で交差し、`SAFE_CHUNK_SIZE=90` で `IN` をチャンクする機構を持つ。`noteIds` フィルタは「即値の候補集合を `candidateSets` に push する」だけで `idScope` 経由のチャンク・`items.length <= total` 不変条件（`noteRepository.ts:546-552` のコメントが保証）に自動的に乗る。D1 host-var 上限も `selectInChunks` が吸収する。よって ADR-005 の方式は実現可能性が高い。
    - 注: `noteColumn` path での期間対応はクエリ設計が `publishedAt` path より重い。レビュー段階で「期間フィルター時はソート軸に関わらず公開日 path に集約する」案（＝期間指定中はソートが公開日順に固定/制限される）も比較検討する（ADR-005）。`dateRange`（更新日基準）は使わない。
- **理由:** spec `spec/pages/index.md` P30 は「フィルタバー（タグ / **期間**）」と明記。期間フィルターは URL → loaderDeps → ユースケース → リポジトリのクエリ条件まで貫通する必要がある（フロントのチップ表示だけでは要件を満たさない）。

### 3. ルート: 期間 search param と loaderDeps の追加

- **対象ファイル:** `app/routes/u/$username/index.tsx`
- **変更内容:**
  - `publicTopSearchSchema` に `from` / `to` を追加。命名・型は auth 側 `noteListSearchSchema`（`app/components/note/schema.ts:75-76`）の `from: z.string().date().optional().catch(undefined)` / `to` に合わせる（既存規約の `z.string().date()` を使う。独自 regex は使わない）。
  - `renderInputSchema`（server fn 入力）にも同項目を追加。
  - `loaderDeps` に `from` / `to` を含める（サーバー再フェッチ対象。`display` は引き続き除外）。
  - `loader` で `from`/`to`（`YYYY-MM-DD` 文字列）を `normalizeListDateRange` 相当で `DateRange` に正規化（`to` は翌日 00:00 へ）してから `renderUserPublicTop` に渡す。文字列→Date 変換はこの presentation 境界で行う（ADR-006）。
- **理由:** 期間フィルターは server-driven（再フェッチ要）。URL パラメータが正準状態であり、`validateSearch` が transport 境界の検証点（CLAUDE.md「入力検証は2点」）。

### 4. フロント: `UserPublicTop.tsx` — プロフィールヒーロー構造の修正と props 受け渡し

- **対象ファイル:**
  - `app/components/public/UserPublicTop.tsx`
  - `app/components/public/styles.ts`
- **変更内容（プロフィールヒーロー）:**
  - `PROFILE_HERO` を `grid grid-cols-[auto_1fr] gap-7 items-center` から `flex flex-col gap-5`（20px）相当へ変更（モック `.profile-hero`: `display:flex; flex-direction:column; gap:var(--space-5)`、padding `56px 0 36px` ＝既存 `py-14 pb-9` 維持）。
  - 中間グループ `.profile-head` 用クラス `PROFILE_HEAD`（`flex items-center gap-6`＝24px）を新設し、アバター＋ `.profile-id`（名前＋ユーザー名）をそこに横並びで入れる。`.profile-id` は `min-w-0`。
  - bio・統計はその外側（`.profile-hero` 直下）に全幅で積む（現状の右列ネストを解消）。
  - `PROFILE_NAME` の下マージンを `mb-1.5`(6px) → `mb-1`(4px) に（モック `margin-bottom:4px`）。`PROFILE_USERNAME` のマージンはモックに合わせ調整。
  - max-sm の gap（モバイルモック `.profile-head` / `.profile-hero` の gap）も合わせる。
- **変更内容（projection 受け渡し）:**
  - `loadNotes` の戻り型と `items` マッピングに `publishedAt` を追加（ステップ1の projection 拡張に追従）。`PublicNoteItem` に `publishedAt: string | null` を追加。
  - `loadNotes` の args に `tagNames` に加え期間（`publishedFrom` / `publishedTo`）を追加し、`Props` 経由で受け取る。`UserPublicTop` の `Props` に `from?: string` / `to?: string` を追加。
- **理由:** Issue 乖離#1（最重要・幅ズレ原因）の解消。アバター幅ぶんの bio/統計インデントを除去し、モックの「アバターと名前を上段中央揃え、bio/統計は全幅」構造に一致させる。

### 5. フロント: `PublicTopControls.tsx` — 楽観的更新・ソートドロップダウン・期間フィルター

- **対象ファイル:**
  - `app/components/public/PublicTopControls.tsx`
  - `app/components/public/styles.ts`（必要なクラス追加）
- **変更内容:**
  - **楽観的更新:** `useOptimistic` + `useTransition` を導入し、`FilterBar.tsx` の `run(action, nav)` パターン（楽観 patch ＋ URL navigation を1つの transition でラップ、navigation を await してコミットまで pending 維持）を踏襲する。楽観 state はタグ集合・ソート軸・期間を保持する reducer（`reduceFilters` 相当）。
    - **`display`（表示モード）は楽観 state に含めない（二重ソース回避）。** `PublicNoteViews` は `route.useSearch({ select: selectDisplay })` で URL から `display` を読む（`PublicNoteViews.tsx:44,59`）。`display` を Controls 側の楽観 state にも持たせると「楽観 state（Controls）」と「URL（Views）」の二重管理になる。`display` は loaderDeps 除外（ADR-004）なので `router.navigate({ replace: true })` の URL 更新が `useSearch` を即時反映する → 楽観 state を持たず URL replace の即時反映に委ねる。Controls の `active` 判定も `useSearch` を直接読む。
    - タグ・ソート・期間は loaderDeps 対象（再フェッチ要）→ 楽観 state で即時反映しつつ navigation を await。
  - **ソートのドロップダウン化:** `cycleSort` / `nextSortAxis` を廃止し、共有 `Popover`（`haspopup="menu"`）＋ `useRovingMenu`（`itemRole="menuitemradio"`）で4軸（公開日順 / 更新日順 / 作成日順 / タイトル順）の選択メニューを実装。トリガーは現状の `SORT_BTN`（chevron-down 付き）を流用し、選択中ラベルを表示。`FilterBar.tsx` の `VisibilityPopover` が直接の手本。
    - 注: P32（#617 ADR-002）はソート固定のため chevron を外したが、P30 は4軸選択可能なので chevron-down ＝ドロップダウンは正しい示唆。よって P30 では chevron を維持しメニュー化する（#617 とは状況が異なる）。
  - **期間フィルター:** モック `filter-row` のカレンダーアイコン付き「期間」chip を実装。`FilterBar.tsx` の `DatePopover`（プリセット＋範囲指定 + クリア）を P30 の public スタイル（`CHIP` 系）に合わせて移植/再利用する。プリセット・範囲解決・チップラベル整形は既存 `listSelectors` の `DATE_RANGE_PRESETS` / `resolveDateRangePreset` / `matchDateRangePreset` / `formatDateRangeChipLabel` を再利用（public 専用に複製はしない）。選択結果は `from`/`to` として URL に反映（ステップ3）。
  - **「すべて」「タグ chips」** は現状維持しつつ、楽観 state ベースで `active` を判定するよう書き換え。
- **理由:** Issue 乖離#2（ソートのサイクル→ドロップダウン）, #3（楽観的更新）, #4（期間フィルター）の解消。auth 側に確立済みの `Popover` / `useRovingMenu` / `useOptimistic` パターンがプロジェクトの「あるべき姿」であり、それを public 面に踏襲する。

### 6. フロント: `PublicNoteViews.tsx` — 公開日ベースの日付表示＋相対表現

- **対象ファイル:**
  - `app/components/public/PublicNoteViews.tsx`
- **変更内容:**
  - `PublicNoteItem` に `publishedAt: string | null` を追加（ステップ4と連動）。
  - `ListView` / `TileView`: メタ行の日付を `formatDate`（「…更新」）から公開日ベースの「YYYY年M月D日 公開」に変更（`publishedAt` を使用。`null` の場合のフォールバックを定義 — 実際は公開ノートのみなので非 null が基本だが防御的に扱う）。
  - `ListView` 右列 `NOTE_DATE`: `formatShort`（常に「M月D日」）を相対表現に変更。「今日」「昨日」（モックに「今日」あり）と、それ以前は「M月D日」、年跨ぎは必要に応じ「YYYY年M月D日」。モックの相対ルール（今日 / M月D日）に一致させる純粋関数 `formatRelativeDate(date, now)` を新設（ユニットテスト対象）。
  - `CalendarView`: 集計軸は `groupNotesByDay<T extends { id: string; updatedAt: string }>`（`listSelectors.ts:158`、キー抽出は `note.updatedAt` 直参照 line 171）に依存。ADR-003 に従い公開日に揃える。キー取得関数を第3引数（デフォルト `(n) => n.updatedAt`）として追加し、auth 側呼び出し（`CalendarView.tsx`）は無改変で後方互換、public 側だけ `(n) => n.publishedAt ?? n.updatedAt` を渡す。`PublicNoteItem` は `id` を持つ前提を満たす。
- **理由:** Issue 乖離#5（日付のラベル・データソース・相対表現）の解消。

### 7. テスト・整合

- **対象ファイル:**
  - 既存の `PublicTopControls` 関連ユニットテスト（`nextFilterSearch` / `toggleTagSet` / `nextSortAxis` 等）の確認・更新
  - 新規純粋関数（`formatRelativeDate`、期間パッチ生成、`to` の翌日正規化）のユニットテスト。**期間境界（from のみ / to のみ / 同日 from=to / 終了日当日が含まれること）を必ずカバー**（ADR-006 の off-by-one 防止）
  - `listUserPublicNotes` の usecase テスト（公開日 projection・期間フィルターがソート軸別に効く・公開日が `null` のフォールバック）
  - publication アダプターの integration テスト（公開日範囲 where が page と count 双方に効くこと、終了日 inclusive）
  - **auth 側カレンダー回帰**: `groupNotesByDay` の第3引数追加が後方互換（デフォルト `updatedAt`）で、auth 側カレンダーの日次集計が従来通りであることを確認
- **変更内容:**
  - `nextSortAxis`（サイクル用）を廃止するなら、それに依存するテストを削除。`nextFilterSearch` は `from`/`to` patch に対応するよう拡張しテスト追加。
  - `pnpm typecheck && pnpm lint:fix && pnpm format` を最後に実行。
- **理由:** CLAUDE.md のテスト戦略（レイヤー split / 純粋関数のユニットテスト / 実 DB integration）に沿う。ロジックを純粋関数に切り出して router 無しでテスト可能にする既存方針を維持。

## 設計判断

詳細は `.issue/619/adr.md` 参照。要点:

- **ADR-001:** 公開日は `NoteListItemDTO` を汚さず `listUserPublicNotes` 専用の拡張出力型で返す。公開日は `publicationStateRepository.findByNoteIds` から bulk 取得。
- **ADR-002:** 楽観的更新・ソートドロップダウン・期間 Popover は auth 側 `FilterBar.tsx` の `Popover` / `useRovingMenu` / `useOptimistic` パターンを踏襲（public 専用の新規 UI 機構は作らない）。期間プリセット等のロジックは `listSelectors` の既存関数を再利用。
- **ADR-003:** カレンダービューの集計軸を公開日に揃える（推奨）。`groupNotesByDay` のキー抽出を引数化。
- **ADR-004:** 「タグを追加(＋)」UI はスコープ外。理由はモックの装飾要素であり、バックエンドのタグ発見/サジェスト機構（公開面向け）が未整備で、実装するとスコープが大きく膨らむため。Issue 本文も「扱いは要判断」とし完了条件に含めていない。完了条件の「期間フィルター実装」は満たす。
- **ADR-005:** 期間フィルター時の `noteColumn` path（updatedAt/createdAt/title ソート）への公開日範囲適用方式（候補 id 解決経由 vs 公開日 path 集約）の選択。

## リスクと注意点

- **期間フィルターの貫通が最大の影響範囲。** ドメインポート（`PublicNoteSortedOpts`）→ D1 アダプター SQL → ユースケース → ルート schema/loaderDeps → フロントの全層に跨る。特に `noteColumn` path（updatedAt 等でソート時）の公開日範囲適用は、現状そのパスが publication を見ていないため追加の id 解決パスが要る。page と count を同一 where で揃える既存の不変条件（`items.length <= total`）を壊さないこと。
- **`NoteListItemDTO` を直接拡張しない。** この型は owner-scoped 一覧でも共用される汎用 projection。公開日は公開ドメイン固有なので専用出力型で返し、他画面に波及させない（アーキテクチャの DTO 責務分離）。
- **楽観 state とサーバー確定 state の同期。** `FilterBar.tsx` の注記（#478）にある通り、navigation を transition 内で await しないと `useOptimistic` が確定前に baseline へ戻る。await ＋ try/catch でキャンセル時の baseline 復帰を担保すること。
- **`display` の扱い（確定済み）。** loaderDeps 除外（ADR-004）。`display` は楽観 state に**含めず**、`router.navigate({ replace: true })` の URL 更新を `PublicNoteViews` の `useSearch` が即時反映することに委ねる（二重ソース回避、ステップ5・S-004 参照）。`PublicTopControls` の `active` 判定も `useSearch` を直接読む。楽観 state の対象はタグ・ソート・期間のみ。
- **相対日付の TZ・「今日」判定。** サーバーレンダリング（RSC）と表示の TZ 差で「今日」がズレうる。`PublicNoteViews` は client island なのでクライアント TZ で `formatRelativeDate(date, new Date())` を計算する（カレンダーの `tz` 取得と同様）。純粋関数化してテスト可能にする。
- **モック完全一致の検証はブラウザ目視必須。** gap/margin/構造はトークン（`--space-5`=20px, `--space-6`=24px）と突き合わせる。`spec/design/tokens.md` を確認。
- **ADR-005 の保留（代替案＝期間指定中はソート軸を公開日順に制限）に倒す場合は要合意。** 完了条件4の暗黙基準は「期間フィルターが全ソート軸で効く」こと。実装時のクエリ複雑度・候補集合サイズの都合で代替案へ倒すなら、完了条件の実質縮小になるため Issue にコメントで明示し合意を取る（レビュー無しのサイレントなスコープ後退を防ぐ）。
- **`PublicNoteItem` の `id: string` 前提を実装時に確認。** `groupNotesByDay<T extends { id: string; updatedAt: string }>` の第3引数化（ステップ6）が auth/public 双方で破綻しないよう、`NoteListItemDTO`（`PublicNoteItem` の基底）が `id` を持つことを1度確認する。

## テスト方針

- 純粋関数（`formatRelativeDate`, `nextFilterSearch` の期間対応, 期間パッチ生成）のユニットテスト。
- `listUserPublicNotes` ユースケースの fake/integration テスト: 公開日 projection が正しく載るか、期間フィルター（from/to 境界、片側のみ、ヒット0）がソート軸別に効くか、`total` と page スライスの整合。
- publication アダプターの integration テスト: 公開日範囲 where が page と count 双方に効くこと。
- ブラウザ目視: プロフィールヒーロー構造（アバター＋名前横並び、bio/統計全幅）、ソートメニュー開閉と選択、タグ/ソート/表示モードの即時反映、期間フィルターの URL 反映と再フェッチ、ノート行の「公開」ラベル＋相対日付。デスクトップ・モバイル両モックと突き合わせ。
- 詳細は `.issue/619/testing.md`。

## レビュー履歴

### 調査で確定した重要事項（初稿時点）
- `NoteListItemDTO` は管理画面でも共用される汎用型 → 公開日は専用出力型で返す（ADR-001）。
- 公開日は `PublicationState.publishedAt` が保持し、`publicationStateRepository.findByNoteIds` で bulk 取得可能（N+1 回避）。
- `NoteOwnerFilters.dateRange` は既存だがアダプターで **`notes.updatedAt`** に効くため、公開日（published_at）範囲フィルタには流用不可。期間は publication 側で解決し候補 id 集合として渡す（ADR-005、ステップ2で反映済み）。
- auth 側 `FilterBar.tsx` が `Popover` / `useRovingMenu` / `useOptimistic` / `listSelectors` 期間関数の確立済みパターンを持つ → 踏襲する（ADR-002）。`--space-5`=20px / `--space-6`=24px をトークンで確認済み。
- 空間トークン・mobile モックの `.profile-head`/`.profile-id` 構造を確認し、デスクトップ・モバイル双方で同一構造に直せることを確認。

### 1周目（2視点並列レビュー）
**修正した点（アーキ・リスク視点 P-001〜003）**:
- P-001（公開日入手経路の非対称性）: ステップ1を「page 確定後の `liveNotes` の id 群に `findByNoteIds` を1回」共通後処理に集約する設計に明確化。`publishedAt` path と `noteColumn` path で経路が非対称である点を明記。
- P-002（期間上限の inclusive/exclusive — off-by-one）: ステップ2で `to` を翌日 00:00 正規化＋`lt`（終了日 inclusive）に確定。ADR-006 を新設。境界ユニットテストを必須化（ステップ7）。
- P-003（`DateRange` VO・文字列変換層の規約整合）: ポート/ユースケースは `publishedRange?: DateRange` を受け、文字列→Date 変換は presentation 境界で行う方針に修正（ADR-006）。

**取り込んだ改善提案**:
- S-001（要件視点）: ＋chip 未実装の追跡先として Phase 4 で別 Issue を起票する旨を ADR-004 Consequences に追記。
- S-001（アーキ視点）: ステップ2/ADR-005 に「既存 `candidateSets` 機構への合流」の実装根拠を明記。
- S-002（両視点）: `groupNotesByDay` の型制約を実体（`{ id; updatedAt }`）に合わせ、第3引数でキー取得を後方互換化（ステップ6）。auth 側カレンダー回帰確認をテスト方針に追加（ステップ7）。
- S-003（アーキ視点）: ルート schema を `z.string().date()` 既存規約に統一（ステップ3）。
- S-004（アーキ視点）: `display` は楽観 state に含めず URL replace の即時反映に委ねる方針に確定（ステップ5・リスク欄）。

**見送った提案**: なし（要件視点は問題点ゼロ、改善提案はすべてスコープ内で取り込み）。

### 2周目（2視点並列レビュー — 終了）
**結果**: 両視点とも**問題点ゼロ**。1周目反映点（P-001〜003 / candidateSets 合流）が実コード（`listUserPublicNotes.ts` の `ListResult` 合流、`noteRepository.ts` の `idScope`/`count=sorted.length` 不変条件、`DateRange`@`valueObject.ts:444`、`z.string().date()`@`schema.ts:75`）と整合することを再確認。

**取り込んだ改善提案**:
- 要件 S-001: 完了条件→ステップ/ADR 対応表を plan 冒頭に追加。
- 要件 S-002: ADR-005 代替案（ソート軸制限）に倒す場合は Issue 合意を取る運用注記をリスク欄に追加。
- アーキ S-001: ADR-006 に「`DateRange` VO は半開契約のまま保ち、`to` に翌日 00:00 を詰めて inclusive を達成」を明記（VO 契約破りの誤解防止）。
- アーキ S-002: ADR-005 に経路マトリクス（タグ候補は両 path note 側／公開日範囲は path 別）を追加。
- アーキ S-003: `PublicNoteItem` の `id` 前提を実装時に確認する旨をリスク欄に追加。

**終了理由**: 2周目で両視点とも問題点ゼロのため、レビューループ終了（最大3周のうち2周で収束）。
