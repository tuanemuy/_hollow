# PR Review #001 — feat(spec-sync): remove todo domain not defined in spec

**PR:** #39
**Date:** 2026-05-18
**Round:** 1回目

---

## Summary

- Blockers: 18（Infrastructure: 10, Test: 7, Frontend: 3、いずれも実装エージェントによるコミット漏れ）
- Warnings: 0
- Notes: 複数
- Verdict: **BLOCKED**（14ファイルがコミットされていなかった）

---

## Infrastructure

### Blockers
- **[B-001]** schema.ts から todos テーブル定義が未削除 — コミット漏れ
- **[B-002]** schema.ts:113 の todos コメントが未修正 — コミット漏れ
- **[B-003]** schema.ts:486 の todos.version コメントが未修正 — コミット漏れ
- **[B-004]** unitOfWork.ts(adapter) から D1TodoRepository 参照が未除去 — コミット漏れ
- **[B-005]** unitOfWork.ts(application) から TodoRepository が未除去 — コミット漏れ
- **[B-006]** eventRelayWorker.ts から TodoEvent/todoEventDecoders が未除去 — コミット漏れ
- **[B-007]** __root__.tsx から todo アクションインポートが未除去 — コミット漏れ
- **[B-008]** routeTree.gen.ts から todo ルートが未除去 — コミット漏れ
- **[B-009]** setup.ts から todos CLEAN_STATEMENTS が未除去 — コミット漏れ
- **[B-010]** mediaAssetRepository.ts の JSDoc が未修正 — コミット漏れ

## Test

### Blockers
- **[B-001]** occGuard.integration.test.ts が todos フィクスチャのまま — コミット漏れ
- **[B-002]** unitOfWork.integration.test.ts が todo フィクスチャのまま — コミット漏れ
- **[B-003]** helpers.integration.test.ts が todos のまま — コミット漏れ
- **[B-004]** outboxRepository.integration.test.ts が todo フィクスチャのまま — コミット漏れ
- **[B-005]** eventRelayWorker.integration.test.ts が todo フィクスチャのまま — コミット漏れ
- **[B-006]** handlers.integration.test.ts が todo フィクスチャのまま — コミット漏れ
- **[B-007]** setup.ts の CLEAN_STATEMENTS に todos エントリが残存 — コミット漏れ

## Frontend/Routing

### Blockers
- **[B-001]** routeTree.gen.ts から todo ルートが未除去 — コミット漏れ
- **[B-002]** __root__.tsx から todo インポートが未除去 — コミット漏れ
- **[B-003]** eventRelayWorker.ts から TodoEvent が未除去 — コミット漏れ

---

## 原因と対処

実装エージェントは変更済みファイルをステージしたが、コミット時に削除ファイル（30件）のみコミットされ、14の修正済みファイルが未ステージのまま残った。追加コミット `87b8817` で修正済み。

---

## Design Decisions

特になし
