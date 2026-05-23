# 実装計画 — Issue #159: dispatch: note.purged / note.trashed / tag.* / directory.* / media.* / user.* の routing が skipped のまま残っている handler 群

**Issue:** #159
**作成日:** 2026-05-23
**複雑度:** 中〜大規模

---

## 目的

Issue #145（PR #156）で確立した dispatcher 拡張パターンに倣い、`note.purged` / `note.trashed`（view fan-out 拡張）/ `tag.deleted` / `user.deleted` の physical event 4 種に対応する dispatch routing を `dispatchDomainEvent` に追加する。これにより `publication.handleNotePurgedEvent` / `media.handleNotePurgedEvent` / `view.handleNotePurgedEvent` / `view.handleTagDeletedEvent` / `publication.handleUserDeletedEvent` / `export.handleUserDeletedEvent` の各 handler を production の dispatch 経路で稼働させ、`note.purged` 時の cascade cleanup / SavedView broken marker / user 削除時の cascade cleanup を outbox-driven で動かす。

調査で判明した重要事実: `media.uploaded` と `directory.deleted` は **physical event として実在しない**（前者は spec 文言上「Media 自身の TTL ベース孤児監視」、後者は `Directory.DeleteDirectory` が配下 `note.trashed` のみ emit）。これらは dispatcher 配線を追加せず、spec 側を実装に合わせて修正することで乖離を解消する。

## スコープ

### 含まれるもの

- `dispatchDomainEvent` の switch 拡張:
  - `note.trashed` の fan-out 拡張: 既存 search → publication に **view** を追加（search → publication → view）
  - `note.purged` の fan-out 拡張: 既存 search delete のみ → **publication + media + view** を追加（search → publication → media → view）
  - `tag.deleted` の routing 追加: `view.handleTagDeletedEvent`
  - `user.deleted` の routing 追加: `publication.handleUserDeletedEvent` + `export.handleUserDeletedEvent`（publication → export）
- `dispatchDomainEvent.test.ts` の regression guard 群の更新:
  - `tag.deleted` / `user.deleted`: skipped 維持 → handled 化（payload validation / partial failure ケース含む）
  - `share_link.issued` / `share_link.revoked` の skipped 維持テストにはコメントを追加し「本 Issue 範囲外、別系統の routing 議論が必要」と明示
  - `note.purged` fan-out: search-only → 4 handler の callOrder 検証 + partial failure
  - `note.trashed` fan-out: 既存 search + publication → search + publication + view の callOrder 検証
  - `directory.deleted` / `media.uploaded` の skipped guard は維持しコメントを「physical event 未実在のため routing 対象外」に書き換え
- `spec/domains/index.md` の購読対応表の同期:
  - `media.uploaded` 行: 「物理 event は MVP 範囲外。Media の TTL ベース孤児監視は `purgeOrphans` cron が直接走査する設計」と注記
  - `directory.deleted` 行: 「物理 event は emit されない。配下ノートの `note.trashed` 経由で fan-out」と注記
  - `note.deleted` 行: 「View 側は `note.trashed` 経由で `handleNotePurgedEvent` を fan-out（同 handler を再利用）」を明示

### 含まれないもの

- 既存 handler の input シグネチャ変更（dispatcher 側で payload 再構成して既存 input 型に渡す）
- 新規 handler の追加（`view.handleNoteTrashedEvent` は作らない。`handleNotePurgedEvent` を再利用 — ADR-002）
- event payload 構造の変更（emit 側は触らない）
- `share_link.issued` / `share_link.revoked` の skipped → handled 変更（本 Issue 範囲外、別系統の routing 議論が必要）
- `view.handleDirectoryDeletedEvent` の削除（spec 修正で「physical event なし」と整合させた上で、handler を残すか削除するかは別 Issue で判断 — 削除すると将来 directory.deleted を独自 event として emit する選択肢を失うため、保守的に残す）。JSDoc コメントは本 Issue 内で追加する（ADR-003 参照）
- `publication.handleUserDeletedEvent` / `export.handleUserDeletedEvent` の paging 細分化（queue visibility timeout 対応は別 Issue 候補 — リスクセクションで明記。本 Issue Phase 4 で follow-up Issue を起票）
- `view.handleDirectoryDeletedEvent` の処遇判断（保守的に残す方針は ADR-003 で確定、削除/活用判断は別 Issue 候補。本 Issue Phase 4 で follow-up Issue を起票）

