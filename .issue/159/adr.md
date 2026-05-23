# ADR — Issue #159: dispatch routing 追加対応

## ADR-001: `note.purged` fan-out 順序を search → publication → media → view に固定

### Status
Proposed

### Context

`note.purged` は spec/domains/index.md の購読対応表で 4 つの handler が購読する設計:
- `search.handleNoteTrashedEvent`（既存 routing 済み）
- `publication.handleNotePurgedEvent`（ShareLink / PublicationState の物理削除）
- `media.handleNotePurgedEvent`（MediaAsset の refCount decrement）
- `view.handleNotePurgedEvent`（SavedView の broken marker）

Issue #145 ADR-002 / ADR-003 の踏襲で「dispatcher 内で順次 await」「副作用最小から先」の方針を採用するが、4 handler の具体的順序は本 Issue で決定する必要がある。

### Decision

順序: search → publication → media → view。

理由:
1. **search delete を先** — index から消えた状態を最初に作ることで、後続 handler が完了する前に「検索結果からは消えている」整合性を担保（ユーザー目に最も近い面の整合を優先）
2. **publication 削除を次** — ShareLink / PublicationState の物理削除は media ref decrement とは独立。先に終わらせる
3. **media ref decrement を次** — MediaAsset.refCount の attached → orphaned 遷移は publication 削除と独立だが、purge 系の cleanup を一塊にする
4. **view を最後** — SavedView の broken marker は他のクリーンアップに依存しない (`findReferencingNote` は note 行が物理削除されていても tags/dirs から検索できる) ので、視覚的フィードバックの確定を最後に置く

### Consequences

- **良い点**:
  - 各 handler が冪等 + at-least-once 配信前提で partial commit のリスクは収束する
  - search 側の整合を最優先するため、ユーザーが purge 完了を確認する際の混乱が少ない
  - 既存 Issue #145 の `note.trashed` fan-out（search → publication）の延長として理解しやすい
- **トレードオフ**:
  - 各 handler が UoW を開くため 1 event 当たり 4 UoW 開設のコスト（既存 `note.trashed` の 2 UoW と同質）
  - 順次 await のため累積レイテンシが線形に伸びる。並列化は検討したが冪等性 + 部分失敗の retry 設計が複雑化するため見送り

---

## ADR-002: `note.trashed` の view fan-out は `view.handleNotePurgedEvent` を再利用

### Status
Proposed

### Context

spec/domains/index.md の `note.deleted` 行に「`View.HandleNotePurgedEvent（部分）`」と記載されており、View 側は `note.trashed` 用の別 handler を持たず、`handleNotePurgedEvent` を再利用する設計と読み取れる。実際に `view.handleNoteTrashedEvent` という独立ハンドラはコード上に存在しない。

broken marker を立てる処理は trash でも purge でも同じ（SavedView から該当 note を broken と記録）なので、handler を分けるメリットは現状ない。

### Decision

`note.trashed` の fan-out 先に `viewHandleNotePurgedEvent` を **そのまま追加**。新たに `view.handleNoteTrashedEvent` を作らない。

### Consequences

- **良い点**:
  - handler 重複を避けられる（DRY）
  - spec の "（部分）" 注記と整合
  - 実装変更が最小
- **トレードオフ**:
  - handler 名と event 名の不一致が読みづらい（将来 trash と purge で view 側挙動を分けたくなったら handler 分割が必要）
  - 将来分割する場合は本 ADR を Superseded にして新 handler を実装する

---

## ADR-003: `directory.deleted` / `media.uploaded` は dispatcher routing しない

### Status
Proposed

### Context

調査の結果:
- **`directory.deleted` physical event は emit されていない**。`Directory.DeleteDirectory` は配下ノートの `note.trashed` のみ emit し、`directory.deleted` 自体は発火しない設計
- **`media.uploaded` physical event は実在しない**。実在するのは `media.created` / `attached` / `orphaned` / `deleting` / `purged`
- 一方、spec/domains/index.md の購読対応表には両 event が記載されており、`view.handleDirectoryDeletedEvent` 実装も存在する

Issue 本文は「dispatcher で routing 未実装」と書いているが、対象 physical event そのものが存在しないため、dispatcher 側で routing を追加することは不可能（event type が switch case として書けない）。

### Decision

dispatcher routing は **追加しない**。代わりに:

1. `spec/domains/index.md` を実装に合わせて修正（implementation step 3）:
   - `media.uploaded` 行: 「物理 event は MVP 範囲外。Media の TTL ベース孤児監視は `purgeOrphans` cron が直接走査する設計（event-driven ではない）」
   - `directory.deleted` 行: 「物理 event は emit されない。`Directory.DeleteDirectory` は配下ノートの `note.trashed` のみ emit し、View 側の broken marker は `note.trashed` 経由で fan-out」
2. `dispatchDomainEvent.test.ts` の skipped regression guard は **維持** し、コメントを「physical event 未実在のため routing 対象外」に書き換え
3. `view.handleDirectoryDeletedEvent` の死蔵 handler は本 Issue ではそのまま残す（削除すべきか別 Issue で判断 — 将来 directory.deleted を独自 event として emit する選択肢を保留したいため、保守的に残す）。ただし JSDoc コメントを追加し「現状 production の dispatcher routing 対象外。`directory.deleted` physical event が emit されないため未配線。将来 directory 単位の broken marker を独自 event として emit する設計を採用する場合の保留 handler」と明示し、コード ↔ spec の相互参照を双方向に保つ

### Consequences

- **良い点**:
  - spec と実装の乖離が解消される
  - 「spec を信じて dispatch を追加した未来の貢献者が混乱する」リスクが消える
  - Issue 本文の指摘（dispatcher routing 未実装）を正しく解釈し、過剰実装を防ぐ
