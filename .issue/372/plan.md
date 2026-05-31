# 実装計画 — Issue #372: 【クリーンアップ】タグ note_count 死蔵コードの撤去（#365 のフォローアップ）

**Issue:** #372
**作成日:** 2026-05-31
**複雑度:** 中〜大規模

---

## 目的

#365（PR #371）でタグ利用件数を read-time 集計（`tagRepository.findByOwner` が `note_tags` × 当該 owner の active `notes` を都度 `COUNT`）へ移行した結果、死蔵となった `tags.note_count` 列・関連索引/制約・ドメインの `Tag.noteCount` API・`mergeTags` の increment 呼び出しを撤去し、spec の「死蔵」注記を「撤去済み」へ更新する。死蔵コードを残すと「increment の配線漏れ＝バグ」と再誤認されるリスクがあるため、ADR-002 の予告どおりクリーンアップする。

## スコープ

### 含まれるもの

- `tags.note_count` 列・`idx_tags_owner_note_count` 索引・`tags_note_count_nonneg` check 制約の撤去（schema.ts + 生成 migration）
- ドメインエンティティ `Tag.noteCount` フィールド・`incrementNoteCount` / `decrementNoteCount`・不変条件 `noteCount >= 0`・`TagErrorCode.NoteCountNegative` の撤去
- `mergeTags` の `incrementNoteCount` 呼び出し（および target タグの `tagRepository.save` 経路）の撤去
- `D1TagRepository` の `reconstruct`/`insert`/`save` から `noteCount` を除去、`findByOwner` の集計値射影を DTO の集計専用フィールドへ整理
- DTO（`toTagDTO` / `TagDTO`）の `noteCount` 射影を「集約フィールド由来」から「集計値由来」へ整理
- spec（domains/tag.md、database/index.md、usecases/{tag,note}.md）の死蔵注記を撤去済みの記述へ更新
- 関連テスト（tag entity unit/property、tag.integration、tagRepository.integration、errorCode naming は自動追従）の修正

### 含まれないもの

- read-time 集計クエリ自体のロジック変更（#365 で確定済み。`findByOwner` の JOIN/GROUP BY/owner-scope はそのまま）
- `findById` / `findByIds` / `findByOwnerAndName` / `searchByNamePrefix` の集計化（ADR-003 の方針どおり据え置き。これらは noteCount を表示しない）
- 独立 read-model（outbox 維持）への移行（Issue 末尾の将来検討事項）
- フロントエンド表示そのものの変更（`noteCount` を表示し続ける。DTO フィールド名は維持するため波及なし）

## 設計判断サマリー

詳細は `adr.md` 参照。

- **ADR-001（DTO 方式）**: `TagDTO.noteCount` フィールド名は**維持**する。`findByOwner` が集計値を `Tag` 経由ではなく直接 DTO/View に詰める形へ整理し、`Tag` エンティティから `noteCount` を除く。フロント表示（`FilterBar`/`TagManager`/`TagActions`）の契約を一切変えないことを優先。
- **ADR-002（OCC version）**: `mergeTags` から target の `incrementNoteCount`＋`save` を撤去する。target タグの version 進行は**不要**（merge は note 側の `note_tags` 張り替えで完結し、tag 行自体は target を変更しない）。撤去で version が進まなくなるが、これは正しい挙動。既存 integration テストは version をアサートしていないため波及なし。
- **ADR-003（Tag エンティティから集計値をどう外すか）**: `Tag` から `noteCount` を**完全撤去**し、集計値は adapter（`findByOwner`）→ usecase（`listTags`）→ DTO の経路でエンティティを経由せず流す。`reconstruct` から `noteCount` 引数・検証を除く。
- **ADR-004（migration 方式）**: `pnpm db:generate` で schema.ts との差分から migration を生成。SQLite の列 DROP は drizzle-kit が table 再構築 SQL を出すか `ALTER TABLE DROP COLUMN` を出すかを生成結果で確認し、索引/check の DROP も含め人手でレビューする。

---

## 実装ステップ

### 1. ドメインエンティティ `Tag` から noteCount を撤去

