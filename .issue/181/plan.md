# 実装計画 — Issue #181: directory deletion should mark SavedView broken (Issue #159 follow-up)

**Issue:** #181
**作成日:** 2026-05-29
**複雑度:** 中〜大規模

---

## 目的

ディレクトリが削除されたとき、そのディレクトリ ID をフィルタ条件に持つ SavedView を broken としてマークする。現状は `note.trashed` の fan-out（`findReferencingNote` 経由）でしか broken マークが立たず、`directoryId` フィルタを持つ SavedView や、子ノートを持たない空ディレクトリのケースが取り残されている。このギャップを塞ぐ。

## スコープ

### 含まれるもの
- `directory.deleted` 物理ドメインイベントの新規定義（`app/core/domain/directory/events.ts`）
- `DeleteDirectory` ユースケースで、削除された各ディレクトリについて `directory.deleted` を発行
- decoder の追加・relay worker への登録
- dispatcher での `directory.deleted` → `view.handleDirectoryDeletedEvent` routing
- dormant code（`view.handleDirectoryDeletedEvent`）の production 経路への配線（コード本体は変更なし、JSDoc 更新）
- spec の購読対応表更新（`spec/domains/index.md`）
- 上記に伴うユニット・インテグレーションテストの追加・更新

### 含まれないもの
- `media.uploaded` イベント（ADR-159-003 で同列に skipped とされたが本 Issue 範囲外）
- SavedView ドメインモデル・savedViewRepository・ViewQuery・BrokenConditionMarker の変更（既に理想形で完成済み）
- view handler 本体のロジック変更（既存実装が冪等で仕様準拠）
- directory イベント payload への余分なフィールド追加（`directoryId` のみに留める、YAGNI）

## 実装ステップ

### 1. directory ドメインイベントを新規定義

- **対象ファイル:** `app/core/domain/directory/events.ts`（新規）
- **変更内容:** `app/core/domain/tag/events.ts` を手本に、`DirectoryDeletedEvent = DomainEventBase<"directory.deleted", Readonly<{ directoryId: DirectoryId }>>` と `DirectoryEvent` union、`DirectoryEvents.deleted(params, occurredAt): EventDraft<DirectoryDeletedEvent>`（`aggregateId: directoryId`）を定義。payload は handler が使う `directoryId` のみに最小化する。
- **理由:** 物理イベント型が存在しないと dispatcher の switch case が書けない（ADR-159-003 が skipped にした根本理由）。

### 2. DeleteDirectory ユースケースで `directory.deleted` を発行

- **対象ファイル:** `app/core/application/directory/deleteDirectory.ts`
- **変更内容:** `deleteSubtree` の戻り値 `deletedDirectoryIds` をループし、各 ID で `DirectoryEvents.deleted` draft を生成して既存の drafts 配列に追加（`note.trashed` と同じ `collectEvents(drafts)` 呼出に合流）。
- **理由:** 削除された全ディレクトリ（空ディレクトリ・サブツリー含む）を漏れなくイベント化し、案Bの空ディレクトリギャップを構造的に回避。

### 3. directory イベント decoder を追加・登録

- **対象ファイル:** `app/core/application/directory/eventDecoders.ts`（新規）、`app/core/application/workers/eventRelayWorker.ts`
- **変更内容:** `app/core/application/tag/eventDecoders.ts` を手本に `directoryDeletedSchema`（`z.object({ directoryId: z.string() }).strict()`）+ `buildEventDecoder` で `directoryEventDecoders` を定義。`eventRelayWorker.ts` で `AllDomainEvents` union に `DirectoryEvent` を追加し、`directoryEventDecoders` を import して `defaultEventDecoderRegistry` に spread。
- **理由:** relay が新イベントを decode できないと `No decoder registered for event type "directory.deleted"` で per-row failure → DLQ になる。union 拡張は型フェンス（unknown key 弾き）の前提。

### 4. dispatcher に `directory.deleted` routing を追加

