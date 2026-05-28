# PR Review #002 — Issue #286: cancel in-flight autosave on mode-switch discard

**PR:** #294
**Date:** 2026-05-28
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 14（Frontend 8 + Test 6）
- Verdict: **APPROVED**

---

## Frontend (Round 2)

### Blockers
なし

### Warnings
なし

### Notes
- **[N-F-001]** W-F-001 修正は妥当。`state.mode` を destructure して effect deps に追加し、`biome-ignore lint/correctness/useExhaustiveDependencies` の直前に「mode は effect body で使わないが、mode 切替で effect を re-mount するために dep に含める」根拠を 7 行のコメントブロックで明記している (`useAutosave.ts:202-209`)。
- **[N-F-002]** `controllerRef` の identity guard と既存 `inFlightRef` の identity guard が同じパターンで揃っており、teardown 競合は防げている
- **[N-F-003]** W-F-002 の JSDoc 追記は `UseAutosaveReturn` 型に scope 明示済み
- **[N-F-004]** W-F-003 のテストは厳密には wysiwyg→html ではなく inline→html だが、検証している不変量は同一で本質を pin できている
- **[N-F-005]** W-F-004 のテストは 5 状態すべて (dirty / saving / error / saved / idle) を網羅
- **[N-F-006]** `onModeChange` の `useCallback` 依存配列が `[abortInFlight]`、順序 (blur → stateRef → confirm → abortInFlight → setMode) は ADR-002 / plan ステップ 3 通り
- **[N-F-007]** W-T-004 のテストは error 状態確認直後・confirm 発火前に mock reset、advanceTimersByTimeAsync(2000) で debounce + flush を settle してから assertion
- **[N-F-008]** `pnpm test:unit` (91 tests) と `biome check` (5 ファイル) はすべて green

## Test (Round 2)

### Blockers
なし

### Warnings
なし

### Notes
- **[N-T-001]** W-T-001: `setTitle → autosaveStart → autosaveSuccess → setTitle` 経路で `dirty` 到達を pin、その後 `autosaveDiscarded → idle` 遷移と `dirtyKeys` 保持を assert
- **[N-T-002]** W-T-002: 新規テストは `mockImplementationOnce`（hang）→ `mockResolvedValue(undefined)` の構成で W-F-001 修正の挙動を確実に pin。`resolveFirst?.()` は reject 済み Promise への no-op で polite cleanup
- **[N-T-003]** W-T-003: discard 後再 dirty 化 → 新規 `saveDraft` 呼出を assert することで `.finally` の `inFlightRef.current === p` identity guard 経由の null 化を間接 pin
- **[N-T-004]** W-T-004: mock リセットタイミング (error 検出 → reset → confirm) が適切
- **[N-T-005]** フラ ky 性検証: noteEditorModeChange.test.tsx (8 tests) を 5 回連続実行して全パス、`pnpm test:unit` フルスイート (2673 tests) も pass
- **[N-T-006]** Round 1 で指摘した 4 件はすべて反映済み

---

## Design Decisions

特になし。Round 1 で指摘された設計上の懸念は `state.mode` を effect deps に追加するという形で解決済み。新たな ADR 追加は不要。