- **対象ファイル:** `app/core/domain/tag/entity.ts`
- **変更内容:**
  - `Tag` 型から `noteCount: number` を削除。
  - `ReconstructInput` から `noteCount` を削除。
  - `incrementNoteCount` / `decrementNoteCount` 関数と、`Tag` オブジェクトの公開メンバーを削除。
  - `create` の戻り値から `noteCount: 0` を削除。
  - `reconstruct` から `noteCount` のセットと `noteCount >= 0`/整数チェックを削除。
  - 先頭の JSDoc（`noteCount` は派生射影〜の段落）を削除。
- **理由:** 死蔵 API の本体撤去。read-time 集計化により noteCount はエンティティ契約から外れた。

### 2. `TagErrorCode.NoteCountNegative` の撤去

- **対象ファイル:** `app/core/domain/tag/errorCode.ts`
- **変更内容:** `NoteCountNegative: "tag_note_count_negative"` の行を削除。
- **理由:** decrement の不変条件が消えるため、対応するエラーコードも不要。`errorCodeNaming.test.ts` は残ったコードを走査する形なので自動追従（`TagErrorCode` モジュール自体は他コードで存続）。

### 3. `mergeTags` の increment 呼び出し撤去

- **対象ファイル:** `app/core/application/tag/mergeTags.ts`
- **変更内容:**
  - `targetAdded` のカウントと、`if (targetAdded > 0) { ... Tag.incrementNoteCount ... tagRepository.save(targetEntity, ...) }` ブロック（89–97 行付近）を削除。
  - 不要になった `import { Tag } from "@/core/domain/tag/entity";`、`hadTarget` 変数を削除（`hadTarget` は `targetAdded` 計算専用のため）。`mergeTagSets` のループ内の `hadTarget` 参照も削除。
  - コメント「Target noteCount sync: ...」を削除。
- **理由:** noteCount 列が消えるため increment は不要。**target タグの version 進行は merge の正当性に不要**（merge は note 側の張り替えで完結、tag 行は source を delete するのみ）。OCC は source の delete（`sourceFound.expectedVersion`）と各 note の save で引き続き担保される。

### 4. DTO の noteCount 射影を集計値ベースへ整理

- **対象ファイル:** `app/core/application/dto/tag.ts`
- **変更内容:**
  - `TagDTO.noteCount` フィールドは**維持**（フロント契約不変）。
  - `toTagDTO(tag: Tag)` は `Tag` から `noteCount` を読めなくなるため、シグネチャを `toTagDTO(tag: Tag, noteCount: number)` へ変更し、`noteCount` を引数から詰める。
  - JSDoc を追加し「noteCount は read-time 集計値であり、エンティティ由来ではない。`listTags` 経路のみ実集計値を渡し、`createTag`/`renameTag` 経路は表示に使われないため 0 を渡す」ことを明示。
- **理由:** `Tag` から noteCount が消えるため、集計値を DTO へ渡す経路を usecase 側で明示する。フィールド名維持で表示側は無変更。

### 5. `listTags` / `TagView` の経路で集計値を DTO へ受け渡す

- **対象ファイル:** `app/core/application/tag/view.ts`, `app/core/application/tag/listTags.ts`
- **変更内容:**
  - `findByOwner` の戻り値を「`Tag` と `noteCount` のペア」を運ぶ形に変える（ports 戻り型 `readonly { tag: Tag; noteCount: number }[]`、ステップ 6）。
  - `view.ts`: `toTagView = toTagDTO` のエイリアスは2引数になり、`createTag`/`renameTag` 側（単一 Tag を渡す）と `listTags` 側（ペアを渡す）で呼び方が割れる。エイリアスを `toTagView(tag: Tag, noteCount: number)` に統一し、各 usecase が `noteCount` を明示的に渡す方針とする。
  - `listTags`: `tagRepository.findByOwner(...)` の戻りペア配列を受け、`page.map((entry) => toTagView(entry.tag, entry.noteCount))` を返す。ページング（`limit + 1` / `slice` / cursor）はペア配列に対して行う。
