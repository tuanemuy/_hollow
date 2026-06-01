# PR Review #001 — テキスト併記が冗長なボタンをアイコンのみに整理する (#382)

**PR:** #402
**Date:** 2026-06-01
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 8
- Verdict: **APPROVED**

---

## General Review

複雑度「小規模」のため General Review 1本で実施。

### Blockers
- なし

### Warnings
- なし

### Notes
- **[N-001]** スコープと計画の整合は完全。高優先度4件（NoteActions の編集 `Pencil` / 複製 `Copy`、NoteListToolbar の新規作成 `Plus` / アップロード `Upload`）のみアイコンのみ化、中・低優先度はテキスト維持（ADR-002 どおり）。スコープ逸脱なし。
- **[N-002]** a11y は ADR-001 / Icon.tsx の JSDoc 規約に正しく従う。4箇所すべて親要素に `aria-label`、`Icon` には `label` を渡さず装飾（`aria-hidden`）。`UploadButton` は `aria-label` を `<a>` へ正しく中継。accessible name の二重化なし。
- **[N-003]** `title` 付与は ADR-003 どおり。直接 `<button>`/`<Link>` を持つ3箇所（編集・複製・新規作成）に `title`、`UploadButton` は中継しないため `aria-label` のみ（意図的例外）。
- **[N-004]** 編集ボタンのプライマリ配色維持を確認（`data-primary` + `pillBtnPrimary` の `data-[primary]:` variant 駆動）。`pillBtn` は `px-4 h-9` のままでアイコンのみでもゼロ幅に潰れない。
- **[N-005]** `CTA_LABEL` は「選択」「ビューとして保存」で継続使用、未使用定数・未使用 import の残留なし。
- **[N-006]** 追加テストは a11y 契約（aria-label あり・textContent 空・svg あり・title 値）を検証、回帰価値あり。実 Icon を使用しモックは最小限。
- **[N-007]** （任意改善）svg 側に aria-label が無い＝二重化していないことを直接アサートすると ADR-001 の核心まで回帰捕捉できる → **本ラウンドで取り込み済み**（両テストに `expect(svg?.getAttribute("aria-label")).toBeNull()` を追加）。
- **[N-008]** manual-test レポート（TC-001/TC-002 とも PASS、確認項目11件）同梱。表示・a11y 確認に留まり memory の制約と整合。

---

## 対応

- N-007 を本ラウンドで反映（テスト強化、Blocker/Warning ではないが低コスト・高価値のため取り込み）。
- typecheck / 対象テスト / biome すべてグリーン。

## Design Decisions

特になし（ADR-001〜003 は計画フェーズで記録済み、本ラウンドで新規判断なし）。

---

## 完了判定

Blocker 0 件・Warning 0 件 → **1ラウンドでクリーン、レビュー完了（APPROVED）**。
