# PR Review #003 — feat(media): retry stuck `deleting` orphans in purge sweep

**PR:** #352
**Date:** 2026-05-30
**Round:** 3回目（収束確認）

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 2（いずれも意図された設計判断 / 既存スタイル、対応不要）
- Verdict: **APPROVED**

---

## 最終確認

- `grep -rn "findOrphansOlderThan\|listOrphanCandidates" spec/ app/` → 旧名 0 件。新名は spec/domains・spec/usecases・port/adapter/service/test すべてに反映。
- `pnpm typecheck` パス、統合 7/7・ドメイン unit 23/23 PASS。
- 過去ラウンドの全指摘（W-001/W-002/W-1 round1/N-1/N-2/W-1 round2）解消を確認。
- コード ⇔ spec ⇔ テストの一対一整合を確認（testcases 4 行 ↔ 統合テスト 7 本）。

## Notes
- **[N-1]** 混在バッチテストの `void orphanId/deletingId` はファイル既存スタイル踏襲で問題なし。
- **[N-2]** 無制限再試行（ADR-002）/ overlapping tick 二重計上（ADR-003）は本 Issue スコープ外（#58 へ委譲）として明示記録済み。残存課題ではなく意図された設計判断。

---

## Design Decisions
特になし（前ラウンドまでで確定）。
