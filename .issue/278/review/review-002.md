# PR Review #002 — test(ingestion): IngestionQueue polling 専用テストの追加

**PR:** #410
**Date:** 2026-06-02
**Round:** 2回目（再レビュー）

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 3
- Verdict: **APPROVED**

---

## General Review

### Blockers
- なし

### Warnings
- なし

### Notes

- **[N-001]** W-001 解消済み。シナリオ5末尾に `await advance(POLL_INTERVAL_MS); expect(fetchJobsMock).toHaveBeenCalledTimes(2);` を追加し、`finally` での `inflightRef` クリア（本体 `IngestionQueue.tsx:118-120`）の regression を検出できるようになった。ミューテーション検証（finally を no-op 化 → 当該テスト赤化）で実効性を確認。元状態では 7/7 PASS。
- **[N-002]** 再レビュー時点で修正が未コミットだった旨の指摘 → 本レビュー後にコミット & push 済み。
- **[N-003]** 追加3行以外に変更なし。カバレッジ後退・他テスト汚染なし。新規 Blocker / Warning なし。

---

## Design Decisions

特になし。
