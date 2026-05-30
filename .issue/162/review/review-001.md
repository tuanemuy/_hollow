# PR Review #001 — feat(media): retry stuck `deleting` orphans in purge sweep

**PR:** #352
**Date:** 2026-05-30
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 3（実質2系統: イベント発火の重複/欠落 と テスト/ドキュメントの記述ずれ）
- Notes: 多数
- Verdict: **APPROVED (with warnings to address)**

---

## アプリケーション層・ドメインロジック

### Blockers
なし

### Warnings
- **[W-001]** resume パスで `media.deleting` consumer が起動しない帰結が未記録 / `purgeOrphans.ts:72-75` / 確信度: 中
  - resume パス（`isDeleting(fresh)` → そのまま返す）では `media.deleting` を再発火しない（ADR-003 の正しい判断）。ただし `media.deleting` に副作用を持つ consumer がいる場合の帰結を ADR に明記すべき。
- **[W-002]** overlapping tick で `media.purged` イベントも二重発火し得る点が ADR-003 で未記載 / `purgeOrphans.ts:81-90` / 確信度: 高
  - ADR-003 は `purged` カウント二重計上には触れるが `media.purged` 二重発火に触れていない。consumer 冪等性で吸収される旨を一行追記すべき。

### Notes
- N-001〜005: 分岐網羅・リース不変条件・リネーム追従・JSDoc 整合いずれも健全。

## アダプター層・DB

### Blockers / Warnings
なし

### Notes
- where 句・inArray 型・orderBy 順序・status enum（CHECK 制約 `media_status_enum` に orphan/deleting 双方あり）・複合インデックス `idx_media_status_updated(status, updated_at)`・リネーム追従、すべて健全。フルスキャン化しない。

## テスト・spec

### Blockers
なし

### Warnings
- **[W-1]** resume パスの「`media.deleting` 再発火なし／`media.purged` は1回」がテストで pin されていない / `purgeOrphans.integration.test.ts` retry 系 / 確信度: 中〜高
  - 現状テストは purged/failed カウントと行有無のみ。Option A の核心「deleting resume で re-mark しない」がアサートされておらず、誤って `markDeleting` を再実行するリグレッションが入っても全テスト緑のまま通過する。outbox 行を読みイベント回数を検証すべき。

### Notes
- **[N-1]** `testing.md` のエッジケース記述が不正確 / 根拠 `service.ts:101-102`, `service.test.ts:299`
  - 「resume パスで R2/DB delete が `StorageNotFoundError` を無視し DB delete まで到達」と書くが、`MediaService.purge` は NotFound を**伝播**する（`service.test.ts:299` が pin）。冪等性が成り立つ実際の根拠は R2 アダプターの `bucket.delete` が存在しないキーでも成功する点 + 1st UoW の行ガード。
- **[N-2]** `MediaService.purge` の JSDoc（`service.ts:86-89`）が「`StorageNotFoundError` is swallowed」と書くが実装は伝播。本 PR 対象外の既存問題だが N-1 の混乱の根源。
- **[N-3]** 既存テスト・spec のコメント/文言更新は正確。ADR-004 #15 の乖離は解消済み。
- **[N-4]** ヘルパー設計・時刻計算は妥当（猶予期間=再試行間隔を実体検証）。
- **[N-5]** orphan + stuck deleting 混在バッチの e2e テストが無い（優先度低）。

---

## Design Decisions

- W-002 を受け ADR-003 に `media.purged` 二重発火の帰結を追記する。
- N-1/N-2 を受け `MediaService.purge` の JSDoc を実装（伝播）に合わせ修正し、testing.md の冪等性根拠を正す（同一ファイル/動線のため本 PR で対応）。
