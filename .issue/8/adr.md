# ADR — Issue #8: P10 公開状態・内部リンク参照フィルタ + listNotesByOwner projection 拡張

## ADR-001: `visibility` フィルタは port では配列、URL では単一値

### Status
Proposed

### Context
`NoteOwnerListOpts.visibility` の型として「単一値 `PublicationVisibility`」「複数値 `readonly PublicationVisibility[]`」のどちらを取るか。フロント UI は現状 single-select だが、spec/pages/index.md の P10 は将来 multi-select への拡張余地を残している。

### Decision
port は `readonly PublicationVisibility[]`。URL schema は単一値 enum のまま。境界（`loaders.ts`）で `[singleVisibility]` に配列化して usecase に渡す。

### Consequences
- 良い点: 将来 multi-select に拡張するときに port も usecase も破壊変更不要
- トレードオフ: 現時点ではフロントが常に長さ 1 の配列を渡すという軽い冗長性。境界 1 箇所のみのコストで割に合う

---

## ADR-002: 空配列 `[]` は「マッチなし」、`undefined` は「フィルタなし」

### Status
Proposed

### Context
visibility 配列の 2 つの「空」をどう区別するか。空配列を「フィルタなし」と扱うか「マッチなし」と扱うかは設計者の選択。

### Decision
- `undefined` = フィルタを適用しない
- `[]` = 「いずれにも該当しない」= 結果は必ず `[]`

adapter は最初に空配列ガードを置き、`publication_states` を引かずに即 `return []`。

### Consequences
- 良い点: 型レベルで「未指定」と「全除外」を取り違えない。`IN ()` という SQLite 構文エラーの発生を防ぐ
- トレードオフ: 呼出側が「全選択」を表現したいときには `undefined` または 3 種全部を含む配列を渡す必要がある（明示的）

---

## ADR-003: `visibility=['private']` を含む集合の SQL 戦略

### Status
Proposed

### Context
`publication_states` 行が存在しない note は仕様上 `private` 扱い（`PublicationState` のデフォルト）。`visibility` フィルタが `private` を含むケースでは「行が無い note」も拾う必要があり、単純な `IN` だけでは表現できない。

### Decision
adapter 内で `wantsPrivate = visibility.includes('private')` で分岐:
- `wantsPrivate === false`: `select noteId from publication_states where ownerId=? AND visibility IN (visibility配列)` で候補 id を取得
- `wantsPrivate === true`: owner 配下の全 note id 集合 A − `publication_states` 上で「望み集合に含まれない visibility」の note id 集合 B を JS 上で計算

`LEFT JOIN + COALESCE` や相関 subquery は Drizzle 上の可読性が劣るため避ける。既存 `tagIds` の「二段 read + JS 集合演算」パターンと同形。

### Consequences
- 良い点: 既存実装パターンを踏襲、N+1 にならない（owner スコープの最大 2 クエリ）
- トレードオフ:
  - **index 効率の注意**: `idx_pubs_visibility_owner` は schema 上 `(visibility, ownerId)` 順。`WHERE ownerId=? AND visibility IN (...)` は visibility 単一値で最も効き、複数値 IN では index 効率が落ちる可能性あり。MVP 規模で許容
  - **線形スキャン**: `wantsPrivate === true` 経路は owner の全 note id を fetch するため、他フィルタ（referencingNoteId 等）で大幅に絞れる場合でも全件 fetch する。MVP 規模で許容、将来的には「他 candidateSets が空でない場合は先に交差を取り、その結果集合に対してのみ publicationStates を引いて wantsPrivate を判定する」順序最適化の余地あり
  - **D1 `inArray` バインド上限**: `wantsPrivate === true` 経路は owner 配下の全 note id を `intersectIdSets` 経由で `inArray(notes.id, [...])` に流し込むため、D1 / SQLite のホスト変数バインド数上限（D1 では概ね 100 程度、SQLite デフォルトは 999）に達した owner では select が失敗するリスクがある。owner のノート数が増大する将来に向けて、`wantsPrivate=true` 経路を「id 集合を渡さず subquery / EXISTS で表現する」「chunk 分割で複数回 select し union する」などの設計検討が必要。フォロー Issue として起票予定（PR #28 description 参照）。MVP 規模では発火しないため本 Issue では未対応とする → **Issue #33 で解消（`.issue/33/adr.md` 参照）**: `wantsPrivate=true` 経路を `NOT EXISTS` 相関 subquery 化し、bind 数を owner ノート数から独立させた。あわせて `loadChildren` / `findReferrers` の `inArray` も `selectInChunks` ヘルパで chunk 分割し、tag 系ユースケース（`limit=500`）経路で同じ上限を踏まないように対策済み
  - **status フィルタの先行適用**: `wantsPrivate === true` 経路の owner sweep は `opts.status ?? 'active'` で絞り込むことで候補集合を圧縮する。これにより trashed ノート等が候補に混入して `inArray` バインド数を無駄に消費しないようにしている

