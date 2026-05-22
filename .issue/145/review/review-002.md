# PR Review #002 — feat(issue-145): wire note.* / publication.* dispatch and IndexJob drainer

**PR:** #156
**Date:** 2026-05-23
**Round:** 2回目（最終）

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 多数
- Verdict: **APPROVED**

round 1 で挙げた 1 Blocker + 11 Warnings はすべて適切に解消され、副作用や新規問題の混入なし。typecheck / lint / format / unit / integration すべて pass。本 PR はマージ可能な状態。

---

## round 1 指摘の修正状況（12/12 完了）

| 項目 | 対象ファイル | 確認結果 |
|---|---|---|
| B-S-001 | `spec/domains/index.md` event 購読表 | 4 列 × 9 行で正しく揃い、全行 4 セル |
| W-S-001 | `spec/domains/search.md:50` | dispatcher 経路（findById + buildNoteSnapshots）に書き換え済み |
| W-DA-001 = W-S-002 | port / adapter / spec の `nextBatch` シグネチャ | 3 ヶ所すべて `nextBatch(limit, now, maxAttempts)` で一致 |
| W-S-003 | `docs/runtime_cloudflare.md` DLQ コマンド | `<d1-database-name>` プレースホルダ + Pulumi 命名注記 |
| W-S-004 | `INDEXER_*` チューニング | docs に説明と default 値（50 / 20）追加 |
| W-I-001 | "four sibling Workers" | "five" に修正 |
| W-I-002 | `infra/src/secrets.ts` indexer コメント | ADR-007 #110 への参照を追加 |
| W-A-001 | integration test 名 | 「handles note.trashed dispatch ...」に修正 |
| W-A-002 | `processIndexJobs` per-row catch カウンタ | `unexpectedFailures` 分離 + `logger.error` のメタに `outcome: "unexpected"` タグ |
| W-A-003 | batch short-circuit コメント | 追加済み |
| W-T-001 | dlq outcome テスト | 追加済み |
| W-T-002 | per-row tolerance テスト | 追加済み |
| W-DA-002 = W-T-003 | D1 adapter integration test | `indexJobRepository.integration.test.ts`（5 シナリオ）新規 |

## 副作用 / 新規問題

- `ProcessIndexJobsResult` への `unexpectedFailures` 追加が `runIndexJobTick` のログ文字列・early-return パス両方に正しく伝播
- port / adapter / spec の 3 ヶ所で `nextBatch(limit, now, maxAttempts)` シグネチャ一致
- 新規テストは固定 seed で共有状態回避、flaky 化していない

## 自動テスト最終結果

| Check | Result |
| --- | --- |
| `pnpm typecheck` | pass |
| `pnpm lint:fix` | clean (4 pre-existing warnings in unrelated files) |
| `pnpm format` | clean |
| `pnpm test:unit` | 116 files / 2277 tests pass |
| `pnpm test:integration` | 34 files / 380 tests pass |

## Design Decisions

このラウンドで見つかった新規設計判断は特になし。`unexpectedFailures` カウンタの分離は ADR ではなくロギング詳細の改善として扱う（review-001 で既に判断済み）。

---

## 完了

レビューループ 2 ラウンドで「問題点ゼロ」に到達。Phase 4（スコープ外 Issue 起票）に進む。
