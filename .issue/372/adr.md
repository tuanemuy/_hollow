# ADR — Issue #372: タグ note_count 死蔵コードの撤去

## ADR-001: DTO の noteCount フィールド名は維持し、集計値を引数で詰める

### Status
Proposed

### Context
`Tag` エンティティから `noteCount` を撤去すると、`toTagDTO` が射影に使えなくなる。選択肢は2つ:
1. `TagDTO.noteCount` フィールド名を維持し、`findByOwner` の集計値を `toTagDTO(tag, noteCount)` で詰める。
2. DTO を集計専用フィールド（例 `aggregatedNoteCount`）へリネームする。

フロント（`FilterBar` / `TagManager` / `TagActions` / `note/loaders.ts`）は `noteCount` フィールド名で件数を表示している。

### Decision
方式1を採る。`TagDTO.noteCount` のフィールド名は維持し、`toTagDTO` のシグネチャを `(tag: Tag, noteCount: number)` に変更して集計値を引数から受け取る。

理由:
- フロント表示の契約（フィールド名 `noteCount`）を一切変えずに済み、波及を adapter→usecase→DTO の経路に閉じられる。
- 「集計値であること」は JSDoc とポート戻り型（`{ tag; noteCount }`）で明示できるため、フィールド名を変えなくても誤認は防げる。

補足: `toTagView`(=`toTagDTO`) は `listTags` のほか `createTag` / `renameTag` でも呼ばれる。これら2経路の戻り `tag.noteCount` はフロント（`actions.ts` / `CreateTagForm` / `TagActions`）で読まれておらず、表示用件数は `listTags`/loader 経路から取得される（grep 確認済み）。したがって `createTag` は新規タグの 0、`renameTag` は表示に使われない 0 を渡す。実集計値を運ぶのは `listTags` 経路のみ。

### Consequences
- 良い点: フロント無変更。変更が backend に閉じる。
- トレードオフ: `noteCount` という名前が「列値か集計値か」を名前単独では示さない。JSDoc で補う。`createTag`/`renameTag` が 0 を渡すのは「表示に使われない経路」という前提に依存するため、コメントで明示する。

---

## ADR-002: mergeTags から increment＋save を撤去し、target タグの version は進めない

### Status
Proposed

### Context
現行 `mergeTags` は target が新規にタグを獲得した note 数だけ `Tag.incrementNoteCount` を呼び、`tagRepository.save(targetEntity, expectedVersion)` で永続化する。この save は note_count 列を更新すると同時に target タグの OCC version を進める副作用を持つ。note_count 列を撤去すると increment の意味が消える。target の version 進行を別手段で維持すべきか判断が必要。

### Decision
increment＋save を撤去し、target タグの version は進めない。

理由:
- merge の本質的な書き込みは「note 側の `note_tags` 張り替え（各 note の save で OCC 担保）」と「source タグの delete（`sourceFound.expectedVersion` で OCC 担保）」である。target タグ行自体は内容を変更しない。
- したがって target の version を進める正当な理由がない。version は「その集約の状態が変わったこと」を表すトークンであり、変わっていない target を進めるのは本来ノイズだった（note_count 更新という死蔵処理の副作用にすぎない）。
- 既存 integration テストは merge 後の target version をアサートしていない（version をアサートするのは renameTag のみ）。

### Consequences
- 良い点: 死蔵処理を消すと同時に、変更されない集約の version を不必要に進めるノイズも消える。`Tag` への依存も `mergeTags` から消える。
- トレードオフ: merge 後に target を読む並行操作の OCC トークンが（以前は進んでいたのに）進まなくなる。ただし target の状態は変わっていないため、トークンが据え置かれるのが正しい。

---

## ADR-003: Tag エンティティから noteCount を完全撤去し、集計値はエンティティを経由せず運ぶ

### Status
Proposed

### Context
noteCount を「集計専用フィールドとしてエンティティに残す」案もあり得るが、それでは `reconstruct` が集計値を要求し続け、列値と集計値の二重性が残る。

### Decision
`Tag` から `noteCount` を完全に撤去する。`reconstruct` も `noteCount` 引数・検証を持たない。read-time 集計値は `findByOwner` の戻り型 `{ tag: Tag; noteCount: number }` で運び、`listTags` → `toTagDTO(tag, noteCount)` の経路でエンティティを経由せず DTO まで流す。

