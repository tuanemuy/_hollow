# PR Review #003 — refactor(ui): ノート公開設定を独立ページからインコンテキストモーダルへ

**PR:** #479
**Date:** 2026-06-04
**Round:** 3回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: クリーン（前回の FE-W-003 解消、新規問題なし）
- Verdict: **APPROVED**

---

## Frontend

### Blockers
- なし
### Warnings
- なし
### Notes
- FE-W-003 解消を確認。エラーが専用 `useState`（`visibilityError`/`issueError`）に切り出され、reducer 内で成功時 null・失敗時 set、close 時 effect に `setVisibilityError(null)`/`setIssueError(null)` 追加。`FormState` は void 化。pending/dispatch・エラー表示の振る舞いに回帰なし。ADR-004 の pending 集約も不変。typecheck クリーン。

## Test

### Blockers
- なし
### Warnings
- なし
### Notes
- 今回の修正は既存 `PublishSettings.test.tsx`（pending 集約／closable）の妥当性を損なわない（テストは error state 形状に非依存、grep 確認、green）。pending 不変条件は引き続き有効。close→reopen のエラーリセット回帰 unit 未追加は非ブロッキング（同種 close-time reset、production 挙動は正しい）。

## Architecture / Routing

### Blockers
- なし
### Warnings
- なし
### Notes
- 今回の変更（フォームエラー state の切り出し）は presentation 層のコンポーネント内部に閉じ、ルーティング・レイヤー構造・appUrl 引き回しに影響なし。review-002 でクリーン確定済みの状態を維持。

---

## Design Decisions

- 特になし（FE-W-003 の解消方針は ADR-005 拡張に記録済み）。

---

## 完了

3レビューラウンドで Blocker 0 / Warning 0 に収束。Step 7 の完了条件（1ラウンドクリーン）を満たし **APPROVED**。
- Round 1: Blocker 0 / Warning 5（FE-W-001/W-002, TEST-W-001/W-002, ARCH-W-001）→ 全修正
- Round 2: Blocker 0 / Warning 1（FE-W-003）→ 修正
- Round 3: Blocker 0 / Warning 0 → APPROVED
