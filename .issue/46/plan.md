# 実装計画 — Issue #46: noteRepository.findReferrers: 結果上限制御 (LIMIT/OFFSET 化)

**Issue:** #46
**作成日:** 2026-06-01
**複雑度:** 中〜大規模

---

## 目的

`D1NoteRepository.findReferrers` が target を参照する全 referrer を無制限に hydrate し JS sort する現状を改め、結果集合を bounded にする。人気ノート（1万件被リンク想定）で 1 万行を 1 リクエスト内で full hydrate し `loadChildren([1万ids])` を同時発火させるメモリ・CPU 圧を解消する。ノート詳細ページのバックリンク表示は top-N preview に絞りつつ、件数表示は正確な総数を保つ。

## スコープ

### 含まれるもの

- `NoteRepository.findReferrers` の port シグネチャを `findReferrers(targetNoteId, opts?: NoteListOpts)` に変更（opts optional、省略時は従来通り全件）。
- adapter 実装を `findByOwner` 確立済みの 2-pass chunk パターン（軽量列で全候補ソート → top-N の id 確定 → その N 件のみ full fetch + hydrate）に書き換える。opts 省略時は全件パスを維持。
- 詳細ページの正確な総数を `countByOwner(ownerId, { referencingNoteId })` の流用で取得。`getNoteDetail` の出力 DTO に `backlinkCount: number` を追加し、preview を top-N に絞る。
- `NoteMetaPanel` のバックリンク section を top-N preview 表示に変更し、件数表示を総数（`backlinkCount`）ベースに修正。
- 上記に対応する unit / integration テストの追加・更新。

### 含まれないもの

- `getBacklinks`（UI 未使用、テストのみ）の挙動変更。port 変更後も引数無指定で呼ぶため**全件返す挙動を維持**する。
- export 経路（`export/service.ts` の `findReferrers(referencingNoteId)`）の挙動変更。全件 id 集合が必要なため opts 無指定で従来どおり全件を受け取る（後方互換）。
- `findReferrers` の削除や `getBacklinks` への統合などの本 Issue 外リファクタ。
- `resolveReferrerCandidates` の重複（`findReferrers` がインラインで同等クエリを持つ）の解消は付随的に行えるが必須ではない（下記ステップ2参照）。

## 採用アプローチと根拠

**案A（optional pagination）を採用**。`findReferrers(targetNoteId, opts?: NoteListOpts)` とし、opts 省略時は全件（export / getBacklinks 後方互換）、opts 指定時のみ bounded slice。

- **案B（無条件 top-N）却下**: export が `new Set(referrers.map(n => n.id))` で全 referrer の id 集合を必要とするため、無条件 top-N にすると export のフィルタが壊れる（論点1）。
- **案C（port 上で結果上限を明示）却下**: 上限を固定すると export の全件要求と両立しない。optional opts で「全件 or bounded」を呼出側が選べる案Aの方が port 表面の意味が明快。
- 案Aは既存の `NoteListOpts`（limit/offset/sort/order）を再利用でき、`findByOwner` の 2-pass chunk パターンと同じ構造で実装できるため、新しい型・新しいパターンを増やさず確立済みパターンを尊重できる（CLAUDE.md「確立されたパターンを尊重する」）。

### 論点1（export 全件要求）への結論

opts 省略時に全件を返す後方互換を port JSDoc に明記。export / getBacklinks は呼び出しを一切変更しない。adapter の opts 省略パスは現行コード（chunk fetch → JS sort → hydrateMany 全件）と意味的に等価に保つ。

### 論点2（hydrate コスト削減）への結論

**`findByOwner` の 2-pass chunk パターン（Issue #171 で確立）を `findReferrers` にも適用する**。これは論点2が求める最適化そのもの:

1. referrer 候補 id を全取得（`noteInternalLinks` から fromNoteId、現行どおり）。
2. opts 指定時: 候補 id 全件に対し**軽量列のみ**（`id, updatedAt, createdAt, title`）を `selectInChunks` で取得 → `sortNoteRowsBy` で global sort → `opts.offset/limit` で slice → top-N の id 確定。
3. その top-N（最大 limit 件）の id だけ full `NoteRow` を `selectInChunks` で取得 → id で reindex してページ順を復元 → `hydrateMany`。

