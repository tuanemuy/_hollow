# PR Review #001 — feat(#181): directory deletion marks SavedView broken

**PR:** #332
**Date:** 2026-05-29
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 多数（良い点・整合性確認）
- Verdict: **APPROVED**

レイヤー: Domain & Application / Test / Architecture Consistency & Risk の3観点で並列レビュー。全レイヤーで Blocker・Warning ともにゼロ。1ラウンドクリーンで完了。

---

## Domain & Application

#### Blockers
なし

#### Warnings
なし

#### Notes
- [N-001] `directory/events.ts` は `tag/events.ts` と完全同型。`DirectoryDeletedEvent`、`DirectoryEvent` union、`DirectoryEvents.deleted`（`aggregateId: directoryId`）、payload は `directoryId` のみ。ADR-001 / plan ステップ1 に厳密準拠。
- [N-002] `deleteDirectory.ts` のイベント発行は正しい。`deletedDirectoryIds` を `note.trashed` drafts と同一配列に push し、UoW コールバック内・commit 前の単一 `collectEvents(drafts)` に合流。同一 UoW・同一 outbox バッチでトランザクショナル。`now` は clock.now() を一度取得し全 draft 共有で決定的。
- [N-003] dispatcher `case "directory.deleted"` は ADR-159-005 準拠。`void DirectoryId.create` を handler await の前に実行し schema drift を BusinessRuleError として先行検出。tag.deleted と同型。
- [N-004] dispatcher JSDoc 更新が正確。directory.deleted の routing 追記、media.uploaded skipped を別記述に分離。
- [N-005] decoder + relay 配線に漏れなし。strict schema、AllDomainEvents union 追加、registry spread、`satisfies` でコンパイル時網羅保証。
- [N-006] handleDirectoryDeletedEvent.ts は本体未変更で JSDoc のみ更新。実態と一致。
- [N-007] 冪等性・at-least-once 耐性を担保。typecheck クリーン。

## Test

#### Blockers
なし

#### Warnings
なし

#### Notes
- [N-001] 計画のテスト方針が全項目実装済み。unit 61件 + integration 21件 全 PASS を確認。decoder（欠落/型不一致/unknown key の3パターン）、dispatcher（handled routing / 空白 directoryId → BusinessRuleError handled / transient retry、`as never` 除去、media.uploaded skipped 残存）、view handler（冪等 no-op 追加）、integration（空ディレクトリ1件・サブツリー3件、挙動変更前アサーション正しく更新）。
- [N-002] 空 directoryId ケースは「空白のみ（`"   "`）」採用。decoder（z.string() 通過）→ dispatcher 層 VO 化で初めて落ちる、という2層区別を正しく突いている。
- [N-003] relay→dispatch→findReferencingDirectory の実 DB E2E は未実装だが、既存 tag.deleted 経路にも同種 E2E はなく確立パターンと一貫。in-memory fake repo で handler ロジックは十分カバー。許容範囲。
- [N-004]（任意・非Warning）directory handler テストはマッチ view 1件のみ seed。非マッチ view の negative アサートは無いが、同一 in-memory repo で tag.deleted テストが filter selectivity を既に証明済みのため実害なし。directory でも非マッチ view を1件足すと完結度が上がる（任意）。

## Architecture Consistency & Risk

#### Blockers
なし

#### Warnings
なし

#### Notes
- [N-001] Outbox/UoW 整合が正しい。サービス層は発行せず directoryId リストを返すのみ。`deleteSubtree` はコミット対象（実際に delete を呼んだ）ノードのみ push するため「コミット済み削除だけがイベント化」がトランザクショナルに保証。
- [N-002] サブツリーで directoryId 重複イベントなし。post-order DFS で1ノード1回訪問、integration が件数3 + 一意性（Set 等価）をアサート。
- [N-003] 冪等性 / at-least-once 担保。BrokenConditionMarker collapse + OCC expectedVersion で再配信 no-op。
- [N-004] ADR-159-005 準拠は単一 handler でも正しく適用。
- [N-005] spec 同期が実装と一致。2経路併存・marker 種別差・ADR-159-003 supersede を正確に記述。
- [N-006] エッジケース/副作用適切。空文字 directoryId、削除順序非依存、Outbox 行数増（ADR 明記）、media.uploaded 未変更。
- [N-007] スコープは Issue #181 の意図に集中。SavedView ドメイン・repository・ViewQuery・BrokenConditionMarker への変更ゼロ。過剰実装なし。
- [N-008]（情報）dispatcher は validate に trim 後値、handler には raw 値を渡す raw-passthrough 規約（既存 tag.deleted / note.purged と同一）。有効 UUID に空白は付かず実害なし。新規退行ではない。

---

## Design Decisions

このラウンドで新たに見つかった設計判断: 特になし（ADR-181-001 = 案A 物理イベント発行で確定済み）。
