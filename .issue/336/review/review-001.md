# PR Review #001 — refactor(styles): nav-item リンクを common に集約し死蔵 pill を削除

**PR:** #415
**Date:** 2026-06-02
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 8
- Verdict: **APPROVED**

---

## Frontend / Styling

#### Blockers
- なし

#### Warnings
- なし

#### Notes
- **[N-001]** 視覚回帰ゼロを厳密検証。変更前後の最終 utility トークン集合をスクリプトで集合比較し、`NAV_ITEM`（19トークン）・`TREE_ITEM_LINK`（18トークン）とも PRE/POST 完全一致（missing 0 / added 0 / 重複 0）。NAV_ITEM の `relative`/`hover:bg-surface`/active `bg-surface` は add-on に保持。TREE_ITEM_LINK は `flex-1 min-w-0 truncate` + active `font-medium` を保持し、背景トークンを誤って足していない（行ハイライトは TREE_ITEM_ROW が描く設計を温存）。
- **[N-002]** 上書き競合なし。add-on が触るプロパティは base と非重複。トークン集合が PRE と同一なので生成 CSS は結合順非依存で変更前と一致（ADR-001 の主張どおり）。
- **[N-003]** 死蔵 `ROW_ACTIONS_SMALL_PILL` は consumer 0 件確認。削除は安全。
- **[N-004]** import 一方向（common→何も import しない、layout/directory が common から navItem）。循環なし。
- **[N-005]** 命名 `navItem` は既存 camelCase primitive と一貫。JSDoc は WHY を記述（CLAUDE.md 準拠）。
- **[N-006]** CLAUDE.md Styling 原則準拠（utility-first / トークン経由 / data-* variant / 新規トークン追加なし）。
- **[N-007]** ADR-001（背景の base 除外）・ADR-002（public PILL_BTN 据え置き）とも妥当。#273 のスコープ判断を踏襲。
- **[N-008]** JSX consumer は定数名維持で diff ゼロ。typecheck・biome ともクリーン。

---

## Design Decisions

特になし（既存 ADR-001 / ADR-002 で網羅済み）。