---

## ADR-004: 内部リンク参照フィルタは port を増やさず `findByOwner` 内で候補解決

### Status
Proposed

### Context
`referencingNoteId` を満たす note の候補 id 集合をどこで解決するか。既存 `findReferrers(targetNoteId)` は全件 hydrate して返すため listing 文脈で使うとページネーション・ソートが二重になり破壊される。

### Decision
adapter 内に閉じた helper `resolveReferrerCandidates(db, targetNoteId)` を新設し、`select distinct fromNoteId from noteInternalLinks where resolvedNoteId=?` で候補 id 集合だけを返す。port には新メソッドを追加しない。

### Consequences
- 良い点: port 表面積を増やさない。listing の責務（`findByOwner`）が一貫
- トレードオフ: 似たクエリが `findReferrers` と adapter 内に 2 箇所存在する（責務が違うので統合しない）

---

## ADR-005: `PublicationStateRepository.findByNoteIds` を新規追加

### Status
Proposed

### Context
listing 用に `NoteListItemDTO.visibility` を実値化するには `publication_states` を一括 lookup する必要がある。既存 port は `findById(noteId)` 単件のみ。

### Decision
port に `findByNoteIds(ids: readonly NoteId[]): Promise<readonly PublicationState[]>` を追加。
- `ids.length === 0` で空配列を即返す
- 順序保証なし
- 該当行がない id は結果から省略され、呼出側で `'private'` フォールバック

### Consequences
- 良い点: N+1 を回避。命名は既存 `findById` ファミリーと一貫
- トレードオフ: port のメソッドが 1 つ増える。既存 fake/in-memory 実装すべてに追従が必要

---

## ADR-006: 内部リンク参照 UI は本 Issue では「解除のみ」

### Status
Proposed

### Context
内部リンク参照フィルタの UI（入力モーダル、note picker）は UX 設計を伴うため、それ自体が独立したタスクになる。spec/pages/index.md は P11 ノート詳細からの導線（「このノートを参照しているノート一覧」）を本来の入力経路と想定している。

### Decision
本 Issue では:
- `FilterBar` で URL に `referencingNoteId` がセットされていれば chip で表示し × ボタンで解除できる
- 新規入力 UI（テキスト入力 / picker）は **実装しない**

入力 UI は別 Issue で P11 ノート詳細画面の改修と合わせて実装する。

### Consequences
- 良い点: 受入条件（URL で絞れる + 解除できる）を最小実装で満たす。UX 設計判断を本 Issue に持ち込まない
- トレードオフ: 単独で起動した状態の UI からは内部リンク参照フィルタを開始できない（URL 直叩きまたは P11 経由のみ）

---

## ADR-007: SavedView 経路の `referencingNoteId` / `visibility` 往復を本 Issue スコープに含める

### Status
Proposed

### Context
レビュー時に `ViewQueryDTO.referencingNoteId` が既に存在し `viewQueryEquals` が比較に使っていることが判明した。同時に `searchToViewQuery` は `visibilityFilter` を保存するが `viewQueryToSearch` 側で復元していない既存の軽微 bug も発覚。`searchToViewQuery` / `viewQueryToSearch` に referencingNoteId / visibility を扱わせないと、本 Issue の `?referencingNoteId=...` / `?visibility=...` パラメータが SavedView 保存・復元で消失し「URL と SavedView が常に不一致と判定される」即時バグになる。

### Decision
本 Issue スコープに以下を含める:
- `listSelectors.searchToViewQuery` / `viewQueryToSearch` の `referencingNoteId` / `visibility` 復元処理
- `app/routes/index.tsx` の `baseSearch` マージで `viewQueryToSearch` の結果を取り込み、SavedView 復元時に loader 引数が正しく満たされるようにする
- **`referencingNoteId` 永続化グルー (UI 層)**: `app/components/view/schema.ts` の `createSavedViewSchema.query` に `referencingNoteId` 追加、`actions.ts` の `referencingNoteId: null` ハードコード解消、`SaveViewDialog` の submit ペイロード対応 — ドメイン VO (`ViewQuery.referencingNoteId`) は既に存在するため UI 層のグルー修正のみで完成

