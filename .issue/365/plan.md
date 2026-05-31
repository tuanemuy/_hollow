# 実装計画 — Issue #365: 【バグ】タグ利用件数が常に0件になる: note_count を read-time 集計へ

**Issue:** #365
**作成日:** 2026-05-31
**複雑度:** 中〜大規模

---

## 目的

FilterBar のタグファセット・タグ管理画面で、タグの利用件数がすべて「0 件」と表示されるバグを解消する。根本原因は `tags.note_count` 非正規化キャッシュ列の更新 API（`Tag.incrementNoteCount`/`decrementNoteCount`）がノート保存系 usecase に配線されておらず、ほぼ全タグが初期値 0 のまま固定されていること。真実源を `note_tags` に一本化し、件数を read-time 集計（都度算出）に変えることで構造的に解消する。

## スコープ

### 含まれるもの

- `tagRepository.findByOwner` を `note_tags` × active `notes` の LEFT JOIN + GROUP BY COUNT による read-time 集計に変更
- `noteCount` ソート（`ORDER BY COUNT(...)`）が機能することの確認・テスト
- 件数セマンティクスを active（非 trashed）ノート基準に統一
- 集計を検証する integration test の追加
- `spec/domains/tag.md` の記述を read-time 集計方式に更新

### 含まれないもの

- `note_count` 列・`idx_tags_owner_note_count` 索引・`tags_note_count_nonneg` check の撤去（残置。撤去は別Issue=クリーンアップとして切り出し推奨）
- ドメインエンティティ `Tag.noteCount` フィールド・`incrementNoteCount`/`decrementNoteCount` API の撤去（DTO 射影の都合で残置）
- `mergeTags` の `note_count` 更新ロジックの撤去（OCC version 進行と絡むため残置）
- `findById`/`findByIds`/`findByOwnerAndName`/`searchByNamePrefix` の集計化（noteCount を表示しない経路のため対象外）

## 実装ステップ

### 1. `findByOwner` を read-time 集計に書き換える

- **対象ファイル:** `app/core/adapters/d1/repositories/tagRepository.ts`
- **変更内容:**
  - `select()` ワイルドカードをやめ、`tags` の各列を明示列挙し、`noteCount` を集計式 `COUNT(notes.id)` で埋める（`toTag` が期待する `TagRow` 形を維持）。
  - `leftJoin(noteTags, eq(noteTags.tagId, tags.id))` → `leftJoin(notes, and(eq(notes.id, noteTags.noteId), eq(notes.status, 'active')))` → `groupBy(tags.id)`。
  - `COUNT(notes.id)` を使う（`COUNT(*)` は NULL 行も数えるため不可）。active note にマッチした行のみ数え、タグ未使用・全 trashed は 0。集計式は `noteCount` というエイリアスで select に置き、`orderBy` からはエイリアス参照で式の二重管理を避ける。
  - **集計値の coerce（重要）:** D1 ドライバは集計値を `number` ではなく `string` で返すことがある（`ingestionJobRepository.sumByteSizeByOwnerSince` が同じ理由で明示 coerce している前例あり）。`sql<number>` の型注釈はコンパイル時の嘘で runtime 保証がない。`toTag` → `Tag.reconstruct` は `noteCount >= 0` を検証するため、文字列が渡ると rehydration 失敗 → `SystemError(DataIntegrityError)` でタグ一覧が丸ごと 500 になる。`toTag` に渡す前に `Number(row.noteCount)` で必ず数値化する。
  - `where` の owner + LIKE ロジックは維持。
  - `orderBy`: `sortKey === 'noteCount'` のとき集計式（エイリアス `noteCount`）で並べ替え。name/createdAt は従来通り。tie-break `asc(tags.id)` は必ず維持。
  - `limit`/`offset`（`listTags` の `limit+1` 戦略）は GROUP BY 後に適用され挙動不変。テストで担保。
  - **groupBy 初使用の事前確認:** コードベースに `.groupBy(` の使用実績がゼロ（noteRepository は subquery を避けて JS 二段組で実装している先例あり）。実装着手時に最小再現クエリで `leftJoin + groupBy + orderBy + limit/offset` が D1+drizzle で期待通り動くことを先に確認する。
- **理由:** 件数の真実源を `note_tags` × active notes に一本化し、配線漏れ・ドリフト・アンダーフローを構造的に排除。Issue 必須要件。

