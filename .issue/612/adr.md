# ADR — Issue #612: 公開プロフィールの publicNoteCount が trashed-but-public を過大カウント

## ADR-001: 件数専用 `countPublicByOwner` を port/adapter に新設し getPublicProfile から使う

### Status
Proposed

### Context

`getPublicProfile` の `publicNoteCount` は `findPublicByOwner(ownerId, {limit:1000}).length` で導出している。`findPublicByOwner` は `publication_states.visibility = 'public'` のみを見て `notes.status = 'active'` を JOIN しないため、trash → outbox relay のラグ中に残る trashed-but-public 行を数えてしまい、同一ページの listing total（#605 の `listPublicNoteIdsByOwnerSorted` → `listSortedAll`、active JOIN count）より過大になる。さらに `limit:1000` により公開 1000 件超で件数が頭打ちになる二次課題もある。

`findPublicByOwner` は 3 呼び出し元で共有される:

1. `getPublicProfile` — 件数導出（修正対象）。
2. `listRelatedPublicNotes` — `{limit:1000}` で over-fetch 後、`noteRepository.findByIds` → `status === 'active'` で in-memory 再フィルタ済み（既に正しい）。
3. `deleteAccount` — keyset cursor で**全** public publication_states 行を walk し private に flip する掃除。trashed-but-public 行も private に戻す必要がある。

選択肢:

- (a) `findPublicByOwner` 自体に `notes.status = 'active'` JOIN を足す。
- (b) `getPublicProfile` 側で `findPublicByOwner` の結果を `noteRepository` で hydrate し、active を in-memory でフィルタして数える。
- (c) 件数専用の active 集計メソッド `countPublicByOwner` を port/adapter に新設し、`getPublicProfile` から使う。`findPublicByOwner` は不変更。

### Decision

(c) を採用。

(a) は退ける: deleteAccount が trashed-but-public 行を private に戻せなくなり掃除が不完全になる（trash 状態のまま公開 publication 行が残留しデータが不整合化）。また keyset cursor の母集合が active 行のみに変わり、「全 public 行を安定 walk する」という cursor の意味も崩れる。listRelatedPublicNotes も over-fetch 件数の意味が変わる。共有メソッドの契約破壊は影響が広すぎる。

(b) は退ける: `limit:1000` 頭打ちが残り（AC-3 未達）、件数のためだけに全公開ノートを hydrate する over-fetch コストが恒常化する。COUNT を SQL に降ろせるのに application 層で数えるのは非効率かつ集約境界的にも余計な note hydrate を招く。

(c) は #605 `listSortedAll` が確立した「公開面の count は `notes.status = 'active'` を INNER JOIN した母集合で数える」パターンの素直な再利用。count 専用なので limit が不要で頭打ちが原理的に消え、listing total と同一の WHERE 条件で数えるため整合する。`findPublicByOwner` は不変更で 3 呼び出し元のうち他 2 つの挙動・keyset cursor 意味を完全に保つ。

### Consequences

- 良い点:
  - trashed-but-public を除外した live 件数になり、同一ページの listing total と整合する。
  - `limit:1000` 頭打ちが COUNT クエリ化により同時に解消（公開 1000 件超でも正確）。
  - `findPublicByOwner` を一切触らないため deleteAccount の掃除・listRelatedPublicNotes・keyset cursor の意味が無変更。
  - 集約境界を維持（adapter の read-only SQL に notes JOIN を限定、application に note hydrate を持ち込まない）。
  - `idx_pubs_owner_visibility_published_at` がそのまま効き、スキーマ変更・マイグレーション不要。
- トレードオフ:
  - port に件数メソッドが 1 つ増える（`findPublicByOwner` の `.length` と意味が異なる count メソッドが並ぶ）。JSDoc で「active 母集合・limit なし・listing total と整合」を明示して使い分けを誘導する。
  - PublicationStateRepository の fake が無いため、新メソッドの検証は D1 integration test に依存する（#605 と同じ方針）。

---