**スコープ外として別 Issue 起票**:
- `visibilityFilter` の永続化全域: ドメイン VO (`ViewQuery`) には `visibilityFilter` フィールドが存在せず、永続化には VO 拡張 / repository / domain service の対応が必要で別ドメインへの波及が大きい
- SavedView 選択時に URL を `?viewId=...` のままにせず、復元された全パラメータで URL を rewrite する UX 改善（現状は URL と UI に乖離あり）

### Consequences
- 良い点: `referencingNoteId` は元々 `ViewQuery` VO に存在するため、UI 層のグルー修正だけで往復が完成する。本 Issue 受入条件「`?referencingNoteId=...` で結果が正しく絞られる」が SavedView 経路でも維持される
- トレードオフ: `visibility` は本 Issue では URL レベルのフィルタリングのみで、SavedView への永続化は次の Issue で対応。referencingNoteId と visibility で対応範囲が非対称になるが、ドメイン VO 設計の差を尊重する方が正しい

---

## ADR-008: search 経路への visibility 入力伝達は別 Issue

### Status
Proposed

### Context
本 Issue の受入条件「`?visibility=public` 等で結果が正しく絞られる」は filter 経路（`q` 空）に閉じれば満たせる。`q` 非空の search 経路で `?visibility=...` を反映するには `searchOwnNotes` 側の visibility 入力伝達と loader 経路の改修が必要だが、これは `.issue/1/adr.md` ADR-012（search 経路の visibility プレースホルダ問題）と同じ別 Issue で解消されるべき。

### Decision
- 本 Issue では `FilterBar` の公開状態 select を **両モードで常時表示**（UI 一貫性のため）
- ただし search 経路では select の値が結果に反映されない既知挙動を残す。ADR と PR 説明に明記
- search 経路の visibility 入力伝達は ADR-012 解消用の別 Issue で対応

### Consequences
- 良い点: 本 Issue のスコープを filter 経路に閉じる。UI 一貫性は確保
- トレードオフ: search 経路で公開状態 select を操作しても効かない期間が残る。next issue で解消する旨を ADR-012 にクロスリンク

---

## ADR-009: count 表示の filter 未反映を本 Issue では維持

### Status
Proposed

### Context
`countByOwner(ownerId)` は filter / status / opts を一切見ない実装で、`listNotesByOwner` は `total = countByOwner` を返している。本 Issue で visibility / referencingNoteId を追加すると「filter で 3 件しか表示されないのに total が 100 件」のような表示乖離が新フィルタで顕在化する。

### Decision
- 本 Issue では count を変更しない（受入条件「retrograde しない」を厳格解釈し、新たな破壊変更を入れない）
- 顕在化する表示乖離は **別 Issue（`countByOwnerFiltered(opts)` 化 または UI 文言の変更）** として起票する
- 本 PR の説明に「件数表示は filter 未反映の既存挙動」を明記

### Consequences
- 良い点: 本 Issue のスコープを守れる。`countByOwner` の opts 受け取り設計は別途検討余地が残る
- トレードオフ: 新フィルタで表示乖離が目立つ。UX としては別 Issue 解消までの暫定挙動

---

## ADR-010: `.issue/1/adr.md` の ADR-001 / ADR-012 / ADR-013 の解消範囲

### Status
Proposed

### Context
`.issue/1/adr.md` の以下 ADR は Issue #8 で取り扱うとされていた:
- ADR-001: P10 公開状態・内部リンク参照フィルタ未実装をスコープ外として記録
- ADR-012: search 経路の visibility プレースホルダ `'private'`
- ADR-013: filter 経路でも visibility badge / select を抑制する暫定挙動

### Decision
- ADR-001: 本 Issue で完全解消（filter 経路 + UI 追加）
- ADR-013: 本 Issue で解消（`showVisibilityBadge` を `mode === "filter"` 時 true へ）
- ADR-012: **本 Issue では解消しない**。search 経路の visibility 実値化は `searchOwnNotes` 側の改修が必要で別 Issue。`NoteList.tsx` で `showVisibilityBadge = mode === "filter"` とすることで誤表示は引き続き避ける

### Consequences
- 良い点: 本 Issue のスコープが明確。Issue 本文の受入条件のみで完結
- トレードオフ: search 経路の visibility badge は引き続き非表示。ADR-012 解消は次の Issue として残る
