# 実装計画 — Issue #171: findByOwner chunk 経路の 2-pass 最適化

**Issue:** #171
**作成日:** 2026-05-23
**複雑度:** 中〜大規模（1 ファイルの内部書き換え + integration テスト 1 件追加）

---

## 目的

`D1NoteRepository.findByOwner` の chunk 経路（`idScope !== null`）のメモリ展開量を `idScope.size × NoteRow` から `limit × NoteRow` + `idScope.size × {id, sortCol}` に削減する。`contentHtml` が 10-50KB/行に達する実運用下で `idScope.size = 5000, limit = 50` で 50-250MB クラスのマテリアライズが発生していた（Workers 128MB ヒープ制限超過）問題を 2-pass 化で解消する。

PR #170 (Issue #165) review-001.md の **P-W-001 / P-W-002** Follow-up。

## スコープ

### 含まれるもの
- `app/core/adapters/d1/repositories/noteRepository.ts` の `findByOwner` の `idScope !== null` 分岐を 2-pass 化
- 1-pass 目: 軽量 projection `{ id, [sortCol] }` を `selectInChunks(idScope, ...)` で取得 → JS sort → `slice(offset, offset + limit)` で page id を確定
- 2-pass 目: 確定した `pageIds` に対して `selectInChunks(pageIds, ...)` で全カラム取得 → `Map<id, NoteRow>` で order 復元 → `hydrateMany`
- 既存 `sortNoteRowsBy` を generic 化し Pass 1 の軽量 row でも使えるようにする（`findReferrers` 呼び出しは型推論で互換維持）
- 新規 integration test **T-bind-015**: Pass 1 で `where` 追加述語が適用されることを観測する 1 件

### 含まれないもの
- `idScope === null` 経路（DB 側 `ORDER BY/LIMIT/OFFSET` 一発）は一切変更しない
- `countByOwner` の chunk 経路（review-001.md P-W-003 は別 Follow-up、既に `count()` 集計済み）
- `findReferrers` / `findByDirectory` / `findByIds` 他のリード経路
- `buildOwnerListWhere` の return shape / signature
- `selectInChunks` / `SAFE_CHUNK_SIZE` の signature
- chunk 並列度上限ガード（review-001.md A-W-003 別 Follow-up）
- DB-side covering index 追加（ADR-001 却下案 (B) 参照）

## 実装ステップ

### 1. `sortNoteRowsBy` の generic 化

- **対象ファイル:** `app/core/adapters/d1/repositories/noteRepository.ts`
- **変更内容:** signature を `function sortRowsByColumn<T extends { readonly id: string } & Readonly<Record<SortColumn, string>>>(rows: readonly T[], sortCol: SortColumn, order: "asc" | "desc"): T[]` に変更し、tie-break / 比較ロジックは現状維持
- **理由:** Pass 1 の軽量 projection (`{ id, [sortCol] }`) と Pass 2 後の `NoteRow` の両方を同じ helper で sort できるようにする。重複コード発生を防ぐ
- **互換:** 既存 `findReferrers` の呼び出し `sortNoteRowsBy(rows, "updatedAt", "desc")` は `T = NoteRow` で推論されるため変更不要

### 2. `findByOwner` の chunk 分岐を 2-pass 化

- **対象ファイル:** `app/core/adapters/d1/repositories/noteRepository.ts`（現状 l.395-408 の chunk 分岐）
- **変更内容:**
  1. Pass 1: `selectInChunks(Array.from(idScope), (chunk) => db.select({ id: notes.id, [sortCol]: notes[sortCol] }).from(notes).where(and(where, inArray(notes.id, [...chunk]))))`
     - drizzle の dynamic projection key で typecheck が緩む場合は、`pickSortColumn` の switch を Pass 1 builder に拡張して 3 分岐に展開する（実装時に判断）
  2. JS sort: `sortRowsByColumn(sortRows, sortCol, order)` → `slice(opts.offset, opts.offset + opts.limit)` → `pageIds = pageKeys.map(r => r.id)`
  3. 早期 return: `pageIds.length === 0` なら `[]` を返す
  4. Pass 2: `selectInChunks(pageIds, (chunk) => db.select().from(notes).where(inArray(notes.id, [...chunk])))`
     - `where` 再適用は不要（ADR-001 §補足で根拠説明）
  5. Order 復元: `byId = new Map<string, NoteRow>(); for (const r of fullRows) byId.set(r.id, r); ordered = pageIds.map(id => byId.get(id)).filter(Boolean)`
     - `byId.get(id) === undefined` の skip は Pass 1/Pass 2 間の並行 delete に対する許容（ADR-001 §トレードオフ）
  6. `return this.hydrateMany(ordered)`