- **理由:** 集計値をエンティティに詰め直さず、専用経路で DTO まで運ぶ（ADR-003）。

### 5b. `createTag` / `renameTag` の `toTagView` 呼び出しに noteCount を渡す

- **対象ファイル:** `app/core/application/tag/createTag.ts`, `app/core/application/tag/renameTag.ts`
- **変更内容:**
  - `createTag`: `toTagView(tag)` → `toTagView(created, 0)`。新規タグは note 0 件で正しい。
  - `renameTag`: `toTagView(result.tag)` → `toTagView(result.tag, 0)`。**根拠**: これら server function の戻り `tag.noteCount` はフロント（`actions.ts` / `CreateTagForm` / `TagActions`）で**読まれていない**（表示用件数は `listTags`/loader 経路から取得。grep で確認済み）。rename は件数を変えないが、表示に使われないため 0 詰めで実害なし。JSDoc/コメントでこの意図を明示する。
- **理由:** `toTagDTO` が `noteCount` 引数必須になるため、表示に使われない2経路は 0 を渡して契約を満たす（ADR-001 の方式1の帰結）。

### 6. ポート `TagRepository.findByOwner` の戻り型を集計値同梱へ変更

- **対象ファイル:** `app/core/domain/tag/ports/tagRepository.ts`
- **変更内容:**
  - `findByOwner` の戻り型を `Promise<readonly Tag[]>` から `Promise<readonly { tag: Tag; noteCount: number }[]>`（または専用型 `TagWithNoteCount`）へ変更。
  - JSDoc に「noteCount は read-time 集計値」と明記。
  - 他経路（`findById` 等）の戻り型は不変。
- **理由:** `Tag` から noteCount を外した結果、集計値を運ぶ口がポート契約上必要。表示する唯一の経路だけが集計値を返す（ADR-003 と整合）。

### 7. `D1TagRepository` の noteCount 依存を整理

- **対象ファイル:** `app/core/adapters/d1/repositories/tagRepository.ts`
- **変更内容:**
  - `toTag` の `Tag.reconstruct` 呼び出しから `noteCount: row.noteCount` を削除。
  - `insert` の `values` から `noteCount: tag.noteCount` を削除。
  - `save` の `set` から `noteCount: tag.noteCount` を削除。
  - `findByOwner`: 集計 `noteCountExpr` はそのまま使用しつつ、戻り値を `{ tag: this.toTag(rowWithoutNoteCount), noteCount: Number(row.noteCount) }` の配列に変更。`toTag` には noteCount を渡さない。`sort: "noteCount"` の orderBy は集計式のまま不変。
  - 130–141 行付近の「`tags.note_count` cache column を ignore する」JSDoc を、列が撤去された前提の記述へ更新。
- **理由:** 列撤去に伴う read/write の整合。集計クエリのロジック自体は #365 のまま維持。

### 8. schema.ts から列・索引・check を撤去

- **対象ファイル:** `app/core/adapters/d1/schema.ts`
- **変更内容:**
  - `tags` テーブルから `noteCount: integer("note_count").notNull().default(0)` を削除。
  - `index("idx_tags_owner_note_count")...` を削除。
  - `check("tags_note_count_nonneg", ...)` を削除。
  - `desc` import が他で未使用にならないか確認（他テーブルで使用中のため残る）。
- **理由:** 死蔵スキーマ要素の撤去。drizzle-kit の migration 生成元。

### 9. migration の生成と内容確認

- **対象ファイル:** `app/core/adapters/d1/migrations/00XX_drop_tags_note_count.sql`（生成）
- **変更内容:**
  - `pnpm db:generate` を実行し、schema.ts との差分から migration を生成。
  - 生成 SQL を確認:
    - 列 DROP が `ALTER TABLE tags DROP COLUMN note_count` になるか、table 再構築（`__new_tags` 作成 → コピー → swap）になるかを確認。
    - `DROP INDEX idx_tags_owner_note_count` が含まれるか確認（table 再構築方式の場合は再構築時に索引/check ごと再定義される）。
  - 既存 migration の DROP 例（`0005_drop_todos.sql`, `0009_...`）と整合する命名・コメント付与。生成 SQL が不十分なら手で `DROP INDEX IF EXISTS` を補う。
