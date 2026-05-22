# PR Review #002 — docs(spec): align testcases wording with implementation behavior (#43)

**PR:** #161
**Date:** 2026-05-23
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 3
- Verdict: **APPROVED**

---

## General Review (Round 2)

### Blockers

なし

### Warnings

なし

### Notes

- **[N-001]** W-001 の修正は完全に反映。`spec/testcases/note/index.md:12` は `SystemError(DataIntegrityError)`、`spec/testcases/media/index.md:9` は `SystemError(ExternalApiError)` に書き換え済みで、`spec/usecases/adminSettings.md:150` の `SystemError(DatabaseError)` 流儀と整合。CLAUDE.md「`SystemErrorCode` is the sole exception and stays UPPER_SNAKE」の規約とも、PR 目的「実装挙動と一字違わず一致」とも整合。
- **[N-002]** Round 2 で追加された commit は spec 2 ファイル（+2/-2）と `.issue/43/review/review-001.md` の追加のみ。実装ファイル（`uploadFile.ts` / `errorCode.ts`）には触れておらず、変更範囲は最小限。
- **[N-003]** Markdown テーブル列数の維持・レンダリング崩れなしを再確認。追加の懸念事項は検出されない。

---

## Design Decisions

特になし
