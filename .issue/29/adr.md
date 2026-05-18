# ADR — Issue #29: search 経路への visibility 入力伝達 + projection 実値化

## ADR-001: search 結果の `visibility` は `search_documents.visibility` から取得する（`publication_states` JOIN は採用しない）

### Status
Proposed

### Context
Issue 説明文では「search 結果の `NoteListItemDTO.visibility` を `publication_states` join で実値化」と書かれているが、実装上は次の事実がある:

- `search_documents` テーブルには `visibility text NOT NULL` カラムが既に存在し、CHECK 制約と `idx_sd_visibility_owner` index も貼られている (`app/core/adapters/d1/schema.ts:590, 600-608`)
- `D1SearchIndex.toRow` (`searchIndex.ts:221`) は `doc.visibility` を `search_documents.visibility` に書き込み、ON CONFLICT でも更新する
- `handlePublicationChangedEvent.ts` が publication visibility 変更時に upsert IndexJob を enqueue し、`ConsumeIndexJob` 経由で index が再書き込みされる

選択肢:
- **A**: SELECT 句に `sd.visibility` を追加して `SearchHit` に載せる（既存列利用）
- **B**: `publication_states` を `LEFT JOIN` し、`COALESCE(ps.visibility, 'private')` で取得（Issue 説明文の方針）

### Decision
A を採用。`publication_states` の JOIN は行わない。

### Consequences
- 良い点:
  - クエリプランが既存のまま（追加 JOIN なし）
  - search index を「派生プロジェクション」として扱う既存アーキテクチャと整合（adapter ヘッダコメント参照）
  - 同じ情報を別ソースから引く重複が発生しない
- トレードオフ:
  - publication visibility 変更直後の search 結果は IndexJob 消費完了までは旧値を返す（at-least-once、結果整合）。ただしこれは search index の本質的性質であり、`title` / `tagNames` も同じラグを持つため、`visibility` だけ整合性レベルを上げる意味はない
  - Issue 説明文の表現とは異なる実装になるため、本 ADR で明示的に判断根拠を記録する必要がある

---

## ADR-002: `searchOwnNotes` の `visibility` 入力は `readonly PublicationVisibility[]` で受ける

### Status
Proposed

### Context
URL の `?visibility=...` schema は単一値 enum (`"private" | "unlisted" | "public"`) だが、`searchOwnNotes` の input 型をどうするか:

- **A**: 単一値 `PublicationVisibility` で受ける
- **B**: 配列 `readonly PublicationVisibility[]` で受け、loader 側で `[singleVisibility]` に変換

filter 経路 (`listNotesByOwner`) は Issue #8 ADR-001 で B を採用済み。

### Decision
B を採用。loader 側 (`loaders.ts`) で配列化し、`searchOwnNotes` の port は配列で受ける。

`undefined` / 省略 = フィルタなし（usecase 内で `["private","unlisted","public"]` にデフォルト展開）。
配列を渡したとき、その配列をそのまま `SearchQuery.visibilityFilter` に流す（`length === 0` 含む）。

### 空配列 `[]` セマンティクスの注記
Issue #8 ADR-002 では「`[]` = いずれにも該当しない = マッチなし」と規定されているが、D1 SearchIndex (`searchIndex.ts:124`) は現状 `q.visibilityFilter.length > 0` のときだけ WHERE 句を追加するため、`[]` を渡すと「フィルタなし = 全件」になる。本 Issue では URL から `[]` は届かないため対応せず、本挙動を据え置く。将来 multi-select UI が入って `[]` が現実的に届く可能性が出たタイミングで、adapter 側に `length === 0` ガード（`1 = 0` を入れて空結果を返す）を追加してセマンティクスを揃える。

### Consequences
- 良い点:
  - filter 経路と port 形が完全に揃い、`loaders.ts` で同じ配列化処理を共通化できる
  - 将来 multi-select UI に拡張するとき usecase / adapter の破壊変更が不要
- トレードオフ:
  - 現時点では常に長さ 1 の配列を渡す軽い冗長性。境界 1 箇所のみのコストで割に合う
  - 空配列セマンティクスが Issue #8 ADR-002 と一時的に乖離するが、URL から到達不能なため実害なし

---

## ADR-003: 本 Issue は `visibility` 単体の解消にスコープを限定する（`updatedAt` / `directoryId` / `slug` は対象外）

### Status
Proposed

