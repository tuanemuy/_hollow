# PR Review #002 — feat(ui): 主要画面を <Suspense> ＋スケルトンで分割描画（#634 Phase 2）

**PR:** #646
**Date:** 2026-06-11
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 2
- Verdict: **BLOCKED**（Warning 残のため）

---

## Frontend / RSC

### Blockers
なし

### Warnings
- **[FE2-W-001]** `resetKey` の適用がホーム3境界のみ。同条件のスティッキーエラーが `NoteDetail`（noteId 変更）、`TagManager`（q/sort/order）、`ExportJobsList`（offset）、`TrashList`（page）に残る。→ 各ルートのローダー入力で `resetKey` を配線。

### Notes
- ラウンド1指摘（FE-W-001〜003 / AR-W-001〜002 / TS-W-001〜003）はすべて妥当に修正済みと検証。
- devtools は `^1.167.0` が正しい着地（router と別系列採番、peer 充足）。

---

## 規約・テスト・a11y

### Blockers
なし

### Warnings
- **[TS2-W-001]** `q` の trim 前処理が `schema.test.ts` で無テスト。→ `" memo "` → `"memo"`、`"   "` → `undefined`、非文字列素通しの3ケースを追加。

### Notes
- trim の既存挙動への影響（redirect ループ等）は確認済みで安全。Tailwind JIT も問題なし。
- レガシー SavedView の未 trim `q` 復元は理論上のエッジで対応不要（記録のみ）。

---

## Design Decisions

特になし。
