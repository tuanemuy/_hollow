# PR Review #004 — feat(media): retry stuck `deleting` orphans in purge sweep

**PR:** #352
**Date:** 2026-05-30
**Round:** 4回目（収束確認 / 2ラウンド連続クリーン達成）

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 5（すべて情報・健全性確認、対応不要）
- Verdict: **APPROVED**

---

## 独立敵対レビュー結果

ゼロベースで「マージしてはいけない理由」を探索したが、Blocker・Warning ともゼロ。

- 並行性: 取得時スナップショット `candidate` + 1st UoW の `findById` 再読の二段構えで TOCTOU を排除。`deleting` 行は `incrementRef` のシグネチャ（`PendingMedia | AttachedMedia`）により型レベルで再 attach 不可。
- 2nd UoW: `storage.delete`（R2 冪等）→ `repo.delete` + `media.purged` を同一 `db.batch()` でアトミックコミット。`media.purged` 先行発火なし。
- `recoverable` 分類（`StorageNotFoundError` も含む）は伝播実装と整合。
- spec 取り残し: `spec/`・`app/` 本体に旧名 0 件。残存は無関係 Issue の過去ドキュメントと本 Issue 自身の ADR/plan のみ（意図的）。
- テストは resume 不変条件・猶予 skip・stuck 再試行・R2 復旧 e2e・混在バッチを正しく pin。偽陽性なし、時刻計算妥当。

`pnpm typecheck` クリーン、対象テスト全 PASS。

---

## 収束判定

- review-003（3回目）: Blocker 0 / Warning 0
- review-004（4回目）: Blocker 0 / Warning 0

→ **2ラウンド連続クリーンで収束。レビュー完了（最終ステータス APPROVED）。**
