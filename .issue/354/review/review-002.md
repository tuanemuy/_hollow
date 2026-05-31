# PR Review #002 — P10 ノート一覧: モバイル対応 + 選択モード/絞り込み UX の全面刷新

**PR:** #362
**Date:** 2026-05-30
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 数件（任意の polish のみ）
- Verdict: **APPROVED**

review-001 で検出した Blocker 1 + Warning を修正・コミット（15d06bf）後、2レイヤー（A11y/Responsive・Frontend+Architecture）で再レビュー。両レイヤーとも APPROVED。

---

## Accessibility / Responsive（再レビュー）

### Blockers
- なし。B-A11Y-001（ドロワー focus 管理）は ADR-006 のとおり解消。モバイル限定のトラップ／初期フォーカス／復帰／role=dialog／aria-modal／閉時 inert／SSR安全（初回 inert 非付与）／クリーンアップ対称を確認。境界条件は `common/Dialog` と論理一致でバグなし。

### Warnings
- なし。W-A11Y-004（aria-live）/ W-FE-003（pending pointer-events 撤去）/ W-AR-001（backdrop max-lg）/ W-A11Y-001（ADR-005 訂正と実装一致）をすべて再確認。W-A11Y-002（入れ子 button）は誤検知のまま。

### Notes（任意）
- N-002: `focusFirst` の `aside.focus()` フォールバックを完全な no-op にしないため `<aside tabIndex={-1}>` を足すと Dialog の panel と完全対称。→ **適用済み（1行）**
- N-003: isMobile 再評価時の極小エッジは発生条件が極めて狭く実害ゼロ。修正不要。

## Frontend + Architecture（再レビュー）

### Blockers
- なし

### Warnings
- なし

### Notes
- RSC境界無傷（AppShellFrame=Server / AppShellDrawer・MenuButton=client / 副作用 import の server 局在 / RSC payload を children 委譲）。`inert`/`role`/`aria-modal` の条件スプレッドは型・規約適合。styles は variant スコープ・module-scope 集約で規約準拠。NoteListViews の pending opacity 化は要件4に合致。typecheck / biome / 2856 tests 全パス。
- N-005（任意）: pending 時に pointer-events が付かないことの回帰テストを足す余地（実装は確認済みで挙動は正しい）。

---

## Design Decisions
- 特になし（ADR-005 訂正・ADR-006 追加は review-001 ラウンドで記録済み）。

## 完了
2ラウンド目で両レイヤー APPROVED・Blocker/Warning ゼロ。レビューループ完了。
