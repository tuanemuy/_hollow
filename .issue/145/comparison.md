# Issue #145 候補A/B 比較資料

**Issue:** #145 — search: note.* / publication.* dispatch が skipped のままで HandleNoteSavedEvent 等が動作していない
**作成日:** 2026-05-23

---

## 0. Issue 記述の事実関係チェック

Issue 本文では「search index への書き込みは migration 内の trigger ベース（`search_documents_ai/ad/au`）と Note 系 usecase が直接 `searchIndex.upsert` を呼ぶ経路のみで運用されている」とされているが、コード上の事実は**異なる**。

| 経路 | 実態 |
| --- | --- |
| `note.*` / `publication.*` → `HandleNoteSavedEvent` 系 → `IndexJob` enqueue → `ConsumeIndexJob` → `searchIndex.upsert/delete` | dispatch されておらず**未稼働** |
| Note usecase が直接 `searchIndex.upsert/delete` を呼ぶ経路 | **存在しない**。`rg "searchIndex\.(upsert|delete)" app/core/application/` の結果は `consumeIndexJob.ts` のみ（テストを除く） |
| migration の `search_documents_ai/ad/au` trigger | `search_documents` テーブル ↔ `search_documents_fts` 仮想テーブルの**FTS 同期**のみ。`search_documents` 自体を書き込むのは `D1SearchIndex.upsert/delete` だけ |
| `AdminSettings.RebuildSearchIndex`（`bulkRebuildFromSnapshots`） | admin による手動再構築のみ。普段の書き込み経路ではない |

**結論**: 通常運用では `search_documents` テーブルへの書き込みが**どこからも行われていない**。`AdminSettings.RebuildSearchIndex` を手動で叩いた瞬間のスナップショットだけが index に残っている状態。これは Issue 本文の認識より深刻。

---

## 1. spec と実装の event 名の乖離

`spec/usecases/search.md` は以下の 3 つの event 型を前提にしている:

- `note.saved`
- `note.deleted`
- `note.publish_changed`

一方、実装の event 定義 (`app/core/domain/note/events.ts`, `app/core/domain/publication/events.ts`) は以下の通り:

| spec | 実装に存在する近傍 event |
| --- | --- |
| `note.saved` | `note.created` / `note.content_updated` / `note.renamed` / `note.moved` / `note.restored` / `note.tags_replaced` |
| `note.deleted` | `note.trashed` / `note.purged` |
| `note.publish_changed` | `note.publish_changed`（一致） |

`handleNoteSavedEvent.ts` の JSDoc には「`note.saved` event emitted by Note usecases (Create / Save / Rename / Move / Restore, etc.)」と書かれており、複数の note event を集約した論理名のつもりだったと読める。つまり「`note.saved` という単一 event 型は存在せず、複数の note event を `handleNoteSavedEvent` に集約 routing する想定」だった可能性が高い。

これは候補 A を採れば「routing 仕様の確定」（どの event を save handler に流すか）と「spec の event 名修正」がセットで必要になる。

---

## 2. 候補A（dispatch 拡張 = spec を正と扱う）

### 2.1 追加実装の範囲

#### 2.1.1 dispatchDomainEvent の routing 追加

`app/core/application/workers/dispatchDomainEvent.ts` に以下の case を追加:

- `note.created` / `note.content_updated` / `note.renamed` / `note.moved` / `note.restored` / `note.tags_replaced` → `handleNoteSavedEvent`
- `note.trashed` / `note.purged` → `handleNoteTrashedEvent`
- `note.publish_changed` → `handlePublicationChangedEvent`

#### 2.1.2 NoteSnapshot 構築問題

`handleNoteSavedEvent` / `handlePublicationChangedEvent` は input として `NoteSnapshot` を受け取る。しかし note event の payload には `NoteSnapshot` は含まれず、`noteId` 等の最小情報しかない。