## 実装ステップ

### 1. `dispatchDomainEvent` の switch 拡張

- **対象ファイル:** `app/core/application/workers/dispatchDomainEvent.ts`
- **変更内容:**
  - import 追加:
    - `handleNotePurgedEvent as publicationHandleNotePurgedEvent` from `../publication/handleNotePurgedEvent`
    - `handleNotePurgedEvent as mediaHandleNotePurgedEvent` from `../media/handleNotePurgedEvent`
    - `handleNotePurgedEvent as viewHandleNotePurgedEvent` from `../view/handleNotePurgedEvent`
    - `handleTagDeletedEvent` from `../view/handleTagDeletedEvent`
    - `handleUserDeletedEvent as publicationHandleUserDeletedEvent` from `../publication/handleUserDeletedEvent`
    - `handleUserDeletedEvent as exportHandleUserDeletedEvent` from `../export/handleUserDeletedEvent`
    - `MediaAssetId` from `@/core/domain/media/valueObject`
    - `UserId` from `@/core/domain/identity/valueObject`
    - `TagId` from `@/core/domain/tag/valueObject`
    - `NotePurgedEvent` 型 from `@/core/domain/note/events`（envelope re-cast 用）
  - **共通規約: payload validation は switch-case 冒頭で全件先行実施し、その後に handler を順次呼ぶ**（ADR-005 参照）。理由: validation 失敗で BusinessRuleError が後段の handler 呼出後に発生すると、先行 handler は commit 済みで後続は未実行のまま `handled+warn` で確定する partial completion を生む。冒頭で一括 validate すれば、validation 段階で失敗した場合「いずれの handler も呼ばれていない」状態で `handled+warn` になり、ADR-005 が示す「副作用前の早期失敗」原則に沿う。
  - **ADR-005 の "全件 validation" は "handler が参照する field 全件" と解釈する**: 例えば `note.trashed` は fan-out 先（search / publication / view）がすべて `noteId` しか参照しないため、既存どおり `NoteId.create(payload.noteId)` のみで OK（`ownerId` / `mediaRefs` の追加 validation は不要）。`note.purged` は media handler が `mediaRefs` を参照するため `mediaRefs` も冒頭 validate する。「使われない payload field まで validate しない」のは ADR-005 の Trade-offs の延長として明示する。
  - **`note.trashed` ケースの拡張**: 冒頭で `NoteId.create(payload.noteId)` を実施（既存）。既存 search / publication fan-out の **後** に `viewHandleNotePurgedEvent({ container, input: { noteId: payload.noteId } })` を追加（順序: search → publication → view）。
  - **`note.purged` ケースの拡張**:
    - **冒頭で一括 validation**:
      - `const noteId = NoteId.create(payload.noteId)`
      - `const ownerId = UserId.create(payload.ownerId)`（後段の media handler 用）
      - `const mediaRefs = payload.mediaRefs.map((id) => MediaAssetId.create(id))`
    - その後、search → publication → media → view を順次 await:
      - `searchHandleNoteTrashedEvent({ container, input: { noteId } })`（既存）
      - `publicationHandleNotePurgedEvent({ container, input: { noteId } })`
      - `mediaHandleNotePurgedEvent({ container, input: { event: event as NotePurgedEvent } })` — **envelope は dispatcher が受け取った `event: DomainEvent` をそのまま再利用**し、`as NotePurgedEvent` で type narrowing する（payload field の validate は冒頭で済んでいるので envelope 全体の再構築は不要）。handler は `input.event.payload.mediaRefs` しか参照しないが、シグネチャ上は `NotePurgedEvent` 全体を要求するため。
      - `viewHandleNotePurgedEvent({ container, input: { noteId: payload.noteId } })`
  - **`tag.deleted` ケースの追加**:
    - 冒頭で `TagId.create(payload.tagId)` を実施し validate（戻り値は handler signature の都合で使わないが、validate 結果は捨ててよい — ADR-005）
    - `handleTagDeletedEvent({ container, input: { tagId: payload.tagId } })`
  - **`user.deleted` ケースの追加**:
    - 冒頭で `const userId = UserId.create(payload.userId)` を実施
    - `publicationHandleUserDeletedEvent({ container, input: { userId } })`
    - `exportHandleUserDeletedEvent({ container, input: { userId } })`
  - 既存の error classification（`LLMRateLimitError` retry / `NotFoundError` handled / `BusinessRuleError` handled + warn / 残り retry）はそのまま流用
  - JSDoc コメントを更新: switch の routing 説明と fan-out 順序ルールに新 case を追記、ADR-005 の「冒頭 validation」規約も簡潔に明記