### 2. `note_count` 列・`idx_tags_owner_note_count` 索引・check の扱い

- **対象ファイル:** なし（残置）
- **変更内容:** 撤去しない。
- **理由:** 残置でも機能的害なし。撤去は migration 追加・schema 変更・entity API/mergeTags/DTO 連鎖の撤去まで波及し、バグ修正という本Issueスコープを超える。詳細は ADR-002。

### 3. `mergeTags` の note_count 更新ロジックの扱い

- **対象ファイル:** `app/core/application/tag/mergeTags.ts`（残置）
- **変更内容:** 機能的に残置で問題なし。
- **理由:** `incrementNoteCount` は OCC version も同時に進めるため、削ると target タグの version 進行が変わり既存テストに波及しうる。撤去はリスク・スコープから見送る。詳細は ADR-002。

### 4. spec の更新

- **対象ファイル:** `spec/domains/tag.md`
- **変更内容:** 「派生値だが整合のため保持（イベント駆動で更新）」の記述を、read-time 集計（`note_tags` × active notes を都度集計、列は死蔵で残置）である旨に修正。エンティティ契約としての `noteCount` フィールド・`incrementNoteCount`/`decrementNoteCount`・不変条件 `noteCount >= 0` は残るが、**表示件数の真実源は read-time 集計**という二層構造を明記し、死蔵理由（DTO 射影・mergeTags の OCC version 進行）も1行添える（次に読む人が「increment 配線漏れ＝バグ」と再誤認しないように）。#357 に方式比較の経緯がある旨を参照。
- **理由:** CLAUDE.md は「spec が正」。実装と spec の乖離を残さない。

### 5. integration test の追加

- **対象ファイル:** `app/core/adapters/d1/__tests__/tagRepository.integration.test.ts`
- **変更内容:** `describe("D1TagRepository.findByOwner — read-time noteCount (Issue #365)")` を追加。`seedDirectory`/`seedNote(status)`/`linkNoteTag` ヘルパを `noteRepository.integration.test.ts` のパターンに倣って追加し、DB 直接シードで状態を作り `findByOwner` の `noteCount` をアサート。
  - **directory FK 依存（必須）:** `notes.directoryId` は `directories(id) ON DELETE restrict` の NOT NULL FK。note をシードするには先に `seedDirectory` が必要。既存の `tagRepository.integration.test.ts` には directory シードヘルパが無いため、`noteRepository.integration.test.ts` の `seedDirectory`/`seedNote`（directoryId を引数で受ける）シグネチャを正確に移植する。note-tag リンクは移植元の `tagNote(container, noteId, tagId)` を `linkNoteTag` として移植（grep で見つけやすいよう移植元名を意識）。
  - アサートは数値比較（`toBe(2)` 等）で行い、P-001 の coerce（文字列で返っても number として扱われる）も暗黙にカバーする。
- **理由:** Issue 必須要件。集計の正しさ・active フィルタ・ソートを回帰防止で固定する。

## 設計判断

- **件数セマンティクス（active 基準）:** `notes.status = 'active'` で絞る。FilterBar のフィルタ結果と件数を一致させ、「N件表示なのにフィルタ結果0件」のズレを防ぐ。詳細は ADR-001。
- **`note_count` 列・索引・entity API の残置:** 撤去は本Issueスコープを超えるため残置し、別Issueに切り出す。詳細は ADR-002。
- **他の読み取り経路は集計化しない:** noteCount を表示しない経路（OCC トークン取得・名前のみ使用・サジェスト）には不要な JOIN コストを持ち込まない。詳細は ADR-003。

## リスクと注意点