### Context
`.issue/1/adr.md` ADR-012 では search 経路の `OwnedNotesResult` で以下 4 つがプレースホルダで埋められている:

- `visibility = "private"` ← **本 Issue で解消**
- `directoryId = ""`
- `slug = ""`
- `updatedAt = new Date(0)`

`directoryId` / `slug` / `updatedAt` を実値化するには `NoteRepository.findByIds` を search 結果に対して二次クエリで実行する必要があり、設計判断のスコープが広がる（cursor pagination との整合、N+1 対策、ADR-014 の `CalendarView` フォールバック撤廃判断）。

### Decision
本 Issue は `visibility` 単体の解消に限定する。残り 3 プレースホルダと ADR-013 / ADR-014 の解消は別 Issue で対応する。

### フォロー Issue 起票
本 Issue クローズ時に、フォロー Issue として以下を起票する:

- **タイトル A**: 「search 経路 (searchOwnNotes) の `updatedAt` / `directoryId` / `slug` projection 実値化 + ADR-013/014 解消」
  - スコープ:
    - `NoteRepository.findByIds` (または相当の port) で search hit の `noteId` 群を二次クエリし、`updatedAt` / `directoryId` / `slug` を実値で埋める
    - `NoteList.showVisibilityBadge` の `mode === "filter"` ガード撤廃（ADR-013 / 本 Issue ADR-004 解消）
    - `CalendarView` の `mode === "search"` フォールバック撤廃（ADR-014 解消）

- **タイトル B**: 「D1 SearchIndex の integration test ハーネス整備」
  - 動機: ADR-005 で発覚した pre-existing FTS join バグ (`sd.note_id = fts.rowid`) は fake `SearchIndex` を使う unit テストでは検出できない。本 Issue の review-001 W-002 で指摘された通り、SQL 層のリグレッション防止には integration test が必要
  - スコープ:
    - 既存に存在しない D1 adapter integration test の新規ハーネス整備（vitest config / fixture / migration セットアップ）
    - `D1SearchIndex.upsert → query` の往復で `visibility` フィルタが effective に動くこと、`Visibility.create` のエラー変換、FTS join が正しい行を返すこと等を担保する smoke レベルの test を追加
  - 規模: 数時間以上（ハーネス整備込み）のため本 Issue とは独立

### Consequences
- 良い点:
  - PR が `visibility` という単一概念に閉じ、レビューが容易
  - ADR-014 (`CalendarView` フォールバック) は触らないため、本 Issue でカレンダー表示の挙動変化が発生しない
  - フォロー Issue の起票方針を明記することで「visibility だけ実値化されたが残りは数ヶ月放置」の技術債リスクを抑える
- トレードオフ:
  - `visibility` 実値は data layer に届くが UI バッジとしては露出しない（ADR-004 により本 Issue では `showVisibilityBadge` を撤廃しないため）。フォロー Issue 完了まで「データは正しいが見えない」状態が続く
  - `CalendarView` の `mode === "search"` フォールバック分岐は残ったまま

---

## ADR-004: `NoteList.showVisibilityBadge = mode === "filter"` ガードの撤廃は本 Issue では行わない

### Status
Proposed

### Context
本 Issue で `OwnedNotesResult.notes[].visibility` が実値化されるため、`.issue/1/adr.md` ADR-013 で導入された `showVisibilityBadge = mode === "filter"` ガードは技術的には撤廃可能になる。撤廃すべきかを検討。

`ListView.tsx` (L60-85) のレイアウト:
```tsx
<div className="note-meta">
  {tagNames}
  · {showVisibilityBadge ? <span>公開</span> · : null}
  <span>{formatDate(note.updatedAt)}</span>
</div>
<div className="note-date">{formatDate(note.updatedAt)}</div>
```

`updatedAt` は ADR-003 で本 Issue のスコープ外。search 経路では `new Date(0).toISOString()` = `"1970-01-01T00:00:00.000Z"` のまま残るため、バッジ表示を撤廃ガードすると `ListView` で次のような表示が発生する:

> #tag · 公開 · 1970年1月1日

### Decision
本 Issue では `NoteList.showVisibilityBadge` ガードを撤廃しない（無変更）。撤廃は `updatedAt` 実値化と同じフォロー Issue（→ ADR-003）でまとめて行う。

`mode` 値そのものは `CalendarView` の search 経路フォールバック（ADR-014）に必要なため、`NoteList` で引き続き計算・参照される。`mode === "filter"` 分岐自体は撤廃しない。

