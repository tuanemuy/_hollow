# 実装計画 — Issue #387: サイドバーでディレクトリを選択してもノート一覧が変わらない

**Issue:** #387
**作成日:** 2026-05-31
**複雑度:** 中〜大規模

---

## 目的

サイドバー（`DirectoryTree`）でディレクトリを選択したとき、ノート一覧が選択ディレクトリのノートに切り替わり、選択中ディレクトリがフィルターチップで可視化され、解除で `directoryId` が適切に扱われるようにする。

## 根本原因（メイン調査で確定）

Issue 本文は原因を「FilterBar にチップ/解除UIが無い」と推定しているが、これは症状の一部にすぎない。「一覧が変わらない」直接原因は **list（フィルタ）経路で `directoryId` がフィルタ連鎖に通っていない** こと。

- `loaders.ts` の `loadOwnedNotes`：検索経路（キーワードあり）は `searchOwnNotes` に `directoryId` を渡す（効く）が、**フィルタ経路（キーワードなし）の `listNotesByOwner` 呼び出しでは渡していない**。
- サイドバー選択は `HOME_SEARCH` で `q` をリセット → キーワードなし → フィルタ経路 → `directoryId` が落ちる。
- そもそも `ListNotesByOwnerInput` / `NoteOwnerListOpts` / adapter の `buildOwnerListWhere` のいずれにも `directoryId` が存在しない。

したがって domain port → adapter → usecase → loader を `directoryId` で貫通させ、加えて FilterBar に可視化/解除UIを足す。

## スコープ

### 含まれるもの
- `directoryId` を list 経路のフィルタ連鎖（port → adapter → usecase → loader）に追加。**直下のディレクトリに属するノートのみ**を equality 一致でフィルタ。
- FilterBar に選択中ディレクトリのチップ + 解除（×）UI、`clearAll` での `directoryId` 明示扱い。
- usecase 結合テスト（directoryId フィルタ・count 整合）の追加。

### 含まれないもの
- **サブツリー一致**（子孫ディレクトリのノートも含める挙動）。本Issueは直下equality一致で「一覧が切り替わる」バグを解消する（設計判断 ADR-001、ユーザー確認済み）。検索経路（サブツリー）との非対称はフォローアップ候補として Phase 4 で扱う。
- `noteListSearchSchema`（`directoryId` 定義済み）・route loader（`directoryId` を `loadOwnedNotes` に既に渡している）・NoteList の transport 配線の変更（既に揃っている）。

## 実装ステップ

### 1. domain port に `directoryId` を追加

- **対象ファイル:** `app/core/domain/note/ports/noteRepository.ts`
- **変更内容:** `NoteOwnerListOpts` に `directoryId?: DirectoryId;` を追加（`DirectoryId` は import 済み）。`NoteOwnerCountOpts` の `Pick` キー集合に `"directoryId"` を追加。AND セマンティクスの JSDoc に「指定ディレクトリ直下の単純equality一致」を1文追記。
- **理由:** フィルタ型の SSOT。連鎖の起点。`Pick` 派生なので count 側も追従。

### 2. adapter に where 条件を追加

- **対象ファイル:** `app/core/adapters/d1/repositories/noteRepository.ts`
- **変更内容:** `buildOwnerListWhere`（dateRange 条件の直後）に `if (opts.directoryId !== undefined) conditions.push(eq(notes.directoryId, opts.directoryId));` を追加。candidateSets ではなく単純条件（status と同型）。
- **理由:** `findByOwner` / `countByOwner` / `listWithCount` が共有する唯一の where ビルダー。1箇所で3兄弟が揃う。`idx_notes_directory_status` インデックスに乗る。

### 3. usecase で橋渡し

- **対象ファイル:** `app/core/application/note/listNotesByOwner.ts`
- **変更内容:** `ListNotesByOwnerInput` に `directoryId?: DirectoryId;` を追加（`DirectoryId` を import）。opts 構築に `...(input.directoryId !== undefined ? { directoryId: input.directoryId } : {})` を追加。
- **理由:** usecase は静的型を信頼して opts に渡すだけ。

### 4. loader フィルタ経路で `directoryId` を渡す

- **対象ファイル:** `app/components/note/loaders.ts`
- **変更内容:** フィルタ経路で transport 文字列を `DirectoryId.create` でブランド化して `listNotesByOwner` 入力へ渡す。`referencingNoteId` と同型に malformed は `try/catch` で undefined フォールバック。`@/core/domain/directory/valueObject` から `DirectoryId` を import。
- **理由:** 「一覧が変わらない」直接原因の解消。

### 5. FilterBar に選択中ディレクトリのチップ／解除UIを追加

