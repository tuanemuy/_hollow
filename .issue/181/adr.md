# ADR — Issue #181: directory deletion should mark SavedView broken

## ADR-001: ディレクトリ削除の broken マークを `directory.deleted` 物理イベントで実現する

### Status
Proposed

### Context
ディレクトリ削除時に、その `directoryId` をフィルタ条件に持つ SavedView を broken マークしたい。Issue Notes は2案を提示している:

- **案A:** `directory.deleted` を物理ドメインイベントとして発行し、dispatcher で（現在 dormant な）`view.handleDirectoryDeletedEvent` に routing する。
- **案B:** `view.handleNoteTrashedEvent`（実体は `note.trashed` 経由の view handler）にディレクトリ削除ロジックを追加する。子ノートの `directoryId` を辿って `findReferencingDirectory` を呼ぶ。

Issue #159 ADR-003 では `directory.deleted` を物理イベント化せず、`view.handleDirectoryDeletedEvent` を「将来の採用に備えた dormant code」として保存する判断をしていた。本 Issue #159 ADR-003 が明示的に「別 Issue 候補」とした機能が、この Issue #181 である。

### Decision
**案A を採用する。**

理由:
1. **要件充足:** 子ノートを持たない／active ノートが無い空ディレクトリは `note.trashed` を1件も発行しない（`directory.integration.test.ts` が現に保証）。案B は `note.trashed` の fan-out に依存するため、この空ディレクトリのケースで `directoryId` フィルタ SavedView を取り残し、**Issue の要件を満たせない**。案A は `deleteSubtree` が返す `deletedDirectoryIds` を起点にするため、削除された全ディレクトリ（空含む）を漏れなくカバーする。
2. **責務分離:** `note.trashed` は Note 集約のイベント。そこに Directory 削除の関心事を相乗りさせるのは責務混在。`note.trashed` は単一ノートの trash でも発火するため、その度に無関係な `findReferencingDirectory` が走ってしまう。
3. **dormant code の再利用:** `view.handleDirectoryDeletedEvent` は既に冪等な実装が完成しており、案A ではコード本体を一切変更せず production 経路へ配線するだけで済む。
4. **既存パターンとの一貫性:** 新イベント型は (1) ドメイン `events.ts`、(2) `AllDomainEvents` union、(3) `eventDecoders` + registry 登録、(4) dispatcher case の4点配線で、`tag.deleted` と完全に同型。アーキテクチャ規約に最も忠実。
5. **将来の拡張性:** view 以外の将来購読者（検索インデックスの directory facet 等）にも開かれたイベントになる。

payload は handler が使う `directoryId` のみに最小化する（`ownerId` 等は YAGNI で含めない）。

`directory.deleted` draft はユースケース層（`DeleteDirectory`）で、既存の `note.trashed` drafts と**同一 UoW・同一 outbox バッチ**に `collectEvents(drafts)` で合流させる。これにより「削除が実際にコミットされたディレクトリだけがイベント化される」ことがトランザクショナルに保証される（サービス層で発行しない理由）。`aggregateId` は `directoryId`（`TagEvents.deleted` の `aggregateId: tagId` と同型）。

### Consequences
- 良い点:
  - 空ディレクトリを含む全削除ケースをカバーし、Issue 要件を構造的に満たす。
  - dormant handler の本体変更ゼロ。view ドメインのコード変更なし。
  - tag.deleted / note.purged と同型でレビュー・保守が容易。
- トレードオフ:
  - directory ドメインに `events.ts` を新規追加し、`AllDomainEvents` union・decoder registry・dispatcher case の3点配線が必要（ただし確立パターンの定型作業）。
  - サブツリー削除で削除ディレクトリ数 N 個分の `directory.deleted` 行が Outbox に増える。
  - `directory.integration.test.ts` の「空ディレクトリ削除で outbox event が出ない」系テストが挙動変更により失敗するため、`directory.deleted` を期待するアサーションへ更新が必要。

### Supersedes
- Issue #159 ADR-003: `directory.deleted` を物理イベント化しない判断を、本 Issue #181 で「機能を優先する」前提に切り替えたことで上書きする。`view.handleDirectoryDeletedEvent` は dormant ではなくなる。

---
