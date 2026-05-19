# PR Review #002 — Tailwind v4 utility-first 移行（Issue #70）

**PR:** #71
**Date:** 2026-05-19
**Round:** 2回目（再レビュー）

---

## Summary

- Blockers: 0
- Warnings: 0
- Verdict: **APPROVED**

round-1 で挙がった 11 件の Warning がすべて解消され、新規の問題は発生していない。

---

## Re-review

### 各指摘の解消状況

- **W-F-001 (gap 統一)**: ✅ 解消 — `gap-[6px]` が app/ 全域で 0 件、`gap-1.5` に統一
- **W-F-002 / W-A-001 (backdrop-filter)**: ✅ 解消 — `admin/route.tsx` を `supports-[backdrop-filter]:` パターンに統一、`not-supports-` は app/ から消滅
- **W-F-003 (transition duration)**: ✅ 解消 — ADR-006 で許容方針明記
- **W-F-004 (data-* パターン)**: ✅ 解消 — ADR-003 に表記の選択ガイド + CLAUDE.md にも追記
- **W-F-005 (--text-base clamp)**: ✅ 解消 — ADR-001 を Accepted、Consequences に独自命名退避条件明記
- **W-S-001 (lint OOM)**: 環境問題、本 PR 範囲外として round-1 で扱い決定済み
- **W-S-002 (bp 同期)**: ✅ 解消 — CLAUDE.md Styling 節に同期ルール追記
- **W-A-002 (Sidebar active)**: ✅ 解消 — `activeProps` で `aria-current="page"` + `data-active=""`、`/` ルートには `activeOptions={{ exact: true }}` で prefix-match 防止
- **W-A-003 (data-primary="")**: ✅ 解消 — ADR-003 で「静的属性として OK」明記
- **W-A-004 (FilterBar 二重)**: ✅ 解消 — 子 span から `data-active` 削除、親側 `[[data-active]_&]:` に集約

### 新規の問題
なし

### 良い点
- ADR-005/006 を追加し設計判断を記録
- CLAUDE.md Styling 節が今後の規約逸脱を構造的に防止
- Sidebar の `activeOptions={{ exact: true }}` で prefix-match 問題に配慮
- `pnpm typecheck` / `pnpm build` グリーン（CSS bundle 55.6 KB 維持）

### Verdict
**APPROVED**

---

## Design Decisions

特になし（追加の ADR は不要）。
