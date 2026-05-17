# PR Review #002 — fix(d1): eliminate inArray bind-limit risk in noteRepository

**PR:** #44
**Date:** 2026-05-18
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 2 → すべて反映済み (Test: 2)
- Notes: 多数
- Verdict: **APPROVED**

---

## Infrastructure / Performance

### Blockers
なし

### Warnings
なし

### Notes
- W-INF-002 解消: `select({ noteId: publicationStates.noteId })` で `outboxRepository` パターンに整合
- W-INF-003 / W-PERF-001 解消: `Promise.all(chunks.map(runner))` で並列化、`loadChildren` の 3 並列効果が内側でも保たれる
- W-INF-004 解消: `(await Promise.all(...)).flat()` で `push` ループ消失
- W-INF-006 / W-PERF-002 解消: ADR-001 補足 (status pre-filter trade-off)、ADR-003 Follow-up に findReferrers unbounded を明記

---

## Test

### Blockers
なし

### Warnings (Round 2 で新規発見 → このラウンドで反映)

- **[W-TEST-R2-001]** T-bind-005 のタイブレーカが chunk 境界を踏まない
  - 反映: T-bind-006 を新規追加。120 件 referrer (60 + 60、各群同 `updatedAt` ms 共有) で SAFE_CHUNK_SIZE=90 の seam を straddle し、JS sort が chunk concat 後に `(updatedAt DESC, id DESC)` を維持することを検証

- **[W-TEST-R2-002]** `_chunks.test.ts` の reject テストで parallel 契約が assertion 化されていない
  - 反映:
    - `_chunks.ts` JSDoc に「first rejection wins; sibling chunks may still settle」を明記
    - `_chunks.test.ts` reject テストに `expect(runner).toHaveBeenCalledTimes(3)` を追加し、parallel dispatch の事実を assertion として固定

### Notes
- N-TEST-R2-001〜006: Round 1 Warning は全て適切に反映済み
- N-TEST-R2-008: T-bind-005 の seedNote(target) が referrer 列挙対象外であること = `findReferrers` の semantics（自分自身は含まない）に依拠 — 既存実装で担保済み

---

## Design Decisions

- **`Promise.all` 並列化に伴う「reject 時の sibling chunk 完走」契約**: 元 review-001 W-TEST-006 は「reject 後 chunk 停止」を想定していたが、設計 pivot で全 chunk 同時 dispatch に変わったため、parallel 実装の正しい契約として JSDoc + テスト assertion で明示
- **chunk 境界 tie-break テスト (T-bind-006)**: T-bind-005 (10件) は chunk 境界を踏まないが、JS sort が全 chunk concat 後に走る実装である以上機能的には同値。回帰防御強化のため境界 straddle 版を追加
