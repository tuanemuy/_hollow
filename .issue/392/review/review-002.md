# PR Review #002 — feat(issue/392): ディレクトリ絞り込みをサブツリー一致に揃える

**PR:** #395
**Date:** 2026-06-01
**Round:** 2回目（W-A-001 修正後の確認）

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 1（確認結果）
- Verdict: **APPROVED**

---

## Adapter（round 2 確認）

### Blockers
なし

### Warnings
なし

### Notes
- round 1 の W-A-001（小集合パスのコメントが host-var 余裕を「well under the cap」と楽観表現）はコメントのみの修正で解消。差分は挙動非変更（`<= SAFE_CHUNK_SIZE` 分岐・フォールバックともそのまま）。
- 修正後コメントの host-var 会計を実装と照合し全一致を確認:
  - 小集合 `inArray` = `directoryIds.length`（<= SAFE_CHUNK_SIZE=90）
  - 同一文に owner(1) + status(1) + dateRange(<=2) + visibility NOT EXISTS サブクエリ(<=3、noteId 相関は列対列で 0 bind) が重畳
  - worst case 90+1+1+2+3 = 97 < `D1_BIND_LIMIT_HOST_VARS`=100
  - `_chunks.ts` の SAFE_CHUNK_SIZE / D1_BIND_LIMIT_HOST_VARS の定義・JSDoc 設計意図と整合
- 新規の問題なし。

---

## Design Decisions

特になし。

## 完了判定

Round 2 で Blocker 0 / Warning 0。レビュー完了（APPROVED）。PR を Ready for review に切り替える。