- **対象ファイル:** `app/core/application/workers/dispatchDomainEvent.ts`
- **変更内容:** `case "directory.deleted"` を追加。ADR-159-005 に従い `DirectoryId.create(payload.directoryId)` を副作用前に VO 化（schema drift を BusinessRuleError として先行検出）してから `viewHandleDirectoryDeletedEvent` を await し `{ kind: "handled" }`。handler を import。JSDoc の routing 説明と「directory.deleted remain skipped」記述を「`directory.deleted` → `view.handleDirectoryDeletedEvent`（Issue #181）」に更新。
- **理由:** dormant handler を production 経路に配線。

### 5. dormant handler の JSDoc を更新

- **対象ファイル:** `app/core/application/view/handleDirectoryDeletedEvent.ts`
- **変更内容:** ADR-159-003 由来の「intentionally NOT wired / dormant code」コメントを削除し、「`directory.deleted`（Issue #181 で physical event 化）に routing される」旨へ更新。コード本体は変更不要。
- **理由:** コメントと実態の乖離防止（CLAUDE.md「WHY が非自明なときのみコメント」）。

### 6. spec の購読対応表を実装に合わせて更新

- **対象ファイル:** `spec/domains/index.md`（`directory.deleted` 行）
- **変更内容:** 「物理 event は emit されない」注記を「`Directory.DeleteDirectory` が削除した各ディレクトリについて `directory.deleted` を emit、`View.HandleDirectoryDeletedEvent` が購読（Issue #181）」へ書き換え。発火元 usecase 欄も整合させる。`note.trashed` 経由 fan-out（note 参照 marker）と `directory.deleted` 経由（directory 参照 marker）の**2経路が併存し、それぞれ異なる種類の BrokenConditionMarker を立てる**点を一文補足する。
- **理由:** spec が SSOT。ADR-159-003 の注記を Issue #181 の決定で上書き。

## 設計判断

**案A: `directory.deleted` 物理イベントを発行（採用）** vs **案B: `view.handleNoteTrashedEvent` にディレクトリ削除ロジックを追加（不採用）**

案Bは「子ノートを持たない空ディレクトリは `note.trashed` を1件も発行しない」ため Issue の要件（空ディレクトリ参照 SavedView の broken マーク）を構造的に満たせず、また Note 集約のイベントに Directory 削除の関心事を相乗りさせる責務混在が問題。案Aは dormant handler をそのまま活かせ、既存イベントパターン（tag.deleted）と完全同型でアーキテクチャに最も忠実。詳細は adr.md ADR-001 を参照。

## リスクと注意点

- **冪等性 / at-least-once:** `handleDirectoryDeletedEvent` は `BrokenConditionMarker` のキー衝突 collapse + OCC `expectedVersion` で再配信に耐える（既存 tag/note handler と同設計）。
- **空ディレクトリ:** 案A採用により `directory.deleted` は `deletedDirectoryIds` 起点なので空ディレクトリでも必ず発火 — 要件を構造的に満たす。
- **既存テストの破壊（要更新）:** `directory.integration.test.ts` の「空ディレクトリ削除で outbox event が出ない」系テストは案A で `directory.deleted` を1件出すため失敗する。`directory.deleted` を期待するアサーションへ更新が必要。
- **削除順序:** `deleteSubtree` は post-order（子→親）。view handler は directoryId 単位で独立・冪等なので順序非依存。Outbox は順序保証なしだが問題にならない。
- **SavedView の filter condition:** `query_json.$.directoryId` は単一文字列 or null。`findReferencingDirectory` は `json_extract = ?` で正しく拾う。サブツリーの全 directoryId それぞれにイベントが出るので個別にマークされる。
- **過剰スコープ回避:** handler 本体・savedViewRepository・ViewQuery は変更不要。directory イベント payload は `directoryId` のみに留める。
- **`media.uploaded`:** ADR-159-003 で同列に skipped とされたが本 Issue 範囲外。触らない。

## テスト方針