これにより重い `contentHtml`/`frontMatterJson` の materialise と `loadChildren` は top-N 件だけに当たる。chunk 境界をまたぐソート整合性は `findByOwner` と同一ロジック（既存 T-bind-006 と同じ要件）。

opts 省略時は現行の全件パス（full fetch → sort → hydrateMany 全件）を維持。**2-pass にする意味があるのは limit で件数を絞る場合のみ**なので、全件パスは 1-pass のまま。

### 論点3（詳細ページの総数）への結論

**`countByOwner(ownerId, { referencingNoteId: noteId })` を流用**する。新規 `countReferrers` port メソッドは追加しない。

- 根拠1: `countByOwner` は既に `referencingNoteId` フィルタを `resolveReferrerCandidates` 経由でサポートしており（adapter L627-631）、`listWithCount`/`findByOwner` と同一の `buildOwnerListWhere` で resolve される。port 表面を増やさず、フィルタ family の整合性を保てる（noteRepository.ts の `countByOwner`/`listWithCount`/`findByOwner` 三兄弟の設計思想に沿う）。
- 根拠2: 内部リンクは owner 内でしか解決しない（`findActiveByOwnerAndTitle` 等が owner-scoped、リンク解決リアクションも owner join）ため、referrers は事実上 owner-scoped。`getNoteDetail` は `found.entity.ownerId` を保持しており、target note の owner = referrer の owner なので `countByOwner(found.entity.ownerId, { referencingNoteId })` は referrer 総数と一致する。
- **status フィルタ整合性の注意点**: `findReferrers`（インライン版）は status 無条件で全 referrer を返す（trashed 含む）。`countByOwner({ referencingNoteId })` は status フィルタ未指定なら active+trashed 両方をカウントする（`countByOwner` JSDoc: opts に status が無ければ全 status）。よって両者は status スコープが一致し、preview の top-N（status 無指定）と count（status 無指定）が同じ母集合を指す。**この一致を保つため、`getNoteDetail` の count 呼び出しでも status フィルタを付けない**こと。テストで明示的に担保する（下記 T-detail-count）。

`getNoteDetail` の出力 DTO に `backlinkCount: number` を追加し、これを UI の件数表示に使う。

### 論点4（UI 表示）への結論

- inline リストを top-N preview に絞る（10000件 inline 描画も本 Issue のパフォーマンス意図に反する）。
- 件数表示「（{N} 件）」を `backlinks.length` から `backlinkCount`（総数）ベースに変更。
- **preview 件数 N = 5** を提案（定数 `BACKLINK_PREVIEW_LIMIT = 5`）。バックリンクは「このノートを参照しているノート一覧を見る」フッターリンク（home の `referencingNoteId` フィルタ = ページネーション済みパス）への導線が既にあり、詳細ページ内の inline は「主要な被参照の手がかり」を見せれば十分。`searchByTitlePrefix` の suggest 等と同様、詳細パネルの inline preview は小さい定数が妥当。
  - **配置**: `getNoteDetail.ts` の usecase 内に定数として置く（preview 件数は application の表示ポリシーであり、port/adapter の関心事ではない）。`findReferrers` には `{ limit: N, offset: 0 }` を渡す。

### 論点5（スコープ厳守）への結論

`getBacklinks` は opts 無指定で `findReferrers` を呼ぶため挙動不変。export は無変更。port シグネチャ変更は呼出側の既存呼び出し（引数1個）と互換（opts は optional）。

#### port 変更の型安全性（レビューで確認済み）

`findReferrers` を実装する全箇所が optional `opts?` 追加で壊れないことを確認した:

- adapter `D1NoteRepository.findReferrers`（実装本体、ステップ2で変更）。
- `app/core/application/export/runExportJob.ts:220` の `buildAssemblyDeps` 内 stub `async findReferrers() { return []; }` — `ExportAssemblyDeps.noteRepo: NoteRepository`（完全 port）を structural に満たすファサード。引数 0 個の実装は `(targetNoteId, opts?) => Promise<readonly Note[]>` に**代入可能**（余剰 optional 引数は許容）なので typecheck は壊れない。**この stub は変更不要**。
  - 補足（実装時に裏取りし訂正）: この stub の `findReferrers` が `[]` を返すことは**バグではない**。`service.ts:344` の `findReferrers` は `resolveTargetNotes`（service.ts:309）内にあり、runExportJob は L78-84 で**real `noteRepository`** を渡してこれを実行する。一方 stub を持つ `buildAssemblyDeps` は `assembleArtifact`（レンダリング経路）専用で findReferrers を一切呼ばない。よって export の `referencingNoteId` 絞り込みは正しく機能しており、stub の `[]` は never-called メソッドの placeholder にすぎない。Phase 4 でこの点を検証し、起票不要と判断。
