# ADR — Issue #33: D1 inArray バインド上限対策

## ADR-001: visibility filter の `wantsPrivate=true` 経路は `notExists` 相関 subquery で表現

### Status
Accepted

### Context
`.issue/8/adr.md` ADR-003 のフォロー Issue。`wantsPrivate=true` 経路は owner 配下の全 note id を JS Set に load → 差集合 → 最終 `inArray(notes.id, [...intersected])` に流すため、owner ノート数が D1 ホスト変数上限（≒ 100）を超えると select が失敗する。

選択肢:
- **(A) `notExists` 相関 subquery 化**: SQL レベルで「`publication_states` に notWanted な行が存在しない note」を表現
- **(B) chunk 分割**: id 集合を 50〜100 件ずつ分割し union
- **(C) `notes.visibility` 冗長列追加**: writes 経路で同期

### Decision
**(A) `notExists` 相関 subquery を採用**。

`wantsPrivate=true && notWanted.length > 0` の場合、`notes` 本体クエリの WHERE 句に以下の述語を合成する:

```sql
NOT EXISTS (
  SELECT 1 FROM publication_states ps
  WHERE ps.note_id = notes.id
    AND ps.owner_id = ?
    AND ps.visibility IN (...notWanted)
)
```

bind 数は `notWanted` の長さ（最大 2）+ ownerId のみ。owner ノート数に依存しない。

`wantsPrivate=true && notWanted.length === 0`（visibility に 3 種全て含む）は述語不要、`conditions` に push しない。

### Consequences
- 良い点:
  - bind 上限を根本解決（owner 規模に依存しない定数 bind）
  - owner sweep 1 段の I/O が削除される（既存実装は wantsPrivate=true で常に `SELECT id FROM notes WHERE owner=?` を走らせていた）
  - index 効率: `publication_states.noteId` PK と `idx_pubs_visibility_owner (visibility, ownerId)` を併用可能
  - 「`publication_states` に notWanted な行がない note」と SQL が直接読める可読性
- トレードオフ:
  - drizzle の相関 subquery (`notes.id` 参照) 構文は本リポジトリ初。挙動を integration test で実測検証する必要あり
  - 極端な owner（10万 notes 規模）では nested loop が遅くなる可能性。MVP 規模では明らかに現状より速い（sweep 1 段が消えるため）が、将来規模拡大時は EXPLAIN QUERY PLAN で再評価

### 補足: NOT EXISTS subquery 内の `ownerId` 条件
`publicationStates.noteId` は PK で `notes.id` への FK、かつ outer query は `notes.ownerId = ownerId` を条件に持つ。理屈上は subquery 側の `eq(publicationStates.ownerId, ownerId)` は冗長（ps.noteId → notes.id → notes.ownerId が 1:1）。しかし `idx_pubs_visibility_owner (visibility, ownerId)` を planner に選ばせる選択肢を残すために保持する。後の最適化レビューで「冗長 = 削除」と短絡しないよう注意。

### 却下した選択肢
- **(B) chunk 分割**: 対症療法。クエリ数が `ceil(N / 90)` 倍に増え、JS 側 union ロジックも追加コスト。bind 上限境界そのものに将来再ヒットする
- **(C) 冗長列**: `publication_states` 変更時の `notes.visibility` 同期 (event handler / trigger)、schema migration、テスト改修すべて発生。読み取り 1 クエリ削減のための構造変更としては過剰

---

## ADR-002: `loadChildren` / `findReferrers` は `selectInChunks` ヘルパで保護

### Status
Accepted

### Context
Issue 本文には「`loadChildren` も同じ unbounded `inArray` パターンを抱えるため、合わせて検討余地あり」と明記。`loadChildren` は `hydrateMany(rows)` から呼ばれるため、入力 size は呼出側の `limit` で間接制約される。

実装調査の結果:
- `app/core/application/tag/deleteTag.ts` `mergeTags.ts` `renameTag.ts` が `findByOwner` を **`limit: 500`** で呼ぶ
- 該当ユーザーが 500 件のヒットを返した場合、`hydrateMany([500 rows])` → `loadChildren([500 ids])` → `inArray(noteTags.noteId, [500 ids])` で D1 上限を超える

`findReferrers` も `inArray(notes.id, fromIds)` を持ち、`fromIds` は「target note を参照している note 数」で実質無制限。

### Decision
`app/core/adapters/d1/repositories/_chunks.ts` に汎用 chunk ヘルパを追加:

```ts
export const D1_BIND_LIMIT_HOST_VARS = 100;
export const SAFE_CHUNK_SIZE = 90;  // 余白 10
export async function selectInChunks<T>(
  ids: readonly string[],
  runner: (chunk: readonly string[]) => Promise<readonly T[]>,
  chunkSize: number = SAFE_CHUNK_SIZE,
): Promise<readonly T[]>;
```

`loadChildren` の 3 つの select と `findReferrers` の `inArray(notes.id, ...)` をこのヘルパ経由に書き換える。

`findReferrers` の `ORDER BY` は chunk 内に閉じるため、chunk 全結合後に JS 側で同等の sort を再適用する。

### Consequences
- 良い点:
  - tag 系ユースケース (`limit=500`) で実際に踏むパスが防御される
  - chunk ヘルパは pure function で unit test 完備
  - 90 件チャンクで余白 10 を確保し、将来 D1 limit が変わっても少なくとも 90 までは安全
- トレードオフ:
  - クエリ数が `ceil(N / 90)` 倍に増える（500 件で 6 クエリ）。`loadChildren` は元々 `Promise.all` で 3 並列なので、合計 18 クエリ → 数 ms オーバーヘッド
  - `findReferrers` の order は SQL 一発時と完全同等にはならない（chunk 跨ぎの並び順は JS sort 結果に依存）

### 配置の判断
- `app/core/adapters/d1/repositories/_chunks.ts`: adapter 局所の関心事（D1 ホスト変数上限）を domain / application に滲ませない
- `noteRepository.ts` 内 private method ではなく独立 file: `findReferrers` でも使い、将来他リポジトリでの再利用余地があるため
- `app/lib/` 直下ではない: D1 アダプタ固有の concern を `app/lib/` に置くと、他 provider adapter（将来追加されうる）に意味の無い依存が生じる

---

## ADR-003: その他の `inArray` 箇所はスコープ外

### Status
Accepted

### Context
プロジェクト全体で `inArray` を使う箇所は他にも複数存在:
- `app/core/adapters/d1/repositories/noteRepository.ts` `resolveTagAndCandidates` (`inArray(noteTags.tagId, [...tagIds])`)
- `app/core/adapters/d1/repositories/mediaAssetRepository.ts`
- `app/core/adapters/d1/repositories/tagRepository.ts`
- `app/core/adapters/d1/repositories/publicationStateRepository.ts` `findByNoteIds`
- `app/core/adapters/d1/repositories/outboxRepository.ts`

### Decision
本 Issue では **`noteRepository` の `findByOwner` / `loadChildren` / `findReferrers` 経路のみ対応**。他は別 Issue で扱う。

理由:
- `resolveTagAndCandidates` の `tagIds` は UI フィルタ入力で、実運用では 10 件未満が大半
- `publicationStateRepository.findByNoteIds` は listing 用に `NoteListItemDTO.visibility` を実値化する目的で呼ばれるが、入力は `notes` 主クエリの `limit` 後 rows なので `loadChildren` 同等の境界制約 → 同様のリスクはあるが、本 Issue の主訴である「visibility フィルタが頻繁に踏まれる落とし穴」とは別動線
- スコープを膨らませると PR review が肥大化、デグレリスクが上がる

### Consequences
- 良い点: 本 Issue は完結性を保ち、レビュー負荷も適正
- トレードオフ: `publicationStateRepository.findByNoteIds` 等で類似の落とし穴が残る。同パターンを `selectInChunks` で順次潰す follow-up Issue を別立てする方針

---

## ADR-004: `resolveVisibilityCandidates` の `statusFilter` 引数を削除

### Status
Accepted

### Context
旧実装の `wantsPrivate=true` 経路は owner sweep の段階で `status` を絞り込み、候補集合を圧縮していた（`.issue/8/adr.md` ADR-003 末尾参照）。NOT EXISTS 化後は owner sweep そのものが消えるため、status pre-filter の意味が無くなる。

### Decision
`resolveVisibilityCandidates` を 2 つに分割し（ADR-001 参照）、`statusFilter` 引数は両者から削除する。`opts.status` は `findByOwner` 本体の `conditions` で既に評価されるため、結果セマンティクスは不変。

### Consequences
- 良い点:
  - private method のシグネチャがシンプルになる
  - status 評価が `notes` 主クエリ 1 箇所に集約される
- トレードオフ:
  - なし（呼出側は `findByOwner` 内 1 箇所のみ、外部影響なし）