- **GROUP BY と列選択:** ワイルドカードから集計 select に変える際、`tags` の全列を明示しないと `toTag` が期待する `TagRow` 形が崩れる（`version`/`createdAt` 等の欠落で rehydration が壊れる）。列名・型を `$inferSelect` に合わせる。
- **COUNT のエッジケース:** `COUNT(notes.id)` を使う。`COUNT(*)` は LEFT JOIN の NULL 行も1と数えてしまう。同一 (note,tag) は note_tags 複合PK で重複しないため `DISTINCT` は不要だが、安全側で `COUNT(DISTINCT notes.id)` も可。
- **ソート安定性:** `ORDER BY COUNT(...)` は同数で順不同になるため `asc(tags.id)` の tie-break を必ず維持。
- **`limit + 1` 戦略:** `listTags` は `limit+1` 取得で `hasMore` 判定する。GROUP BY 後の行数に limit が効くので挙動不変。テストでカバー。
- **パフォーマンス/N+1:** 単一クエリの JOIN+GROUP BY で N+1 なし。個人領域・タグ数百規模で `idx_note_tags_tag_id` が効き許容範囲。
- **既存テスト:** `searchByNamePrefix`/`findByIds`/LIKE-ESCAPE 回帰は noteCount をアサートしないため影響なし。mergeTags 系テストが target.noteCount をアサートしていれば increment 残置なら不変（grep で確認）。
- **D1 集計値の型:** `COUNT()` は `number` または `string` で返りうる。必ず `Number()` で coerce してから `Tag.reconstruct` に渡す（P-001）。
- **groupBy 初使用:** コードベースに前例がないため、最小再現クエリで挙動を先に確認する（S-001）。
- **検証コマンド:** `pnpm typecheck && pnpm lint:fix && pnpm format`、`pnpm test:integration`。

## レビュー履歴

### 1周目
**修正した点（P）**:
- P-001（D1 集計値の型 coerce）: Step 1 に「`Number(row.noteCount)` で必ず数値化。`sql<number>` の型注釈は runtime 保証がなく、文字列が渡ると `Tag.reconstruct` の `noteCount >= 0` 検証で落ちて一覧が 500 になる」を追記。リスク欄にも明記。
- P-002（テストの directory FK 依存）: Step 5 に「`seedDirectory` も `noteRepository.integration.test.ts` から移植。note シードには directory が先に必要」を明記。

**取り込んだ改善提案（S）**:
- S-001（groupBy 初使用の事前確認）: Step 1 とリスク欄に最小再現クエリでの確認を追記。
- S-002（orderBy と select の集計式一致）: 集計式を `noteCount` エイリアスに揃え、orderBy からはエイリアス参照する方針を Step 1 に反映。
- S-003（spec の二層構造明記）: Step 4 にエンティティ契約は残るが表示の真実源は read-time 集計という二層構造・死蔵理由の明記を追加。
- S-002（要件レビュー側、Issue 観点とテストケースの対応明記）: テスト方針末尾に Issue の操作ベース観点とケース番号の対応を追記。

**見送った提案とその理由**:
- なし（全提案がスコープ内で妥当だったため反映）。

### 2周目
**両視点とも問題点ゼロで終了。** 計画が要件・アーキ両面で問題なしと判断された。

**軽微な提案の反映**:
- 移植元ヘルパ名 `tagNote` を `linkNoteTag` として移植する旨を Step 5 に明記（実装者が grep で移植元を辿れるように）。
- 死蔵列・索引のクリーンアップは本対応のフォローアップとして Phase 4 で別Issue起票を検討する（ADR-002 のトレードオフが宙に浮かないように）。

## テスト方針

`tagRepository.integration.test.ts` に新 `describe` を追加。DB 直接シードで状態を作り `findByOwner` の `noteCount` をアサート（usecase 全実行ではなく集計ロジックの単体検証に集中）。

ケース:
1. **基本集計:** active note 2件に tagA、1件に tagB を link → tagA=2, tagB=1。
2. **タグ未使用 = 0:** note_tags 行のないタグ → 0。
3. **列ドリフト無視:** `note_count: 99` を仕込み active note 1件 link → `findByOwner` は **1**（列を無視し集計値）。本バグの本質的回帰。
4. **active 基準（trash で減）:** tagA に active 1件 + trashed 1件 → tagA=1。
5. **purge で減:** link した note を物理削除（cascade で note_tags も消える）→ 0。
6. **ソート:** tagA=2, tagB=1, tagC=0 で `sort:"noteCount"` の desc/asc を検証。tie 時に `tags.id` 昇順で安定することも1ケース。
7. **owner 分離:** 他 owner の note×tag が混入カウントされないこと。

restore/差し替え/作成は「最終的な note_tags × active notes の状態」に帰着するため状態ベース検証でカバーされる（Issue 観点の「ノート作成で +1」「差し替えで増減」はケース1の基本集計、「trash で減」「restore で増」はケース4の active/trashed 混在、「purge で減」はケース5 に対応）。