- 直接呼び出し側（`getNoteDetail`、`getBacklinks`、`service.ts:344`）はすべて引数1個で呼んでおり、opts optional 化で影響を受けない。
- テスト内のモック実装 2 箇所も optional `opts?` 追加で壊れない（S-001）: `app/core/domain/directory/__tests__/service.test.ts:187`（`findReferrers(_n: NoteId): Promise<readonly Note[]>` の明示シグネチャ — 引数の少ない関数は多い引数の型に代入可能）、`app/core/domain/note/__tests__/service.resolveInternalLinks.test.ts:65`（`notImplemented` + `as unknown as NoteRepository` キャストで素通り）。いずれも変更不要。

#### exactOptionalPropertyTypes 注意

tsconfig は `exactOptionalPropertyTypes: true`。getNoteDetail で渡す `findReferrers(id, { limit, offset })` と `countByOwner(ownerId, { referencingNoteId })` はいずれも**フィールドが常に present な literal**なので、export service が使うような piecewise build（`...(x ? {k} : {})`）は不要。`undefined` を明示代入しないこと（例: `{ referencingNoteId: id }` であって `{ referencingNoteId: id, status: undefined }` ではない）。

## 実装ステップ

### 1. port シグネチャの変更

- **対象ファイル:** `app/core/domain/note/ports/noteRepository.ts`
- **変更内容:**
  - `findReferrers(targetNoteId: NoteId): Promise<readonly Note[]>` を
    `findReferrers(targetNoteId: NoteId, opts?: NoteListOpts): Promise<readonly Note[]>` に変更。
  - JSDoc を更新: 「`opts` 省略時は target を参照する全 note を `updatedAt DESC, id DESC` 順で全件返す（export / backlinks-export 用途の後方互換）。`opts` 指定時は `limit/offset/sort/order` に従い bounded slice を返す。`sort`/`order` 省略時のデフォルトは `updatedAt`/`desc`。referrer 総数が必要な呼出側は `countByOwner(ownerId, { referencingNoteId })` を併用する（referrers は事実上 owner-scoped）」旨を明記。
- **理由:** 案A。opts optional で全件/bounded を呼出側が選べるようにし、後方互換を型レベルで保証する。

### 2. adapter 実装の 2-pass chunk 化

- **対象ファイル:** `app/core/adapters/d1/repositories/noteRepository.ts`（`findReferrers` L764-789）
- **変更内容:**
  - シグネチャを `findReferrers(targetNoteId: NoteId, opts?: NoteListOpts)` に変更。
  - referrer 候補 id 取得は現行どおり（`resolveReferrerCandidates(targetNoteId)` を流用して重複インラインクエリを解消可能 — 既に private method として存在し `buildOwnerListWhere` も使用している。流用してインラインクエリを 1 箇所に集約する）。`fromIds` が空なら `[]`。
  - `opts === undefined` の場合: 現行と等価な全件パス（`selectInChunks` で full row 取得 → `sortNoteRowsBy(rows, "updatedAt", "desc")` → `hydrateMany`）。
  - `opts` 指定時: `findByOwner` の 2-pass chunk path（L451-489）と同型:
    1. `sortCol = pickSortColumn(opts.sort)`, `order = opts.order ?? "desc"`。
    2. Pass1: `selectInChunks(fromIds, chunk => select({id, updatedAt, createdAt, title}).from(notes).where(inArray(notes.id, chunk)))`。
    3. `sortNoteRowsBy(sortRows, sortCol, order).slice(opts.offset, opts.offset + opts.limit)` で pageKeys 確定。空なら `[]`。
    4. Pass2: pageIds を `selectInChunks` で full fetch → `Map<id, NoteRow>` で reindex → pageIds 順に並べ替え → `hydrateMany`。
  - `mapDbError` ラップは維持。