- **理由:** D1/SQLite では列 DROP が table 再構築を伴い得るため、生成結果を必ずレビューする（ADR-004）。テスト isolate も `readD1Migrations` でこの migration を適用するため、schema.ts と migration が一致していないと integration テストが落ちる。

### 10. テストの修正

- **対象ファイル:**
  - `app/core/domain/tag/__tests__/entity.test.ts`
  - `app/core/domain/tag/__tests__/entity.property.test.ts`
  - `app/core/application/tag/__tests__/tag.integration.test.ts`
  - `app/core/adapters/d1/__tests__/tagRepository.integration.test.ts`
- **変更内容:**
  - **entity.test.ts**: `describe("Tag.incrementNoteCount / decrementNoteCount")` ブロックを丸ごと削除。`Tag.create` の `noteCount 0` アサート、`rename` の `noteCount` 保持アサート、`reconstruct` の `noteCount` 関連ケース（負値/非整数/`validRow().noteCount`）を削除。
  - **entity.property.test.ts**: `describe("Tag.incrementNoteCount / decrementNoteCount (property)")` を削除。
  - **tag.integration.test.ts**: `seedTag` ヘルパーの `noteCount` 引数と `schema.tags` insert の `noteCount` を削除。
  - **tagRepository.integration.test.ts**: `seedTagRow` の `noteCount` 引数・`schema.tags` insert の `noteCount` を削除。`findByOwner` の戻り値形変更に追従（`tag.noteCount` → `entry.noteCount`）。「ignores the stored note_count column」テスト（307 行付近）は列が無くなるため、趣旨を「集計値を返す」へ整理 or 削除。`sort: "noteCount"` 系・owner-scope 系（read-time 集計の回帰）テストは戻り値形だけ追従して**残す**（#365 の回帰担保）。
  - 戻り値形変更（ステップ 5/6）に伴い、`listTags` を呼ぶ箇所の `result.tags[*].noteCount` アサートは DTO 経由のため不変。
- **理由:** 撤去対象 API を参照するテストの追従。read-time 集計の回帰テストは維持する。

### 11. spec の死蔵注記を撤去済みへ更新

- **対象ファイル:**
  - `spec/domains/tag.md`
  - `spec/database/index.md`
  - `spec/usecases/tag.md`
  - `spec/usecases/note.md`
- **変更内容:**
  - **domains/tag.md**: フィールド一覧から `noteCount`、振る舞いから `incrementNoteCount`/`decrementNoteCount`、不変条件 `noteCount >= 0` を削除。「noteCount の二層構造」注記を「表示件数は read-time 集計のみ。エンティティ/列は撤去済み（Issue #372）」へ書き換え。read-time 集計の真実源の記述（owner-scope, ADR-004 参照）は残す。
  - **database/index.md**: `tags` テーブル定義から `note_count` 行を削除、`idx_tags_owner_note_count` を索引一覧から削除、死蔵注記（306/310 行）を撤去済みの記述へ更新。
  - **usecases/tag.md**: mergeTags 手順 4 の「Target Tag の noteCount を increment（死蔵列...）」を「Source Tag を delete のみ（noteCount 列は撤去済み。表示件数は read-time 集計）」へ更新。
  - **usecases/note.md**: 「`tags.note_count` 列を更新する処理は配線していない」注記を「`tags.note_count` 列は撤去済み。表示件数は read-time 集計」へ更新。
- **理由:** spec を実装の現状（撤去済み）に同期。次に読む人の再誤認を防ぐ。

### 12. 型チェック・lint・テストの最終確認

- **コマンド:** `pnpm typecheck && ./node_modules/.bin/biome check --write app && pnpm test`
- **理由:** CLAUDE.md の事後手順。biome は MEMORY のとおり `./node_modules/.bin/biome` 直叩きで確認（rtk が `pnpm lint` を書き換えるため）。

---

## リスクと注意点

