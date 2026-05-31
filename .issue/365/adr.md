# ADR — Issue #365: タグ利用件数が常に0件になる: note_count を read-time 集計へ

## ADR-001: 件数セマンティクスを active（非 trashed）ノート基準に統一する

### Status
Proposed

### Context
タグ利用件数を read-time 集計に変えるにあたり、何を「件数」とするかを定義する必要がある。`notes` には `status: 'active' | 'trashed'` があり、現状 `mergeTags` の集計は status フィルタなしで active+trashed 混在で数えている。FilterBar のタグファセットは active ノートに対してフィルタを掛ける。

### Decision
`notes.status = 'active'` で絞った件数を採用する。集計クエリの join 条件側に `eq(notes.status, 'active')` を入れる（`COUNT(notes.id)`）。タグはあるが全 note が trashed のタグは 0 と表示される。

### Consequences
- 良い点: FilterBar でフィルタした結果件数と表示件数が一致し、「N件表示なのにフィルタ結果0件」のズレが起きない。
- トレードオフ: 旧 `mergeTags` が書いていた active+trashed 混在の `note_count` 列値とセマンティクスがずれるが、その列は表示に使われなくなる（死蔵）ため実害なし。

---

## ADR-002: note_count 列・索引・entity API・mergeTags の更新ロジックは残置する

### Status
Proposed

### Context
read-time 集計化により、`tags.note_count` 列・`idx_tags_owner_note_count` 索引・`tags_note_count_nonneg` check、ドメインエンティティ `Tag.noteCount` フィールドと `incrementNoteCount`/`decrementNoteCount`、`mergeTags` の increment 呼び出しが「表示に使われない（死蔵）」状態になる。これらを本Issueで撤去するかを判断する必要がある。

### Decision
本Issueでは撤去せず残置する。撤去は別Issue（クリーンアップ）として切り出す。

理由:
- 残置に機能的害はない（read 経路で参照しなくなるだけ）。
- 列 DROP は SQLite で table 再構築を伴い得る。新規 migration + schema 変更 + entity API・mergeTags・DTO 連鎖の撤去まで波及し、バグ修正という本Issueスコープを大きく超える。
- `Tag.noteCount` フィールドは `toTagDTO` が射影に使うため、撤去すると DTO 形・表示側まで変更が連鎖する。`findByOwner` が集計値を `noteCount` に詰めて `Tag.reconstruct` する形なら、エンティティ契約は不変で済む。
- `mergeTags` の `incrementNoteCount` は OCC version も同時に進める。安易に削ると target タグの version 進行が変わり既存テストに波及しうる。
- Issue 本文も「撤去はスコープに含めるか別途判断、残置でも機能的害なし」と明記。

### Consequences
- 良い点: 変更が adapter 層（`findByOwner`）とテスト・spec に閉じ、リスクが小さい。既存データもマイグレーション無しで即座に正しく表示される。
- トレードオフ: 死蔵コード・列が残る。別Issueでのクリーンアップが必要。

---

## ADR-003: 件数を返す他の読み取り経路は集計化しない

### Status
Proposed

### Context
`tagRepository` には noteCount を返す経路が複数ある（`findById`/`findByIds`/`findByOwnerAndName`/`searchByNamePrefix`）。これらも read-time 集計に揃えるべきか判断する。

### Decision
`findByOwner` のみ集計化する。他経路は列値（多くは 0）のまま。

理由:
- `findById` はミューテーション系の OCC トークン取得用、`findByIds` は note 一覧のタグチップで `name` のみ使用、`searchByNamePrefix` はサジェスト。いずれも noteCount を**表示しない**。
- 全経路に JOIN+GROUP BY を広げると不要なコストと OCC ロジックへの影響が出る。
- `mergeTags` が `findById` 経由で取る target.noteCount を increment する点は ADR-002 の方針通り残置。

### Consequences
- 良い点: 変更範囲が最小。表示に影響する唯一の経路だけを直す。
- トレードオフ: `tagRepository` 内で経路ごとに noteCount の意味が異なる（集計値 / 列値）。表示に使わない経路に限るため実害なし。spec とテストで意図を明示する。

---

## ADR-004: 集計 JOIN を owner-scoped にする（notes.owner_id 制約を追加）

### Status
Proposed（レビュー round 1 の W-T002 で判明）

### Context
read-time 集計の `leftJoin(notes, ...)` 条件は当初 `notes.id = noteTags.noteId AND notes.status='active'` のみで `notes.owner_id` を制約していなかった。`note_tags` の FK は owner を見ないため、行レベルでは他 owner の note を自 owner の tag にリンクでき、その場合に件数へ混入する潜在ギャップがあった（テストで再現すると期待1に対し2が返る）。

実運用では、ノート保存系の書き込み経路がノートのタグを「そのノートの owner のスコープ」で解決・作成するため、他 owner note が自 tag にリンクされることはない（構造的不変条件）。したがって現実には発火しない。

### Decision
集計の notes JOIN 条件に `eq(notes.ownerId, ownerId)` を追加し、owner-scoped にする。正当な結果（同 owner note のみ）は一切変わらず、潜在ギャップを構造的に閉じる。1行の防御的制約で「件数は必ず当該 owner の note のみ」をクエリ上で自明にする。

### Consequences
- 良い点: owner 境界がクエリで明示され、書き込み経路の不変条件が崩れても件数に他 owner note が混入しない。CLAUDE.md の「illegal states を型/制約で表現」の方針に沿う。
- トレードオフ: なし（正当な結果は不変、コストも無視できる）。owner 分離テストを「他 owner note はカウントされない（=1）」に更新。

---