- **理由:** Issue 主目的。spec の購読対応表に書かれた routing を production で稼働させる。fan-out 順序は ADR-001 / ADR-004 参照。冒頭一括 validation は ADR-005 参照。

### 2. dispatchDomainEvent ユニットテストの更新

- **対象ファイル:** `app/core/application/workers/__tests__/dispatchDomainEvent.test.ts`
- **変更内容:**
  - `vi.mock` 追加: 上記 6 つの新規 import handler すべて
  - mocked variable を準備し `beforeEach` で reset
  - **既存 skipped guard の置き換え**:
    - `skips tag.deleted` → "routes tag.deleted to view handler and returns handled" + "returns handled+warn on empty tagId (BusinessRuleError)" + "returns retry on transient error"
    - `skips user.deleted` → "routes user.deleted to publication + export in order" + "returns retry on partial failure" + "returns handled+warn on empty userId"
  - **`note.purged` ケースの書き換え**:
    - 既存「search trash handler のみ」→ search + publication + media + view 4 handler の callOrder 検証
    - partial failure: search ok / publication ok / media transient → retry（view は呼ばれない）
    - partial failure: search ok / publication ok / media ok / view transient → retry
    - mediaRefs を含む完全な payload を `NotePurgedEvent` として組み立てて渡すアサーション
  - **`note.trashed` fan-out 拡張**: search + publication + view の 3 callOrder 検証 + partial failure（publication ok / view transient → retry）
  - **`directory.deleted` / `media.uploaded` の skipped guard は維持** + コメントを「spec/domains/index.md の購読表に記載があるが physical event が実在しないため routing 対象外」に書き換え
  - 既存 test の `as never` cast について: `tagDeletedEvent` / `userDeletedEvent` は実型として書き直す（routing 実装後は brand 取り外しの hack が不要）。`directoryDeletedEvent` / `mediaUploadedEvent` は physical event が実在しないため fake event として `as never` 維持
- **理由:** routing と error classification の網羅的保証。「skipped 維持」と「handled 化」を明示的に区別する regression guard。

### 3. spec の同期

- **対象ファイル:** `spec/domains/index.md`
- **変更内容:**
  - `media.uploaded` 行: 注記追加「物理 event は MVP 範囲外。Media の TTL ベース孤児監視は `purgeOrphans` cron が `media_assets.refCount = 0 && createdAt < now - orphanAge` を直接走査する設計（event-driven ではない）」
  - `directory.deleted` 行: 注記追加「物理 event は emit されない。`Directory.DeleteDirectory` は配下ノートの `note.trashed` のみ emit し、View 側の broken marker は `note.trashed` 経由で fan-out される（`view.handleNotePurgedEvent` 再利用）」
  - `note.deleted` 行: 注記更新「`View.HandleNotePurgedEvent（部分）` は `note.trashed` 経由で fan-out（同 handler を再利用）」
- **理由:** spec と実装の用語・購読契約の同期。CLAUDE.md の「設計判断による乖離を spec に反映」原則に従う。

### 4. 仕上げ

- `pnpm typecheck && pnpm lint:fix && pnpm format`
- `pnpm test:unit` / `pnpm test:integration` 全パス確認

## 設計判断

詳細は `.issue/159/adr.md` を参照。

- **ADR-001**: `note.purged` fan-out 順序を search → publication → media → view に固定
- **ADR-002**: `note.trashed` の view fan-out は `view.handleNotePurgedEvent` を再利用（新 handler を作らない）
- **ADR-003**: `directory.deleted` / `media.uploaded` は dispatcher routing しない（physical event 未実在のため spec 側を修正）
- **ADR-004**: `user.deleted` fan-out 順序を publication → export に固定
- **ADR-005**: dispatcher の payload validation は switch-case 冒頭で全件先行実施し、handler 順次呼出はその後

