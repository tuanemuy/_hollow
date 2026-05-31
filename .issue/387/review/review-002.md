# PR Review #002 — fix(note): サイドバーのディレクトリ選択をノート一覧に反映する

**PR:** #391
**Date:** 2026-06-01
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 確認系のみ
- Verdict: **APPROVED**

---

## Test（再レビュー）

#### Blockers
- なし
#### Warnings
- なし
#### Notes
- **W-001 解消。** count 専用ブロックに `returns count > limit reflecting only the directory's direct children` を追加。`LIMIT=2 / DIRECT_TOTAL=3`、root 直下3件＋child 1件で `notes.toHaveLength(2)` かつ `count===3`、子ノートが count に混入しないことをガード。既存の `limit:50`（count≤limit）ケースと相補的。
- Pick 回帰は「型（typecheck）＋ランタイム（本テスト）」の二段構えで成立することを確認。テストコメントもこの二段構えを正確に反映するよう修正済み。

## Frontend（再レビュー）

#### Blockers
- なし
#### Warnings
- なし
#### Notes
- **N-005 解消。** `directoryName ?? "ディレクトリ"` → `directoryName || "ディレクトリ"`（1行）。出所一致ガードの三項式構造は維持。`directoryName: string | undefined` の falsy は `undefined`/`""` のみで、いずれも汎用ラベルへ落ちるのが正しく副作用なし。

---

## Design Decisions

特になし。

## 結論

1周目の Test W-001・Frontend N-005 を修正し、2周目で Blocker 0 / Warning 0 を確認。**APPROVED**。Ready for review に切り替える。
