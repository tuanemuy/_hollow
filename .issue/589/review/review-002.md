# PR Review #002 — feat: モバイルモック(#536)の実装追従 ③ admin 高密度テーブルのカード化（P40〜P47）

**PR:** #602
**Date:** 2026-06-08
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 2（W-003 / W-004）→ 本ラウンドで対応
- Notes: 多数
- Verdict: **BLOCKED**（W-003 対応のため）→ 修正後 APPROVED 相当

---

## 再レビュー結果（Frontend + Styling/a11y 統合）

### 1周目 Warning の確認
- **W-001（解消）**: Jobs IngestionRow/ExportRow の結果サマリ `<p>` に `text-right max-sm:text-left` を付与。desktop 非回帰、mobile 左寄せ。✔
- **W-002（解消）**: `common/styles.ts` `pillBtnSm` JSDoc に specificity 注記（(0,2,0) vs (0,1,1)・mobile 限定 `!important`・ADR-007 参照・`LINK_MINI_ROW` 潜在バグ）を追記。実装に追従（入力は `min-h-[44px]!`）。✔

### 本ラウンドの新規 Warning
- **[W-003]** `UsersTable/index.tsx:229` の結果サマリ `<p>`（`${FIELD_ERROR_CLASS} text-right`）が W-001 と同質の未修正箇所として残存。
  - 場所: `app/components/admin/UsersTable/index.tsx:229`
  - 理由: W-001 を Jobs 限定で記述したため、構造的に等価な UsersTable の 3 箇所目が漏れていた。mobile カードで結果テキストだけ右寄せ。
  - 対応: `text-right max-sm:text-left` に修正済み。✔
- **[W-004 / プロセス]** W-001/W-002 の修正が PR ブランチに未コミットだった（`gh pr diff` は旧 HEAD を参照）。
  - 対応: W-001/W-002/W-003 をまとめてコミット・push する（本ラウンド末）。✔

### Notes
- 修正による新たな問題（typo/トークン逸脱/desktop 回帰/a11y 劣化/スコープ越境）なし。
- `DesignTokensForm:293` のフォームフッターは `pillBtn`（44px 床内蔵）使用かつ本 PR 非変更・P43 トークン行カード化の対象外。問題なし。
- typecheck・biome lint（変更ファイル）クリーン。

---

## 完了判定

W-001/W-002/W-003 をすべて修正・コミット済み。残 Blocker 0・残 Warning 0。**APPROVED**。

## Design Decisions

特になし。