## リスクと注意点

1. **`media.handleNotePurgedEvent` の input 型が他と異質** — `{ event: NotePurgedEvent }` を要求するため、dispatcher で `NotePurgedEvent` を再構成する必要がある。schema drift（payload に `mediaRefs` がない・要素が不正等）は `MediaAssetId.create.map` で BusinessRuleError として吸収される（既存パターン）。
2. **fan-out partial commit による retry の冪等性** — 各 handler の冪等性は確認済み:
   - `publication.handleNotePurgedEvent`: `findById === null` で skip、OCC token 取得 → delete
   - `media.handleNotePurgedEvent`: `MediaService.reconcileRefs` が missing asset を skip
   - `view.*`: 同一 marker no-op + OCC、`findById === null` で skip
   - `publication.handleUserDeletedEvent`: 既 private は `changeVisibilityAndCascade` が empty drafts、per-UoW paging で partial progress 耐性
   - `export.handleUserDeletedEvent`: terminal 化済みは no-op、per-row try/catch で 1 行失敗が全体に波及しない
3. **`user.deleted` の処理時間** — publication 側は所有ノート × 200 件/UoW、export 側は job × 100 件/UoW。1 dispatch 当たりの処理時間が長く、queue visibility timeout を超えるリスクあり。**本 Issue では既存 handler を変更しない方針**で、別 Issue 候補としてリスクのみ記録。
4. **既存 test の `as never` cast** — `tagDeletedEvent` / `userDeletedEvent` は routing 追加に伴い実型として書き直す。`directoryDeletedEvent` / `mediaUploadedEvent` は physical event 未実在のため `as never` 維持。
5. **`view.handleNotePurgedEvent` の input `{ noteId: string }`** — VO ではなく raw string を取る設計。dispatcher は `payload.noteId` をそのまま渡せばよいが、`note.trashed` ケースでは既に `NoteId.create(payload.noteId)` で validate しているため fan-out 時の追加 validate は不要。`note.purged` ケースは新規追加なので、最初の handler 呼出前に `NoteId.create` で validate する。
6. **rollback** — switch 拡張部だけ revert すれば handler は無動作のまま残るので副作用なし（Issue #145 と同じ low-risk なロールバック特性）。
7. **fan-out 内部の再 emit** — `publication.handleUserDeletedEvent` は `changeVisibilityAndCascade` 経由で `note.publish_changed` / `share_link.revoked` を `collectEvents` する。これらは relay 経由で再 dispatch され、`note.publish_changed` は ADR-007 #145 の trashed status guard を通って search index に反映される。`share_link.revoked` は現状 dispatcher で skipped 維持（本 Issue 範囲外）。

## テスト方針

**自動テスト（Unit / vitest）:**

`dispatchDomainEvent.test.ts` に追加・書き換え:

- `note.purged` fan-out 順序検証（search → publication → media → view の callOrder）
- `note.purged` partial failure: 各 handler が transient で失敗するパターン x 3
- `note.trashed` fan-out 順序検証を search → publication → view の 3 順序に拡張
- `tag.deleted` → view handler が呼ばれて handled
- `tag.deleted` BusinessRuleError (`tagId = ""`) → handled + warn
- `tag.deleted` transient → retry
- `user.deleted` → publication + export の順 fan-out（callOrder）
- `user.deleted` partial failure: publication ok + export transient → retry
- `user.deleted` BusinessRuleError (`userId = ""`) → handled + warn
- `directory.deleted` / `media.uploaded` → skipped 維持（コメント更新）

**自動テスト（Integration）:**

既存の integration テスト群（`handlers.test.ts` や handler 単独 integration test）でハンドラ自体の動作は担保済み。本 Issue では dispatcher → handler の配線部分が主眼なので、unit テストでの routing 網羅 + 既存 integration テストで handler 動作担保 + 必要なら最小限の dispatcher integration test を追加する。

**手動確認:**

`.issue/159/testing.md` 参照。

**最終チェック:**

- `pnpm typecheck && pnpm lint:fix && pnpm format`
- `pnpm test:unit` / `pnpm test:integration` 全パス