- **理由:** 論点2。重い hydrate / loadChildren を top-N 件だけに当てる。`findByOwner` と同一の確立済みパターンを使うことで chunk 境界ソート整合性が既存実装と同じ保証を得る。
- **補足:** referrers には owner 列が無い join だが、内部リンクは owner 内解決のため owner-scoped。adapter 側で owner 条件を追加する必要はない（現行どおり `resolvedNoteId` join のみ）。

### 3. usecase（getNoteDetail）に総数取得と top-N preview を導入

- **対象ファイル:** `app/core/application/note/getNoteDetail.ts`
- **変更内容:**
  - モジュールスコープ定数 `const BACKLINK_PREVIEW_LIMIT = 5;` を追加。
  - `GetNoteDetailOutput` に `backlinkCount: number` を追加。
  - `findReferrers(found.entity.id)` を `findReferrers(found.entity.id, { limit: BACKLINK_PREVIEW_LIMIT, offset: 0 })` に変更（sort/order はデフォルト updatedAt/desc）。
  - 並行して `countByOwner(found.entity.ownerId, { referencingNoteId: found.entity.id })` を呼び、総数を取得。referrers の preview 取得と count を `Promise.all` でまとめてもよい（UoW 内の read 同士は同一 in-flight tx を共有しないため安全 — adapter の `listWithCount` が同パターンを使用）。
  - 返り値に `backlinkCount` を追加。`backlinks` は top-N preview。
  - **status 整合性**: `countByOwner` には status フィルタを付けない（preview も status 無指定なので母集合を一致させる。論点3参照）。
- **理由:** 論点3/4。preview を絞っても件数表示が正確になる。`backlinkCount` を DTO に追加することで UI が総数を持てる。

### 4. UI（NoteMetaPanel / NoteDetail）の件数表示修正

- **対象ファイル:** `app/components/note/detail/NoteMetaPanel.tsx`, `app/components/note/detail/NoteDetail.tsx`
- **変更内容:**
  - `NoteMetaPanelProps` に `backlinkCount: number` を追加。
  - フッターリンクの「（{backlinks.length} 件）」を「（{backlinkCount} 件）」に変更。
  - `NoteDetail.tsx` で `detail.backlinkCount` を `NoteMetaPanel` に渡す（`const { note, backlinks, backlinkCount, directorySegments } = detail;`）。
  - inline リスト自体は `backlinks`（top-N preview）をそのまま map するので描画ロジック変更は不要。preview が総数より少ない場合でもフッターの「一覧を見る」導線（home の referencingNoteId フィルタ = ページネーション済み）で全件にアクセスできる。
- **理由:** 論点4。10000件 inline 描画を防ぎつつ件数を正確に保つ。

### 5. テストの追加・更新

- **対象ファイル:**
  - `app/core/adapters/d1/__tests__/noteRepository.integration.test.ts`（T-bind-004/005/006 周辺）
  - `app/core/application/note/__tests__/getNoteDetail.integration.test.ts`
- **変更内容（詳細はテスト方針セクション）:**
  - adapter: opts 指定時の bounded slice / top-N 順序 / chunk 境界跨ぎ / offset ページネーション / opts 省略時の全件後方互換を検証。
  - usecase: preview が `BACKLINK_PREVIEW_LIMIT` で頭打ちになること、`backlinkCount` が総数（preview 上限超）を返すこと、status=trashed referrer も count に含まれ preview にも出る（母集合一致）こと。
- **理由:** chunk 境界・top-N 順序・count 整合・後方互換の回帰防止。

## 設計判断

詳細は `.issue/46/adr.md` を参照。

- **ADR-001:** 案A（optional pagination）採用と案B/C 却下の根拠。
- **ADR-002:** 総数は新規 `countReferrers` ではなく `countByOwner({ referencingNoteId })` 流用。port 表面を増やさず status スコープ整合を保つ。
- **ADR-003:** preview 件数 N=5 と配置（usecase 定数）。

## リスクと注意点

