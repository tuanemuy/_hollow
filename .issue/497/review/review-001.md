# PR Review #001 — fix(ui): ノート一覧 FilterBar の体裁を整える

**PR:** #503
**Date:** 2026-06-05
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 7
- Verdict: **APPROVED**

---

## General Review

### Blockers
なし

### Warnings
なし

### Notes
- **[N-001]** 受け入れ条件をすべて満たす（区切り線廃止・トリガー統一・見出し全廃・typecheck/lint green）。lint 警告は本 PR と無関係の既存分のみ。
- **[N-002]** dead import / 参照漏れなし。`filterSeparator` 参照ゼロ、`pillBtn`（すべてクリア）・`filterLabel`（DatePopover）・`filterChipCaret` の継続使用は妥当。
- **[N-003]** a11y 維持。新ゴーストトリガーは `aria-haspopup="dialog"` / `aria-expanded` を保持、caret に `aria-hidden`。
- **[N-004]** CLAUDE.md スタイル規約（utility-first・data-*・トークン）準拠。新規 CSS / `@apply` なし。
- **[N-005]** 既存挙動（NotePicker 開閉・タグ楽観的更新・すべてクリア）に影響なし。FilterBar.test.tsx green。
- **[N-006]** スコープ外変更なし（コードは FilterBar.tsx / styles.ts の2ファイルのみ）。
- **[N-007]**（軽微・任意）styles.ts の `filterChipGhost` 箇条書きが「(期間 / 公開状態 when no value is set)」のままで、ブロック冒頭サマリが 内部リンク参照 を含めて更新されたのと不整合。→ 本ラウンドでその場修正。

---

## Design Decisions

特になし（ADR-001/002 は計画段階で記録済み）。