- **トレードオフ**:
  - 「ディレクトリ削除で SavedView の broken marker が立たない」機能要件のギャップが残る（本 Issue 範囲外として別 Issue 候補）
  - `view.handleDirectoryDeletedEvent` は死蔵 handler として残る（コードは存在するが production では呼ばれない）

---

## ADR-004: `user.deleted` fan-out 順序を publication → export に固定

### Status
Proposed

### Context

`user.deleted` の購読 handler:
- `publication.handleUserDeletedEvent` — 公開ノートを private 化、`changeVisibilityAndCascade` 経由で `note.publish_changed` / `share_link.revoked` を再 emit
- `export.handleUserDeletedEvent` — 進行中の export job を cancel、artifact を best-effort 削除

順序を決定する必要がある（並列実行は ADR-001 と同様の理由で見送り）。

### Decision

publication → export の順。理由:
1. publication が先に進むことで「公開停止 → export 取消」の論理順序が明確（ユーザー観点で「公開を止めてから download も止める」の方が自然）
2. partial commit: publication 成功 / export 失敗 → 全体 retry → publication 再実行は no-op（既 private は `changeVisibilityAndCascade` が empty drafts）

### Consequences

- **良い点**:
  - 論理順序が明快
  - retry セマンティクスが読みやすい（先行ステップは冪等で no-op、後続ステップが re-run）
- **トレードオフ**:
  - 大量ノート + 大量 export job を持つユーザーの場合、累積処理時間が長くなる
  - queue visibility timeout を超えるリスクは別 Issue 候補（本 Issue Phase 4 で follow-up Issue を起票して追跡する）

---

## ADR-005: dispatcher の payload validation は switch-case 冒頭で全件先行実施

### Status
Proposed

### Context

fan-out のある case（特に `note.purged` の 4 handler）で、handler を順次 await 中に後段の VO 構築（`MediaAssetId.create` 等）で BusinessRuleError が発生すると:

- 先行 handler は commit 済み（search index は削除されている）
- 後続 handler は未実行のまま BusinessRuleError → `handled+warn` で確定
- queue redelivery されないため、未実行 handler の副作用（SavedView の broken marker / publication 削除等）は欠落

この partial completion は冪等 retry でも回復しない（dispatch 自体が `handled` で stamped + acked されるため）。

Issue #145 ADR-005 の error classification 方針（`BusinessRuleError → handled+warn` で redelivery しない）は維持しつつ、partial commit を避けるためには「validation を副作用前に集中させる」必要がある。

### Decision

すべての case で、switch-case 冒頭に payload 全件の VO validation を集約する:

```ts
case "note.purged": {
  const payload = event.payload as Readonly<{
    noteId: string; ownerId: string; mediaRefs: readonly string[];
  }>;
  // === 副作用前の一括 validation ===
  const noteId = NoteId.create(payload.noteId);
  const ownerId = UserId.create(payload.ownerId);
  const mediaRefs = payload.mediaRefs.map((id) => MediaAssetId.create(id));
  // === 以降は handler 順次呼出 ===
  await searchHandleNoteTrashedEvent({ container, input: { noteId } });
  await publicationHandleNotePurgedEvent({ container, input: { noteId } });
  await mediaHandleNotePurgedEvent({ container, input: { event: event as NotePurgedEvent } });
  await viewHandleNotePurgedEvent({ container, input: { noteId: payload.noteId } });
  return { kind: "handled" };
}
```

`tag.deleted` のように handler が VO ではなく raw string を input に取るケースでも、dispatcher 冒頭で `TagId.create(payload.tagId)` を呼んで validate する（戻り値は使わない場合も、副作用としての schema check を担保するため）。

### Consequences

- **良い点**:
  - validation 失敗時は handler が 1 つも呼ばれない状態で `handled+warn` 確定 → 後の手動 replay や DLQ 対応が「全 handler 未実行」という単純な前提から始められる
  - dispatcher の「副作用 vs validation」境界が明確になり、コードリーディングが容易
  - `media.handleNotePurgedEvent` の envelope 再構築問題（envelope 全体を組み立てるか `as` cast か）は「validate は冒頭で済んでいるので envelope は受信した `event` を `as NotePurgedEvent` で narrowing するだけ」と整理できる
- **トレードオフ**:
  - VO の `.create` を validate 目的だけで呼ぶケース（`TagId.create(payload.tagId)` 等）は戻り値未使用の lint warning が出る可能性 — その場合は `void TagId.create(...)` か変数束縛で抑制する。`note.purged` の `mediaRefs` map も同様（envelope cast で渡すため戻り値は未使用）— 実装時は `// validate-only, envelope は event cast で渡す` のコメントを添える
  - 既存 routing（`note.created` 等の single-handler case）でも同じ規約を適用する場合、わずかなコード増。本 Issue では既存 case は触らず、新規 case のみこの規約に従う
  - 「payload 全件 validation」は「handler が参照する field 全件」を意味する。例: `note.trashed` の fan-out 先 handler はすべて `noteId` しか参照しないため、`ownerId` / `mediaRefs` の追加 validation は不要（厳格に "payload にあるすべての field" と解釈すると過剰）
  - **handler への入力は raw string を維持**: `view.handleNotePurgedEvent` / `view.handleTagDeletedEvent` は raw string input を要求するため、dispatcher 側で VO に cast してから渡すのではなく、validate した後も `payload.noteId` / `payload.tagId` をそのまま渡す。handler 内部で `as NoteId` / `as TagId` cast して利用する（CLAUDE.md "信頼" の原則。リスク #5 で documented）

---