- **status スコープのズレ**: `findReferrers`（preview, status 無指定 = trashed 含む）と `countByOwner`（status 無指定 = trashed 含む）の母集合一致が崩れると件数とリストが食い違う。getNoteDetail で**両者とも status フィルタを付けない**ことを厳守。テストで担保。
- **count の追加 RTT**: getNoteDetail に count クエリが 1 本増える。referrer 数が少ない通常ケースでは `resolveReferrerCandidates` の link 行 select が 2 回走る（preview 側 + count 側）。`Promise.all` で並列化し累積レイテンシを抑える。本質的には preview が全件 hydrate しなくなる削減効果の方が大きい。
- **2-pass の race**: Pass1 と Pass2 の間に referrer note が削除されると page が limit 未満になりうる。これは `findByOwner` の 2-pass / DB-side LIMIT/OFFSET と同じ既存の許容済み race（adapter L475-481 のコメント）であり、新規リスクではない。
- **`resolveReferrerCandidates` 流用時の挙動同一性**: 現行インラインは `Set` で重複排除 → 配列化。`resolveReferrerCandidates` は `ReadonlySet` を返すので `Array.from()` で配列化すれば等価。流用は任意（必須ではない）だが、流用するなら重複排除セマンティクスが同一であることを確認する。

## テスト方針

### adapter（integration）

既存 T-bind-004/005/006 は opts 省略時の全件挙動の回帰として**そのまま維持**（後方互換の保証になる）。以下を追加:

- **T-ref-limit-001（bounded slice + top-N 順序）**: 候補を chunk 境界（>90 件、例 150 件）跨ぎで seed し、`findReferrers(target, { limit: 10, offset: 0 })` が `updatedAt DESC, id DESC` の global top-10 を返すこと（chunk 内に閉じない正しい global 順序）。
- **T-ref-limit-002（offset ページネーション）**: 同 seed で `{ limit: 10, offset: 10 }` が次ページを返し、limit:20/offset:0 の 11〜20 件目と一致すること。
- **T-ref-limit-003（tie-break）**: 同一 `updatedAt` の referrer が chunk 跨ぎで複数あるとき `id DESC` で安定 tie-break される（T-bind-006 の bounded 版）。
- **T-ref-limit-004（sort=createdAt / order=asc）**: opts.sort/order が反映されること（最低 1 パターン）。**注意（P-001）**: `sortNoteRowsBy` の tie-break は `order` に依存せず常に `id DESC` 固定（`findByOwner`/`listWithCount` の SQL パス `orderBy(asc/desc(sortCol), desc(notes.id))` と同一挙動）。`order: "asc"` でも二次キーは id DESC のまま。よって本テストの seed は createdAt を**全件ユニーク**にして tie を避けるか、tie を作る場合は期待値を「primary asc, id DESC」で組む。`findReferrers` を `findByOwner` と完全同型に実装すれば自動的に整合する（ヘルパ変更は不要）。
- **T-ref-limit-005（opts 省略 = 全件後方互換）**: `findReferrers(target)`（引数1個）が従来どおり全件を `updatedAt DESC, id DESC` で返す（T-bind-004 が実質これだが、port 変更後も引数省略呼び出しが型・挙動とも維持されることを明示）。export は referrer の**順序非依存**（`new Set(referrers.map(n=>n.id))` で id 集合のみ使用）なので、この T-ref-limit-005 で opts 省略パスの後方互換は十分担保され、export 専用テストは不要。

### usecase（integration）

`getNoteDetail.integration.test.ts` に追加:

- **T-detail-preview**: referrer を `BACKLINK_PREVIEW_LIMIT` 超（例 8 件）seed し、`backlinks.length === BACKLINK_PREVIEW_LIMIT`、かつ `backlinkCount === 8` を確認。
- **T-detail-count**: referrer 0 件 / 1 件 / N 件で `backlinkCount` が正確なこと。
- **T-detail-count-trashed**: status=trashed の referrer も count に含まれ、preview にも出る（母集合一致）ことを確認（status スコープのズレ回帰防止）。
- 既存「returns the NoteDTO, backlinks list」テストは `backlinks` に referrer が含まれることを検証しており、preview 上限内なら影響なし。`backlinkCount` 検証を追記。**注意（P-002）**: 実装前に当該テストのアサーション方式を確認すること。`GetNoteDetailOutput` に**必須**フィールド `backlinkCount` を追加するため、既存テストがオブジェクト全体を `toEqual`（完全一致）で検証している場合は期待値に `backlinkCount` を追加しないと落ちる。`toMatchObject`（部分一致）なら影響なし。

### 動作確認

`testing.md` 参照。

## レビュー履歴

### 1周目（要件カバレッジ / アーキテクチャ・リスク — セルフレビュー）

