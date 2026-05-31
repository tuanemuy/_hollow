# PR Review #002 — fix(issue/296): root の loadAppContext をナビゲーションごとに発火させない

**PR:** #366
**Date:** 2026-05-31
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 3
- Verdict: **APPROVED**

---

## 再レビュー結果

`pnpm typecheck` グリーン、`biome check app/routes/__root.tsx` クリーン。

### Blockers
なし

### Warnings
- **[W-001]（前回）— 解消済み**
  `clientAppContext ??= loadAppContext().catch((error) => { clientAppContext = undefined; throw error; })` により、初回 fetch が reject した場合に `clientAppContext` が `undefined` に戻り、次回ナビゲーションでリトライされる。rejected promise 恒久キャッシュ → 自己回復不能の後退は解消。
  - 成功パス非影響: `.catch` callback は常に `throw`（戻り値 `never`）、resolve 値に触れず `{ config }` がそのまま伝播。typecheck グリーンが型 widening のないことを裏付け。
  - errorComponent 経路維持: `throw error` で再スローし、TanStack の errorComponent へ伝播。握り潰しなし。
  - 並行ナビゲーション: `??=` が inflight プロミスを即代入・共有するため二重 fetch なし。`undefined` への巻き戻しは reject 後のみで inflight 共有を壊さない。競合状態なし。
  - 既存の健全性（SSR バイパス・staleTime 削除・RSC 登録・hydration・context への積まれ方）は未変更で破壊なし。

### Notes
- **[N-001]** ADR-001 の「失敗時の挙動」追記は実装と完全一致。コメントも WHY のみで CLAUDE.md 方針に合致。
- **[N-002]** 厳密には「inflight + resolved を保持し reject 時のみクリア」という挙動で、二重 fetch 防止と失敗回復を両立する正しい設計。
- **[N-003]** PR 差分は `__root.tsx`（17行）と `.issue/296/` ドキュメントのみ。スコープは Issue #296 に収束。

---

## Design Decisions

特になし（ADR-001 に失敗時挙動を追記済み）。

---

## 完了

1ラウンドで Blocker 0・Warning 0 のクリーンを達成（review-guide Step 7 の完了条件）。APPROVED。
