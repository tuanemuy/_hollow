# PR Review #002 — fix: 共有リンクのパスワード失敗カウンタを永続化しロックアウトを発火させる (#560)

**PR:** #575
**Date:** 2026-06-08
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 5
- Verdict: **APPROVED**

---

## Test（再レビュー）

### Blockers
- なし

### Warnings
- なし

### Notes
- **[N-001]** W-001 解消を確認。ループ内 `i === 4` で `failedAttempts===4 && lockedUntil===null` を明示 assert。`recordFailedAttempt` の arm 条件 `nextAttempts >= maxAttempts(5)` に照らし、4回目は arm せず5回目で arm という境界をちょうど固定。各 attempt は独立 UoW で commit 済みのため再読込は安定（flaky なし）。
- **[N-002]** W-002 解消を確認。`versionBefore` を `Number(...)` で取り出し、成功後 `toBe(versionBefore + 2)` で厳密 assert。成功時は `resetFailedAttempts` → `recordAccess` の2回で各々 `Version.next` する。事前に2回失敗させた状態から成功させるため `resetFailedAttempts` の no-op 早期 return には該当せず、確実に2 saves 分進む。+2 は実装と整合。
- **[N-003]** `Number()` 変換は妥当。reload 値同士を同一変換で比較するため型不一致による誤判定なし。
- **[N-004]** 5回目の `lockedUntil` 完全一致 assert と6回目の早期 `share_link_locked` throw 検証は固定 clock で flaky なし。
- **[N-005]** 新たな脆さの混入なし。#560 回帰検出力も維持。`pnpm test:integration resolveShareLink` で 5 passed をローカル再確認。

## Use Case

Round 1 で Blocker 0 / Warning 0（クリーン）。本ラウンドで Use Case 層に変更なし（修正はテストファイルのみ）のため再レビュー対象外。

---

## Design Decisions

特になし（ADR-001 / ADR-002 で既出。新規の設計判断は発生せず）。

---

## 完了判定

Blocker 0 件 / Warning 0 件。1ラウンドクリーンで **レビュー完了（APPROVED）**。PR を Ready for review に切り替える。