選択肢:
1. **dispatcher 側で snapshot を構築する** — `buildNoteSnapshots` を呼ぶために `noteRepository.findById` → `buildNoteSnapshots` → handler に渡す。dispatcher の責務が「routing + snapshot 構築」に拡大する。
2. **handler の input を `noteId` に変えて handler 内で snapshot 構築する** — handler の責務が「snapshot 構築 + enqueue」に拡大する。spec は payload に NoteSnapshot を含めると書いているのと矛盾。
3. **emit 側で event payload に NoteSnapshot を詰める** — `saveNote` 等の usecase が emit 時に `buildNoteSnapshots` を呼ぶ。トランザクション内でのスナップショット構築なので一貫性は高いが、UoW 内に cross-aggregate な read が増える。

いずれにせよ、現状の handler シグネチャ・event payload・spec は**3方向で不整合**で、整理が必要。

#### 2.1.3 publication 側 handleNoteTrashedEvent との衝突

`note.trashed` を search 側 `handleNoteTrashedEvent` に流すと、publication 側にも `handleNoteTrashedEvent`（`publication/handleNoteTrashedEvent.ts` 系列）があれば fan-out が発生する。dispatch table は 1 event → 1 handler の switch 構造なので、event を多重 consume するなら dispatcher を fan-out 対応に変えるか、`handleNoteTrashed` を「複数 handler 合成」関数として書き直す必要がある。

### 2.2 既存の用意済み資産

- 3 handler の実装は完成: `handleNoteSavedEvent.ts` / `handleNoteTrashedEvent.ts` / `handlePublicationChangedEvent.ts`
- `consumeIndexJob` worker 完成、`IndexJobRepository` の D1 実装 (`D1IndexJobRepository`) 完成、DI 配線済み
- `SearchService.applyUpsert` / `applyDelete` 完成
- `buildNoteSnapshots` helper 完成（`AdminSettings.RebuildSearchIndex` 用に整備済み）

### 2.3 追加検討点

- IndexJob 用の queue / consumer worker entrypoint が cloudflare 配下に揃っているか要確認
- `bulkRebuildFromSnapshots` 経路との両立（同じ index に対して event-driven と admin 再構築の両経路が走る）
- event 多重発火時（例: `saveNote` で create + tags_replaced を同時 emit）の重複 enqueue → `consumeIndexJob` は冪等なので OK だが、Outbox / IndexJob テーブルの行数増加

### 2.4 規模感

- 変更ファイル: `dispatchDomainEvent.ts`, `eventDecoders`（note 側追加）, dispatcher のテスト, worker entry, 関連 DI
- 新規/書き換え: handler の input シグネチャ整理（snapshot 構築箇所の決定により1～3ファイル）
- spec 側: `spec/usecases/search.md` の event 名修正（`note.saved` / `note.deleted` を実装の event 名に揃える、または「論理 event 名」と注記）

---

## 3. 候補B（spec を実装に合わせる = 未使用コードを削除）

### 3.1 削除対象

#### Application 層
- `app/core/application/search/handleNoteSavedEvent.ts`
- `app/core/application/search/handleNoteTrashedEvent.ts`
- `app/core/application/search/handlePublicationChangedEvent.ts`
- `app/core/application/search/consumeIndexJob.ts`
- 対応するテスト

#### Domain 層
- `IndexJob` entity / valueObject (`IndexJobId`, `IndexJobOp`, `IndexJobAttempts`, `IndexJobLastError`)
- `IndexJobRepository` port

#### Adapter 層
- `D1IndexJobRepository`
- `app/core/adapters/d1/schema.ts` の `index_jobs` テーブル定義
- 新規 migration で `index_jobs` テーブル DROP（or DDL 据え置きで unused に）

#### Infra / DI
- `serverCloudflare.ts` の `indexJobRepository` 配線、`WorkerContainer` 型からの除去
- IndexJob 用 queue / consumer worker（あれば）