### Consequences
- 良い点:
  - UX 破綻（「公開 · 1970年1月1日」表示）を回避
  - data layer の修正と UI 表示変更を疎結合に保ち、Issue 単位で挙動変化を線形に追跡可能
  - フォロー Issue で `updatedAt` 実値化と同時にバッジ表示も切り替えれば、ユーザー体験として「search でも完全に同等の表示になった」という単一のリリースイベントになる
- トレードオフ:
  - 本 Issue 完了時点で「visibility 実値が DTO まで届くが UI には出ない」死コード相当の状態が一時的に発生する。フォロー Issue 完了まで継続するが、ADR で明示しているため将来の読み手が混乱しない

---

## ADR-005: pre-existing FTS join バグの修正を本 Issue で実施

### Status
Accepted

### Context
Issue #29 のブラウザ検証（`.issue/29/.manual-test/`）で、`searchOwnNotes` 経由のあらゆる検索クエリが 0 件を返す pre-existing バグを発見した。

`app/core/adapters/d1/searchIndex.ts:120` の FTS join 条件:

```ts
const filterClauses = [sql`sd.note_id = fts.rowid`];
```

`search_documents.note_id` は **text**（UUID）、`search_documents_fts.rowid` は **integer**（migration `0001_hollow_schema.sql:383` で `content='search_documents', content_rowid='rowid'` と定義された SQLite 暗黙 rowid）。型不一致のため JOIN は常に空集合になり、search 結果が全件 0 になる。

これは Issue #29 の変更によって生じたものではない pre-existing バグだが、Issue #29 の意図「search 経路で visibility を effective にする」はこのバグが直らない限り E2E で検証不能。unit テストは fake `SearchIndex` を使うため検出されなかった。

選択肢:
- **A**: Issue #29 の PR 内で 1 行修正
- **B**: 別 Issue として切り出し、Issue #29 は unit テストの保証のみで close

### Decision
A を採用。同じファイル (`searchIndex.ts`) ・同じ動線（search 経路）で気づいた問題は、issue-implement スキル原則「Issue の意図を満たすために必要、別ドメインへの波及なし」に従いその場で修正する。

修正内容:

```ts
const filterClauses = [sql`sd.rowid = fts.rowid`];
```

修正後、`?q=Project&visibility=public/unlisted/private` の各組み合わせで期待件数が出ることをブラウザ検証で確認した（`.issue/29/.manual-test/results/summary.md` 参照）。

### Consequences
- 良い点:
  - Issue #29 の動作が E2E で検証可能になる
  - 修正は 1 行で副作用が小さい
  - PR レビューで Issue #29 の意図が満たされているか確認可能
- トレードオフ:
  - 本 PR が「visibility 伝達 + projection 実値化 + FTS join バグ修正」の 3 概念を含む
  - PR description で明示的に分離して説明する必要がある
  - fake `SearchIndex` を使った unit テストでは検出できない問題のため、将来的に D1 SearchIndex の integration test 追加を別 Issue として推奨（ADR-003 のフォロー Issue に追記候補）

---

## ADR-006: CJK FTS トークナイズ問題は別 Issue として切り出す

### Status
Accepted

### Context
ADR-005 の FTS join 修正後の検証で、SQLite FTS5 のデフォルト `unicode61` トークナイザが連続する CJK 文字を単一トークン化する制約を確認した:

```sql
SELECT COUNT(*) FROM search_documents_fts WHERE search_documents_fts MATCH 'デザイン';  -- → 0
SELECT COUNT(*) FROM search_documents_fts WHERE search_documents_fts MATCH 'design';    -- → 3
SELECT note_id FROM search_documents WHERE body_plain LIKE '%デザイン%';                -- → ヒット
```

CJK キーワード単独では本文内の CJK 文字列にマッチしない。

### Decision
本 Issue では対応しない。フォロー Issue として切り出す（Phase 4 で起票）。理由:

- Issue #29 のスコープは「visibility 入力伝達 + projection 実値化」であって search index のトークナイザ設計ではない
- 解決には FTS5 schema 変更（`tokenize='trigram'` 採用または N-gram 索引列追加）+ migration + 既存索引の再構築が必要で、最低でも数時間規模
- 既に英語キーワードで本 Issue の意図（visibility フィルタが効くこと）は E2E で証明済み

### Consequences
- 良い点: 本 Issue のスコープが膨張しない
- トレードオフ: CJK 検索の UX 問題は残存。フォロー Issue で対応

---