- **理由:** Issue の本旨。メモリ削減効果は ADR-001 §Consequences の数値ガード参照

### 3. Integration テスト追加 T-bind-015

- **対象ファイル:** `app/core/adapters/d1/__tests__/noteRepository.integration.test.ts`
- **追加位置:** 既存 T-bind-014 の直後（`describe("bind limit guard", ...)` 内）
- **シナリオ:**
  - seed: owner 配下に「100 件 active + public」「50 件 trashed + public」（同じ owner / dir）
  - call: `findByOwner(owner, { visibility: ['public'], status: 'active', limit: 200, offset: 0 })`
  - assert: 結果 100 件、trashed の id を含まない
- **目的:** 2-pass 化後も Pass 1 で `status='active'` 述語が適用され、`visibility=['public']` で 150 件入った `idScope` から trashed 50 件が除外されることの観測

### 4. ポストチェック

- `pnpm typecheck && pnpm lint:fix && pnpm format`
- `pnpm test:integration` で noteRepository 関連の T-bind-001..015 全 PASS

## 設計判断

詳細は `.issue/171/adr.md` 参照。

- ADR-001: 2-pass JS-side（Pass 1 軽量 sort → Pass 2 page 全カラム）を採用。却下案として DB-side covering index、`selectInChunks` の projection ホルダ拡張、usecase 側で `limit` を縮小

## リスクと注意点

1. **I/O 増加:** Pass 2 の chunk 数だけクエリが増える。最大 `limit = 500`（`deleteTag`/`mergeTags`/`renameTag` の `*_NOTE_PAGE_SIZE`）で ~6 chunks。`Promise.all` 並列なのでレイテンシ増加は ~1 ラウンドトリップに留まる。D1 課金は増えるが MVP 規模で許容
2. **Pass 1 / Pass 2 間の並行 delete:** 旧 chunk 経路と同じ race（chunk 取得 → JS sort → slice → hydrateMany の間に状態変更）。Pass 2 で `byId.get(id) === undefined` を skip することで「ページ件数が limit より少ない」結果になる。これは DB 側 LIMIT/OFFSET 経路でも同じ症状で、既存挙動と整合
3. **Pass 2 の order preservation:** `selectInChunks` は chunk 並列実行で order を保証しない。`Map<id, NoteRow>` で再索引してから `pageIds` の順序に並べ直すロジックを明示的に書く必要あり
4. **`opts.limit` 上限:** callers の最大値は 500（tag 系 usecase）。`SAFE_CHUNK_SIZE = 90` を超えるため Pass 2 も `selectInChunks` 必須（plain `inArray` 1 回不可）
5. **dynamic projection key の typecheck:** drizzle の `select({ [sortCol]: notes[sortCol] })` が computed key で推論を弱める可能性。実装時 typecheck エラーが出れば `pickSortColumn` を builder 拡張して 3 分岐展開
6. **`title` / `updatedAt` / `createdAt` は schema 上 NOT NULL:** Pass 1 の sort で null 考慮は不要（既存 `sortNoteRowsBy` 挙動と整合）

## テスト方針

- **既存 T-bind-008..014** がそのまま PASS することを確認（2-pass 化後も振る舞いは等価）
- **新規 T-bind-015** で Pass 1 が `where` 追加述語（`status`）を反映することを観測
- 観測できない項目（projection が `{id, sortCol}` のみ、Pass 2 で `where` 再適用がないこと、メモリ削減量）は **code review + ADR §補足で担保**
- staging で `contentHtml` の大きいオーナーに対する `listNotesByOwner` を叩き、Workers の `cpu_time` / OOM ログを確認（人間が確認すべき項目）

## 関連

- Issue #165 / PR #170: 本 Issue が解消する Follow-up を生んだ PR
- `.issue/165/adr.md` ADR-001 Follow-up 候補（P-W-001 / P-W-002 として識別）
- `.issue/165/review/review-001.md` P-W-001 / P-W-002

## レビュー履歴

### 1周目（プランナー直書き、軽量レビュースキップ）
- Issue 本文が実装方針を詳細に指定済み（2-pass の Pass 1/Pass 2 構造、対象範囲）であり、`.issue/165/adr.md` Follow-up 候補と `.issue/165/review/review-001.md` P-W-001 / P-W-002 で既に詳細な分析が完了している
- スコープが `findByOwner` の `idScope !== null` 分岐 1 箇所と integration test 1 件追加に限定される
- Phase 3 の PR レビューで実装観点（projection、order 復元、where 再適用）を多角的に検証する前提