- **対象ファイル:** `app/components/note/list/FilterBar.tsx`, `app/components/note/list/NoteList.tsx`
- **変更内容:**
  - NoteList で受け取り済みの `tree`（`FlatDirectory[]`）から `search.directoryId` に一致するノードを引き、`directoryName`（解決できなければ undefined）を FilterBar に渡す。追加 I/O ゼロ。
  - FilterBar に `directoryName?: string` Props を追加。`referencingNoteId` チップと同型のチップを追加（ラベル: ノードが引ければ `name`、引けなければ汎用ラベル「ディレクトリ」）。`×` で解除。
  - **解除は optimistic 反映で referencingNoteId と対称にする（P-001）**: `OptimisticFilters` / baseline に `directoryId` を加え、`reduceFilters` に `clearDirectory` ケース（`directoryId: undefined`）を追加。チップ表示判定（`optimistic.directoryId !== undefined`）・`hasAnyFilter`（現 184 行の raw Props 参照を `optimistic.directoryId` に切替）を optimistic 基準にする。解除は `run({ type: "clearDirectory" }, prev => ({ ...prev, directoryId: undefined }))` で即時にチップが消える。setter（選択）は不要、解除のみ。`OptimisticFilters` は必須プロパティ集合なので baseline/clearAll/clearDirectory への追加漏れは型で検知される。
  - **チップラベルの出所一致ガード（P-003、referencingNoteId と対称）**: `directoryName` Props は `search.directoryId` 由来なので、別ディレクトリへ即時切替/解除した transition 中に optimistic 値と Props 名がズレうる。ラベルは `optimistic.directoryId === directoryId ? (directoryName ?? "ディレクトリ") : "ディレクトリ"` の形で出所一致をガードする（`referencingNoteId` チップの `optimisticReferencingNoteId === referencingNoteId ? title : null` と同型）。
  - **`clearAll` の navigate 側は変更不要（P-002）**: 現状 `{ display, q? }` の全置換で `directoryId` は既に落ちる。ただし `reduceFilters` の `clearAll` ケースに `directoryId: undefined` を加え、楽観スナップショットを整合させる。
  - チップ解除時の `page` は据え置く（`clearReferencingNoteId` の既存挙動に倣う）。
- **理由:** 期待挙動「選択中の可視化」「解除で directoryId も適切に扱う」を満たす。

### 6. テスト追加

- `listNotesByOwner` 結合テストに以下を追加（既存 `referencingNoteId` ケースに倣う）:
  - directoryId をアダプタに通し、直下ノートのみ返る / count が直下ノート数に一致。
  - **ネガティブケース（S-003）**: 子ディレクトリにノートを置き、親 directoryId 指定では子ノートが返らないこと（ADR-001 の直下equality仕様の回帰防止）。
  - **directoryId × tagIds 併用（S-002）**: directoryId が `conditions`（idScope=null 単一クエリ経路）に乗り、tagIds（candidateSet）と正しく交差すること。

### 7. 検証

- `pnpm typecheck && pnpm lint:fix && pnpm format`、`pnpm test:integration`（listNotesByOwner）。

## 設計判断

- **ADR-001: list 経路は直下equality一致（サブツリーにしない）** — ユーザー確認済み。詳細は adr.md。
- **チップのラベル解決:** 既存の `tree`（loader が `loadDirectoryTreeFlat` で取得済み）を NoteList で再利用して名前を解決。追加 loader/I-O は作らない。
- **optimistic state には directoryId を載せない:** directoryId はサイドバー Link 由来で FilterBar 内に setter が無く、解除のみ。`referencingNoteId` 解除と同じ単発 navigate 粒度で十分。

## リスクと注意点

- `NoteOwnerCountOpts` の `Pick` に `"directoryId"` を足し忘れると count と items が乖離（Issue #30 不変条件違反）。port 修正時に必ず両方更新。
- adapter の条件は candidateSets ではなく `conditions`（単純equality）に入れる。candidateSets に入れると空集合短絡ロジックに巻き込まれる。
- loader の `DirectoryId.create` で malformed を throw させない（try/catch フォールバック）。検索経路は生文字列を渡し usecase で `create` する非対称があるが、各 usecase 入力型に合わせるのが正。
- ツリー未掲載 id（削除直後など）でチップ名が解決できないケースのフォールバックを用意（汎用ラベル「ディレクトリ」）。
- **副作用（S-003 arch）**: list 経路に directoryId が効くようになると、SavedView 復元時に保存済み `directoryId` が従来「無視」から「フィルタとして効く」に変わる。バグ修正として望ましい方向だが挙動変化として認識しておく。

## レビュー履歴

### 1周目
**修正した点（要修正）:**
- P-001（arch / directoryId 解除の optimistic 非対称）: `OptimisticFilters` に directoryId を載せ、`clearDirectory` ケースで即時反映する方針に修正（ステップ5）。
- P-002（arch / clearAll 過剰記述）: clearAll の navigate 側は全置換で既に落ちるため変更不要に修正。reduceFilters の clearAll ケースに directoryId: undefined を加えるのみ（ステップ5）。

**取り込んだ改善提案:**
- S-001（req / チップ名フォールバック確定）: ラベルは name 解決 or 汎用ラベル「ディレクトリ」に確定。
- S-002（arch）/ S-003（req）: ネガティブケース + directoryId × tagIds 併用テストを追加（ステップ6）。
- S-003（arch / SavedView 副作用）・S-001（arch / 不正id挙動の非対称）: リスク・ADR に追記。

**見送った提案:**
- S-002（req / page リセット）: 既存 referencingNoteId 解除に倣い page 据え置きを明示。挙動変更はしない。

要件レビューは1周目で問題点ゼロ。アーキレビューの P-001/P-002 を反映済み。

### 2周目
**修正した点（要修正）:**
- P-003（チップラベルの出所一致ガード）: `directoryName` Props と optimistic 値のズレを防ぐため、ラベルを `optimistic.directoryId === directoryId ? (directoryName ?? "ディレクトリ") : "ディレクトリ"` でガード（referencingNoteId と対称化）。ステップ5に反映。

**取り込んだ改善提案:**
- S-004 / S-005: baseline・reduceFilters の各ケース・hasAnyFilter（184行）への directoryId 反映を実装メモとして明記。

P-001/P-002 は2周目で解消確認。残課題なし。計画確定。

## テスト方針

- usecase 結合: directoryId 指定で直下ノートのみ返る / count 整合（`listNotesByOwner` 結合テスト）。
- FilterBar: コンポーネントテストがあればチップ表示・解除 navigate のケース追加。なければブラウザ検証（manual-test）で担保。
- 全体: `pnpm typecheck && pnpm lint:fix && pnpm format` と `pnpm test:integration`。