## レビュー履歴

### 1周目

**視点1 (要件カバレッジ・スコープ整合性):** 問題点ゼロ

**視点2 (アーキテクチャ整合性・リスク):** 問題点 2 件 + 改善提案 4 件

**修正した点:**
- **P-001 (視点2)**: `note.purged` の partial commit リスクへの対応として、ADR-005「dispatcher の payload validation は switch-case 冒頭で全件先行実施」を新設。plan の実装ステップ 1 に「冒頭一括 validation → handler 順次呼出」の規約を明示。`note.purged` ケースで `NoteId.create` / `UserId.create` / `mediaRefs.map(MediaAssetId.create)` を冒頭で集約。`tag.deleted` / `user.deleted` ケースも同規約に従う。
- **P-002 (視点2)**: `media.handleNotePurgedEvent` の envelope 再構成方針を明示。dispatcher が受け取った `event: DomainEvent` を `as NotePurgedEvent` で type narrowing して渡す（payload field の validate は冒頭で済んでいるので envelope 全体の再構築は不要）。ADR-005 の Consequences 欄で明文化。

**取り込んだ改善提案:**
- **S-001 (視点2: `view.handleNotePurgedEvent` の VO バリデーション位置を ADR で明文化)**: ADR-005 で「dispatcher が validate を担い、handler 内部は cast 信頼」を明示
- **S-003 (視点1: `view.handleDirectoryDeletedEvent` の JSDoc コメント追加)**: ADR-003 を更新し、JSDoc 追記方針を明文化
- **S-004 (視点1: `user.deleted` の visibility timeout リスクを別 Issue 起票)**: スコープ「含まれないもの」と ADR-004 Consequences に「本 Issue Phase 4 で follow-up Issue を起票」と明記
- **S-003 (視点2: `share_link.*` skipped 維持のコメント明示)**: テスト方針に追加
- **S-004 (視点2: `view.handleDirectoryDeletedEvent` の処遇判断を別 Issue 起票)**: スコープ「含まれないもの」に「本 Issue Phase 4 で follow-up Issue を起票」と明記

**見送った提案とその理由:**
- **S-001 (視点1: `note.trashed` 経路の view 追加が `note.publish_changed` 再 emit と無関係である旨を一行加える)**: plan のリスクセクション #7 で `publication.handleUserDeletedEvent` の再 emit について触れているが、`note.trashed` の view fan-out 追加は `note.publish_changed` を再 emit する経路と独立しており（view 側の broken marker は publication の `note.publish_changed` 再 emit と無関係）、現状の記述で十分な明示と判断。
- **S-002 (視点1: `ownerId` の必須性検証)**: P-002 の修正で envelope は受信した `event` をそのまま `as NotePurgedEvent` cast する方針に変更したため、ownerId を改めて create する必要なし。冒頭 validation で `UserId.create(payload.ownerId)` は実施するが、これは payload schema drift の早期検出が目的（ADR-005）。
- **S-002 (視点2: search → view → publication の順序検討)**: ADR-001 で確立した「最後 = view」の一貫性を維持するため見送り（変更する利益が薄い）。

### 2周目

**視点1 (要件カバレッジ・スコープ整合性):** 問題点ゼロ
**視点2 (アーキテクチャ整合性・リスク):** 問題点ゼロ

→ **両視点ともに問題点ゼロ。レビューループ終了**。

**取り込んだ改善提案:**
- **S-001 (視点2: `note.trashed` の validation スコープ補足)**: 実装ステップ 1 に「ADR-005 の "全件 validation" は "handler が参照する field 全件" と解釈する」一文を追加。
- **S-002 (視点2: ADR-005 Decision 部の mediaRefs 未使用変数)**: ADR-005 Trade-offs に「`mediaRefs` map も同様、コメント `// validate-only, envelope は event cast で渡す` を添える」と追記。

**見送った提案とその理由:**
- **S-001 (視点1: 目的セクションにカバレッジマッピング表追加)**: 既に「目的」セクション末尾に「調査で判明した重要事実」と「含まれないもの」で対応方針が明示されており、レビュアー記述でも「必須ではない」とあるため見送り（情報の二重化を避ける）。
