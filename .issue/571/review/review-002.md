# PR Review #002 — feat(#571): P21 プロフィール拡充

**PR:** #576
**Date:** 2026-06-08
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 1（Test W-001、本ラウンドで修正）
- Notes: 多数
- Verdict: **BLOCKED**（Test W-001 を修正 → 3周目で確認）

---

## Frontend / a11y

### Blockers
- なし

### Warnings
- なし（1周目の W-F-002 aria-live / W-F-003 aria-label は妥当に修正。avatarInputId 削除で参照切れ・未使用変数・lint/型エラーなし、tri-state/reset/hydration へのリグレッションなしを確認）

### Notes
- aria-live は MediaUploader と同じ「uploading 時のみ条件マウントする polite リージョン」パターンに整合。sr-only file input の二重タブストップ（input + button）は styled-file-input の定番で不具合ではない（N 止まり）。

---

## Test

### Blockers
- なし

### Warnings
- **[W-T-001(2)]** 「最終保存」テストが静的ラベル `最終保存:` のみをアサートし `formatTimestamp(lastSavedAt)` の値を未検証。かつフィクスチャの `lastSavedAt == createdAt` で値検証しても両者を区別できない。
  - → **本ラウンドで修正**: フィクスチャの `lastSavedAt` を `createdAt` と別値（`2026-03-15T08:30:00.000Z`）に変更し、テストで `new Date(USER.lastSavedAt).toLocaleString("ja-JP", {...})` を同条件生成して `最終保存: ${expected}` を `toContain` で照合（locale 非依存・値検証）。

### Notes
- mock ルーティング（createServerFn が呼び出しごとに distinct ref → useServerFn 参照等価でルーティング）は健全。avatar reject の presign 未呼び出し検証、reset の value/counter 両面検証、cooldown 純関数の決定論的境界網羅、いずれも堅牢。

---

## 仕分け

- Test W-T-001(2) → 同一テストファイル内で完結する軽微な改善のため**このPRで修正**（完了）。
- 他は Note 止まり、対応不要。

## Design Decisions
特になし。