理由:
- エンティティは「永続化された tag 集約」を表すべきで、read-time に計算される表示用集計値はその責務ではない。
- 集計値を運ぶ唯一の経路（`findByOwner`）だけがペアを返し、他経路（`findById` 等）は `Tag` を返したまま。ADR-003（#365）の「表示する唯一の経路だけが集計を持つ」方針と一貫する。

### Consequences
- 良い点: エンティティ契約がクリーンになり、列値/集計値の二重性が消える。
- トレードオフ: `findByOwner` の戻り型が他の `find*` と非対称（ペアを返す）。表示用途の特殊性として JSDoc で明示する。

---

## ADR-004: migration は db:generate で生成し、生成 SQL を必ずレビューする

### Status
Proposed

### Context
SQLite/D1 の列 DROP は `ALTER TABLE DROP COLUMN`（新しめの SQLite で可）か table 再構築（`__new_tags` 作成 → コピー → swap）のいずれかになる。drizzle-kit がどちらを出すかは生成してみないと確定しない。索引 `idx_tags_owner_note_count` と check `tags_note_count_nonneg` の DROP も含める必要がある。

### Decision
`pnpm db:generate` で schema.ts との差分から migration を生成し、生成 SQL を目視レビューする。table 再構築方式なら FK/索引/check が正しく再定義されているか（特に `uniq_tags_owner_name_normalized` を取りこぼさないか）を確認し、`ALTER ... DROP COLUMN` 方式なら索引 DROP が別途含まれるかを確認する。不足があれば既存の DROP migration（`0005`/`0009`）に倣って手で補う。

理由:
- migration application は wrangler 経由（drizzle.config.ts のコメントどおり）。生成は drizzle-kit、適用は wrangler の二段構え。
- テスト isolate も `readD1Migrations` で migrations フォルダを適用するため、schema.ts と migration の一致が integration テストの前提。

### Consequences
- 良い点: schema.ts と migration が単一の生成元から一致する。テストも本番も同じ migration を適用。
- トレードオフ: 生成 SQL のレビュー工数。table 再構築方式だと migration が長くなる。

---

## ADR-005: migration は drizzle-kit ではなく既存の手書き慣習に倣って手で作成する

### Status
Accepted（実装時に確定）

### Context
ADR-004 は `pnpm db:generate` で差分 migration を生成する前提だった。しかし実際に実行すると、このリポジトリの `migrations/` は手書きの連番 SQL（0000–0012）で構成され、drizzle-kit のジャーナル（`meta/_journal.json` / スナップショット）が存在しない。そのため `drizzle-kit generate` は差分ではなく**全スキーマのフルダンプ**（`0000_bright_professor_monster.sql`＋`meta/`）を生成し、既存の連番体系と衝突する。テスト isolate（`readD1Migrations`）は `migrations/` 全 SQL を順に適用するため、フルダンプを混入させると破綻する。

### Decision
drizzle-kit が生成したフルダンプと `meta/` は破棄し、既存の DROP migration（`0005_drop_todos.sql` / `0009_drop_legacy_instance_settings.sql`）の手書き慣習に倣って `0013_drop_tags_note_count.sql` を手で作成する。

列 DROP 方式は **table 再構築**を選択した。理由: `note_count` は table-level CHECK（`tags_note_count_nonneg`）から参照されており、SQLite には `DROP CONSTRAINT` がなく `ALTER TABLE ... DROP COLUMN` も CHECK 参照列を拒否するため、`DROP COLUMN` 単独では落とせない。`__new_tags` を `note_count`／索引／check 抜きで作成 → コピー → `DROP TABLE tags` → `RENAME` → `uniq_tags_owner_name_normalized` 再作成、という 12-step 手順を踏む。`note_tags` の `tags(id)` への FK は `PRAGMA defer_foreign_keys = ON`（トランザクション安全。`foreign_keys` のトグルと違い migration の暗黙トランザクション内で使える）で commit まで遅延させ、再構築後の `tags` が参照を満たすようにした。

### Consequences
- 良い点: 既存 migration 体系（手書き連番）と一貫。テスト（miniflare D1, 509 integration green）で再構築 SQL が FK 込みで正しく適用されることを確認済み。
- トレードオフ: schema.ts と migration の一致は drizzle-kit ではなく手作業のレビューに依存する（このリポジトリの既存慣習どおり）。`note_tags` の FK 遅延に `PRAGMA defer_foreign_keys` を使う点は、将来同種の table 再構築 migration を書く際の参考になる。
