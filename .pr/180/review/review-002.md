# PR Review #002 — dispatch: complete fan-out routing

**PR:** #180
**Date:** 2026-05-23
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 8
- Verdict: **APPROVED** （全 blocker / warning 解決、2 連続クリーン達成）

---

## Routing Logic

### Blockers

なし

### Status Check: Round 1 Feedback 対応状況

**[B-001] note.trashed ADR-005 comment**: **✅ 解決**
- 場所: `dispatchDomainEvent.ts:171-175`
- 修正内容: note.trashed case に「=== Issue #159 ADR-005: validation 一括先行 ===」comment block を追加
- 実装: noteId VO validation を handler 呼出前に先行実施、partial-commit リスク除外を明示
- note.purged case との comment style 一貫性が確保されました

**[W-001] handler raw string input pattern documentation**: **✅ 解決**
- 場所: `.issue/159/adr.md:184-185` (ADR-005 Consequences)
- 実装: view handler が raw string input を受け取り、内部で `as NoteId` cast する設計を documented
- dispatcher は validation 後も VO ではなく raw string を渡す理由が明記（CLAUDE.md 「信頼」原則、リスク #5）

### Warnings

なし

### Notes

**[N-001]** ADR-005「validation 一括先行」の comment 統一
- `note.trashed` (line 171-175): ADR-005 section header + partial-commit リスク説明
- `note.purged` (line 197-200): ADR-005 section header + validation 全件実施の説明
- `tag.deleted` (line 226-227): validate-only comment + handler 呼出
- `user.deleted` (line 235): UserId.create + fan-out comment
- すべての新規 wired case で一貫した pattern と明確な ADR reference を確認

**[N-002]** Test coverage の完全性
- `note.trashed` fan-out: 正常系（3-handler callOrder）+ partial failure（publication transient, view transient）+ payload validation failure（noteId=""）
- `note.purged` fan-out: 正常系 + 4 つの partial failure パターン + 2 つの validation failure パターン（noteId, ownerId, mediaRefs）
- 全 case で「validation 失敗時に handler が 1 つも呼ばれない」を assert（ADR-005 intent）

**[N-003]** ADR-003「directory.deleted / media.uploaded skip」の dual-side documentation
- `handleDirectoryDeletedEvent.ts` (line 14-23): JSDoc で「本 handler が dispatcher に wired されていない」理由を詳細に documented
- `dispatchDomainEvent.test.ts` (line 1040-1044): skipped regression guard の comment を「physical event 非実在」で更新
- `spec/domains/index.md`: 購読対応表の行に注記を追加（spec ↔ implementation 相互参照）

**[N-004]** Handler 入力型の heterogeneity が正しく設計されている
- `publicationHandleNotePurgedEvent`: VO type (`{ noteId: NoteId }`)
- `mediaHandleNotePurgedEvent`: full event envelope (`{ event: NotePurgedEvent }`)
- `viewHandleNotePurgedEvent` / `viewHandleTagDeletedEvent`: raw string (`{ noteId: string }` / `{ tagId: string }`)
- dispatcher 側で validation 一括先行するため、VO cast の代わりに raw string をそのまま渡す設計（handler 側で `as` cast）

**[N-005]** Fan-out 順序の理由が明確に documented
- `note.trashed`: search delete first → index 一貫性優先 + publication re-emit 安全性 → view last（ADR-002）
- `note.purged`: search → publication → media → view（ADR-001 の 4-handler 順序）
- `user.deleted`: publication → export（ADR-004 の「公開停止 → export 取消」論理順）

**[N-006]** Spec / implementation / test の triple sync が完成
- spec/domains/index.md: 購読対応表の全行が実装・comment と対応
- handler import: aliased imports で naming collision を回避（`as publicationHandleNotePurgedEvent` 等）
- test comment: physical event 非実在（directory.deleted, media.uploaded）と新規 routing（note.purged, tag.deleted, user.deleted）を区別

**[N-007]** Round 1 → Round 2 の修正が surgical（最小限）
- comment block 追加のみで実装変更なし
- 既存 test は変更なし（全 case で既に充分な coverage）
- ADR.md の内容も追加（W-001 対応）

**[N-008]** Error classification が全 case で一貫
- BusinessRuleError（validation 失敗）→ `handled+warn`、handler 未実行保証
- transient error（D1 timeout 等）→ `retry`、queue redelivery で冪等に収束
- 既存パターン踏襲、新規 case でも同じ error handling

---

## Test Design

### Blockers

なし

### Warnings

なし

### Notes

- **[N-001]** Partial failure test が各 case の「後続 handler が呼ばれない」を明示的に assert
- **[N-002]** Envelope 渡し pattern（media handler）を明示的に検証：`mediaCallArg?.input.event === event`
- **[N-003]** Validation failure（BusinessRuleError）時に全 handler が skip されることを確認（ADR-005 intent）

---

## Spec Sync

### Blockers

なし

### Warnings

なし

### Notes

- **[N-001]** 購読対応表の note.trashed / note.purged / tag.deleted / user.deleted 行が完全に実装・comment と同期
- **[N-002]** 「physical event 非実在」（directory.deleted, media.uploaded）が spec 文言と dispatcher skip comment で double documented
- **[N-003]** Handler dormancy（view.handleDirectoryDeletedEvent）が JSDoc + spec コメント + test コメントで層厚く documented

---

## Round 1 → Round 2 修正サマリー

| 項目 | Round 1 | 修正内容 | Round 2 |
|---|---|---|---|
| B-001: note.trashed ADR-005 comment | 未実装 | comment block 追加（ADR-005 + partial-commit risk） | ✅ 解決 |
| W-001: handler input pattern doc | 未記載 | ADR-005 Consequences に documented | ✅ 解決 |
| 実装の正当性 | 合格 | 修正なし | 合格 |
| テスト網羅 | 合格 | 修正なし | 合格 |
| Spec 同期 | 合格 | 修正なし | 合格 |

---

## 最終判定

**PR #180 は APPROVED です。**

- 2 連続ラウンドで Blocker 0 / Warning 0 を達成
- Round 1 の全指摘（B-001, W-001）が解決
- 実装・テスト・spec の整合性完全
- dispatcher routing の 4 event（note.purged, note.trashed, tag.deleted, user.deleted）が ADR に従い完全に wired

次ステップ: PR を Ready for Review に切り替えて approve。