サブエージェント委譲ツールが利用不可のため、2 視点をプランナー自身でセルフレビューした。

**修正した点**:
- port 変更の型安全性を実コードで裏取り。`app/core/application/export/runExportJob.ts:220` の `findReferrers` stub（`ExportAssemblyDeps.noteRepo: NoteRepository` を structural に満たすファサード）が optional `opts?` 追加で壊れないこと（余剰 optional 引数は代入可能）を確認し、論点5に明記。あわせて、この stub が `[]` を返す = export の referencingNoteId 絞り込みが runExportJob 経路で実質未実装という既存状態を発見し、スコープ外として記録。
- `exactOptionalPropertyTypes: true` を確認。getNoteDetail で渡す opts literal はフィールド常時 present なので piecewise build 不要である旨を注意点として追記。
- `findReferrers` の全実装・全呼出箇所を grep で網羅確認（adapter 本体 / export stub / getNoteDetail / getBacklinks / service.ts / port 定義）。

**確認した良い点**:
- 論点2が要求する「軽量列ソート → top-N id 確定 → N 件のみ full fetch + hydrate」最適化は `findByOwner` の 2-pass chunk path（Issue #171, adapter L439-489）で既に確立済みで、そのまま流用できる。chunk 境界ソート整合性も同一ロジックで担保される。
- 論点3の総数取得は `countByOwner({ referencingNoteId })` が既存サポート済みで port 表面を増やさずに済む。referrers の owner-scoped 性も `resolveReferrerCandidates`／リンク解決が owner-join である事実で裏取り済み。
- export / getBacklinks の後方互換が opts optional 化で型・挙動とも維持される。

**未解決事項**: なし。

注: 委譲不可によりセルフレビュー 1 周で収束。実装後の PR レビュー（issue-implement Phase 3）でレイヤー別の多角レビューが入る前提。

### 2周目（要件カバレッジ / アーキテクチャ・リスク — 2視点並列レビュー）

issue-implement Phase 1 で 2 視点を並列サブエージェントでレビューした。両視点とも「実装に進んで問題ない水準」と判定。

**要件カバレッジ視点**: 問題点ゼロ。3 案の採用判断・3 呼出側の用途整理・件数表示要件・スコープ整合・テスト網羅をすべて実コードで裏取りして妥当と確認。

**アーキ・リスク視点**: 2-pass chunk パターン流用・`countByOwner` 流用・status スコープ整合・owner-scoped 性・UoW 内 Promise.all 安全性をすべて実コードで裏取りして妥当と確認。軽微な要修正 2 点を反映:

**修正した点**:
- **P-001**: `sortNoteRowsBy` の tie-break が `order` に依存せず常に `id DESC` 固定である事実を T-ref-limit-004 の注意点に追記（asc テストの期待値の組み方を明記）。
- **P-002**: `GetNoteDetailOutput` への必須 `backlinkCount` 追加で既存 usecase テストが完全一致アサーションだと落ちる点を、ステップ5テスト方針に注意として追記。

**取り込んだ改善提案**:
- **S-001（アーキ視点）**: 型安全性の網羅性向上のため、`findReferrers` モック実装 2 箇所（`directory/__tests__/service.test.ts:187`、`note/__tests__/service.resolveInternalLinks.test.ts:65`）を型安全性節に追記。
- **S-001（要件視点）**: export が順序非依存ゆえ T-ref-limit-005 で後方互換が十分担保される旨をテスト方針に追記。

**見送った提案とその理由**:
- **S-002（アーキ視点）**: count の二重 `resolveReferrerCandidates` を `findReferrersWithCount` 的統合 port に畳む案 → 本 Issue は `Promise.all` 並列化で十分妥当。将来の引き継ぎとして ADR-003 トレードオフに 1 行残す（下記）。
- **S-003（要件視点）**: N=5 を既存 suggest 上限定数に揃える案 → `searchByTitlePrefix` の上限は呼出側がクランプする別物で直接の対応定数がない。N=5 は ADR-003 で UX 仮置きと明記済みで、PR レビューで調整余地ありとして据え置き。
- **S-002（要件視点）/ getBacklinks のスコープ理由補強** → 既に「含まれないもの」で UI 未使用・export view 共有のみと記載済みのため追加不要。

**未解決事項**: なし。両視点とも問題点ゼロ相当（軽微な P は反映済み）で 2 周目終了。
