# PR Review #002 — refactor: normalize ErrorCode naming convention across domains

**PR:** #129
**Date:** 2026-05-21
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 7
- Verdict: **APPROVED**

---

## Test (Round 2)

#### Blockers
- なし

#### Warnings
- なし

#### Notes

- **[N-001]** W-001 修正は提案通り `EXPECTED_ERROR_CODE_NAMES` Set との `toEqual` 等価比較に置換。実ファイル列挙（11 件）と完全一致
- **[N-002]** W-002 修正は `entries.length > 0 && entries.every(...)` のショートサーキットで空オブジェクトを正しく除外。多層防御として整合的（空マップは W-001 の Set 比較でも検出される）
- **[N-003]** 48-65 行のコメントは将来ドメイン追加時の意図を WHY として記述しており CLAUDE.md の "comment only when WHY is non-obvious" 原則に合致
- **[N-004]** 各 `errorCode.ts` の export は `*ErrorCode` const + 同名型のみで、`pickErrorCodeMap` が誤って別 export を拾う余地はない
- **[N-005]** Vitest の `toEqual` は `Set` を集合等価で比較するため glob の列挙順に依存せず堅牢
- **[N-006]** 既存テスト（regex 自己検証 / per-key・value 動的生成）への影響なし。`pnpm test:unit` 1981 件 PASS と整合
- **[N-007]** W-001/W-002 ともに review-001 の提案文と完全に一致する形で解消されており、過修正・未修正なし

---

## Design Decisions

特になし。

---

## 補足: 環境問題

- `pnpm lint` (biome) がメモリ枯渇で異常終了する事象を確認。`git stash` で本ブランチの全変更を退避した状態でも再現するため、本 PR とは無関係の環境問題と判断
- `pnpm format:check`（biome format）、`pnpm typecheck`（tsgo）、`pnpm test:unit` (1981) / `pnpm test:integration` (352) / `errorCodeNaming.test.ts` (397) は全て PASS
- biome lint のメモリ問題は別 Issue として扱う候補（Phase 4 で起票判定）