#### Spec
- `spec/usecases/search.md` から HandleNoteSavedEvent / HandleNoteTrashedEvent / HandlePublicationChangedEvent / ConsumeIndexJob の 4 セクション削除
- `spec/domains/search.md` の IndexJob 関連削除
- `spec/domains/index.md` の event 購読対応表から search 側エントリ削除
- `spec/testcases/search/index.md` のテストケース削除

### 3.2 候補B が**実用不可**である理由

セクション 0 の通り、現在 production の search_documents テーブルに**何も書き込まれていない**。候補B（event 経路の削除）を採るなら、書き込み経路を別途用意しなければならない:

- 案 B-1: Note usecase で `searchIndex.upsert/delete` を直接呼ぶ（事実上 spec を「直接呼び出し」に書き換え）
- 案 B-2: 書き込みを諦め、`AdminSettings.RebuildSearchIndex` の手動運用に閉じる（不毛）

つまり候補B は「現状を仕様化する」と言いつつ、実態は**新規実装が必要**になる（書き込み経路の差し替え）。それなら現状用意済みの event-driven 経路を活かす候補A のほうが追加実装が小さい。

### 3.3 規模感

- 削除（純粋な削除）の規模は大きい（usecase 3 + worker 1 + entity + port + adapter + schema + DI + spec 4 ファイル）
- 加えて書き込み経路の新規実装が必要（Note 系 usecase 多数の改修 — create/save/rename/move/trash/restore/purge/tags_replaced + publication.changed）

---

## 4. トレードオフ比較表

| 観点 | 候補A（dispatch 拡張） | 候補B（spec 書き換え） |
| --- | --- | --- |
| spec との整合性 | spec が正、ただし event 名の修正は要る | spec を実態に合わせる |
| 用意済み資産の活用 | 大（handler / worker / repo / DI 全て活かす） | 小（全て削除） |
| 追加実装の規模 | 中（dispatch routing + snapshot 構築箇所決定 + 多重 handler 整理） | 大（書き込み経路の新規実装が必要、+ 既存資産の削除） |
| 運用上の堅牢性 | outbox + at-least-once 再配信、DLQ で巻き戻し可能 | trigger は同期、production の書き込み経路を新設しても UoW 内同期になり search-index unavailable で write が止まる懸念 |
| 整合性回復経路（`bulkRebuildFromSnapshots`） | 既存のまま運用意義あり（落ちた IndexJob のリカバリ等） | 同 |
| 透明性（どこが書いているか） | 明確（event → IndexJob → consumer） | 案 B-1 なら明確、案 B-2 なら不透明 |
| Issue #93（PR #144）との関係 | event-driven 経路の安全網として `bulkRebuildFromSnapshots` が機能 | bulkRebuild が唯一の書き込み経路になる懸念（B-2 の場合） |

---

## 5. 推奨

**候補A を推奨**する。理由:

1. **現状は production の search-index が誰からも書かれていない** という前提では、いずれにせよ「書き込み経路の整備」は必須。候補A は既存資産を活かして dispatch を繋ぐだけで済む。
2. spec と実装の event 名乖離は「論理 event 名 → 物理 event 型の routing」を明示することで吸収できる範囲。
3. outbox + 再試行 + DLQ + bulkRebuild 安全網 という設計（spec の意図）が production で活きる。
4. 候補B は「削除」とうたっておきながら結局「書き込み経路の新規実装」が必要で、コスト総量は候補A 以上になる。

### 5.1 候補A 採用時に Issue で決める必要があること

- NoteSnapshot 構築をどこで行うか（dispatcher / handler / event emit のいずれか）
- どの note event を save handler / trash handler に routing するか
- `note.trashed` を search と publication の両 handler に流す場合の fan-out 方法
- spec の event 名修正（実装の event 名を spec に書く or 「論理 event」と明示）

これらは Phase 1（issue-planner）で具体化する。

---

## 6. ユーザー判断

候補A を採用するか、あるいは別の方針を取るかを判断してください。
