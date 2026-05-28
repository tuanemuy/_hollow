# PR Review #003 — feat(editor): add inline mode for editing existing notes

**PR:** #282
**Date:** 2026-05-28
**Round:** 3回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 数件（解消確認）
- Verdict: **APPROVED**

---

## Frontend

### Blockers
なし

### Warnings
なし

### Notes
- review-001/002 で挙がった W-F-001〜W-F-007 はすべて確認済み
- `serializeHostContent` の contenteditable 除去経路は emit / lastEmittedHtmlRef 初期化 / rollback / disabled effect の 4 箇所で一貫使用
- `<section aria-label="ノート本文">` の a11y 規約準拠を確認
- `pnpm test:unit` 全 133 files / 2629 tests PASS

**Verdict (Frontend)**: APPROVED

---

## State / Logic

### Blockers
なし

### Warnings
なし

### Notes
- W-S-004 (ADR-008 Consequences 不正確) は解消確認。技術的に正確な記述（`useEffect` は commit phase で走る、`flushSync` が必要なケースの限定、autosave で差分回収）に修正済み
- 軽微: ADR-008 内のコピペ重複文を削除（本コミットで対応）
- W-S-001 のメイン経路はテスト 3 ケースで pin、同一イベント内 blur 由来エッジは ADR-008 で明示

**Verdict (State/Logic)**: APPROVED

---

## Test

### Blockers
なし

### Warnings
なし

### Notes
- B-T-001 (noteEditorModeChange.test.tsx 未コミット) → 解消（PR ファイルリストに含まれ、3 ケース全 PASS）
- W-T-011 (テスト名乖離) → 解消（"via the dirty path" にリネーム）
- W-T-012 (paste 挿入点未検証) → 解消（`host.querySelector("p")?.textContent` で構造検証）
- 全テスト PASS

**Verdict (Test)**: APPROVED

---

## Design Decisions

このラウンドで見つかった設計判断: なし（ADR-008 の Consequences は微細な編集のみ）

---

## 完了判定

3レイヤー全てで **Blocker 0 / Warning 0 / APPROVED**。レビューループ終了。PR を Ready for review に切り替える。