検証レイヤーが2層に分かれる点に注意する（混同しないこと）:
- **decoder 層（relay worker）:** strict schema 違反（unknown key・型不一致）は `buildEventDecoder` が `SystemError(DataIntegrityError)` を throw し、relay の `decodeEntry` で catch されて per-row failure → DLQ になる。
- **dispatcher 層:** decoder の strict schema を通過した後の VO 化（`DirectoryId.create`）で投げられるのは `BusinessRuleError`。dispatcher の catch で `handled`（ack）に変換される。ここに到達するのは「文字列だが空文字/空白のみの `directoryId`」のケースに限られる。

- **ユニット（dispatcher）:** `dispatchDomainEvent.test.ts` の `directory.deleted` skipped guard を handled routing テストへ移植。`directoryDeletedEvent()` ビルダーの `type: "..." as never` キャストは `AllDomainEvents` union 追加で不要になるので除去。skipped guard コメントは「`directory.deleted` は #181 で wired、`media.uploaded` のみ skipped 継続」へ分離更新する。テストは handler mock の呼出 + ADR-159-005 head-validation（**空文字/空白の** `directoryId` で BusinessRuleError → handled で ack）+ transient で retry（tag.deleted の "payload tagId is empty" ケースが雛形）。
- **ユニット（decoder）:** `directory/__tests__/eventDecoders.test.ts`（新規、tag の雛形）で payload→VO 化と strict schema 違反（`SystemError` throw）を検証。
- **ユニット（view handler）:** `app/core/application/view/__tests__/handlers.test.ts` に既に `describe("handleDirectoryDeletedEvent")`（"marks views referencing the directory as broken" 1ケース）が存在する。新規ファイルは作らず、既存に**冪等再実行で no-op になるケース**のみ補強する。
- **インテグレーション:** `directory.integration.test.ts` を更新 — (1) 空ディレクトリ削除で `directory.deleted` 1件、(2) サブツリー削除で削除ディレクトリ数分の `directory.deleted` + 子ノート分の `note.trashed`、をアサート。可能なら relay→dispatch→`findReferencingDirectory` で SavedView の `brokenConditions` に directory marker が立つ end-to-end も検証。
- **手動/ブラウザ:** directoryId フィルタの SavedView を作成 → そのディレクトリを削除 → broken marker 表示を確認。
- 変更後 `pnpm typecheck && pnpm lint:fix && pnpm format`、`pnpm test:unit` / `pnpm test:integration`。

## レビュー履歴

### 1周目

**修正した点（要件カバレッジ視点）**:
- 視点1は問題点ゼロ。

**修正した点（アーキ・リスク視点）**:
- P-001: テスト方針に decoder 層（strict schema 違反 → `SystemError` → DLQ）と dispatcher 層（VO 化失敗 → `BusinessRuleError` → handled）の2層区別を明記。dispatcher の BusinessRuleError テストは「空文字/空白の directoryId」ケースに限定されることを明示。
- P-002: view handler 単体テストは新規追加ではなく、既存 `handlers.test.ts` の `describe("handleDirectoryDeletedEvent")` に冪等 no-op ケースを補強する方針へ修正。

**取り込んだ改善提案**:
- S-001（アーキ視点）: `directory.deleted` を `note.trashed` と同一 UoW・同一 outbox バッチで collect する根拠を adr.md に追記。
- S-002（アーキ視点）: dispatcher テストの `as never` キャスト除去・skipped guard コメントの media.uploaded 分離更新をテスト方針に明記。
- S-002（要件視点）: spec 購読表で `note.trashed` 経由と `directory.deleted` 経由の2経路併存を補足する旨をステップ6に追記。

**見送った提案とその理由**:
- なし（要件視点 S-001 は P-002 と同趣旨のため統合）。

### 2周目

両視点とも問題点ゼロで終了。

- 要件カバレッジ視点: 問題点ゼロ。Expected Behavior（directory フィルタ SavedView の broken マーク）を構造的にカバー、スコープ外混入なしを確認。
- アーキ・リスク視点: 問題点ゼロ。1周目指摘の反映を確認。S-001（dispatcher テストの media.uploaded 共有コメント書き換えの念押し）は既にテスト方針に明記済みのため実装時の注意喚起として扱う。

**終了理由:** 2周目で両視点とも問題点ゼロ。