- **migration と schema.ts の不一致**: テスト isolate は `vitest.config.integration.ts` の `readD1Migrations` で migrations フォルダ全体を適用する。schema.ts だけ変えて migration を生成し忘れると、生成 SQL が無い ↔ schema が変わった状態で integration テストが落ちる。必ず `pnpm db:generate` で生成し、schema と一致させる。
- **SQLite 列 DROP の table 再構築**: drizzle-kit が `ALTER TABLE ... DROP COLUMN` か再構築 SQL のどちらを出すか生成結果で要確認。再構築方式の場合、FK/索引/check が正しく再定義されているか（特に `uniq_tags_owner_name_normalized` を取りこぼさないか）を目視レビューする。
- **OCC version の挙動変化**: mergeTags 後に target タグの version が進まなくなる。これは正しい（tag 行を変更しないため）が、もし「merge 後に target を編集する並行操作」で version をアサートしていた箇所があれば確認。既存 integration テストには該当なし（version をアサートするのは renameTag のみ）。
- **`findByOwner` 戻り型変更の波及**: `tagRepository.findByOwner` の呼び出しは `listTags` の1箇所のみ（grep 確認済み。`mergeTags` の `collectNotesWithTag` は `noteRepository.findByOwner` で別物）。追従先は限定的。
- **`toTagView`/`toTagDTO` の呼び出し3箇所**: `listTags`（ペア）・`createTag`（単一 Tag）・`renameTag`（単一 Tag）。2引数化に伴い3箇所すべてを追従する（ステップ 5/5b）。createTag/renameTag の戻り `noteCount` はフロント未読のため 0 詰めで安全（grep 確認済み）。
- **既存データ（staging/production）**: 列 DROP は既存行から note_count 値を捨てるだけ。read-time 集計が真実源なので表示に影響なし。migration 適用は `pnpm db:apply:staging` / `pnpm db:apply:production`。
- **`desc` import**: schema.ts の `idx_tags_owner_note_count` 削除で `desc` が未使用にならないか（他テーブルで使用中のため残るが lint で確認）。

## テスト方針

- 詳細は `testing.md` 参照。
- 自動テスト: `pnpm test`（unit + integration）。特に以下を確認:
  - tag entity unit/property から noteCount 系が消え、残テストが緑。
  - tagRepository.integration の read-time 集計回帰（sort/owner-scope/active-only）が戻り値形変更後も緑。
  - tag.integration の mergeTags が increment 撤去後も「source 削除・note_tags 張り替え」を満たす。
- 手動確認: `/notes`（FilterBar のタグ件数表示）と `/tags`（TagManager の「N 件のノート」）で件数が引き続き正しく表示されること（read-time 集計のため数字は不変のはず）。

---

## レビュー履歴

### 1周目（自己レビュー: 要件カバレッジ / アーキ・リスク 2視点）

**修正した点**:
- **[P-001]** `toTagView`/`toTagDTO` の呼び出しが `listTags` 以外に `createTag`/`renameTag` の2箇所にもあることを見落としていた。2引数化に伴い両経路の追従が必要。→ ステップ 5b を新設し、両経路が表示に使われない 0 を渡す方針を明記。フロントが当該 `noteCount` を読んでいないことを grep で確認し ADR-001 補足に記録。
- **[P-002]** `findByOwner` 戻り型変更の波及範囲が曖昧だった。→ grep で「tag 側 `findByOwner` の呼び出しは `listTags` 1箇所のみ」を確定し、リスク欄を更新。

**確認した点（問題なし）**:
- OCC version: mergeTags の target version を進める箇所は increment＋save のみ。既存テストは merge 後 target version をアサートしておらず（renameTag のみ version アサート）、撤去で安全（ADR-002）。
- migration ↔ schema.ts 整合: テスト isolate が `readD1Migrations` で migrations フォルダを適用するため、`db:generate` 必須。リスク欄に明記済み。
- `TagErrorCode` モジュールは他コードで存続するため `errorCodeNaming.test.ts` は自動追従（`NoteCountNegative` の除去のみ）。
- read-time 集計回帰テスト（sort/owner-scope/active-only）は戻り値形だけ追従して維持する方針を明記済み。

**見送り**: なし。
