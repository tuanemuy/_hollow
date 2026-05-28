# PR Review #001 — Issue #286: cancel in-flight autosave on mode-switch discard

**PR:** #294
**Date:** 2026-05-28
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 6（Frontend×4 + Test×4 のうち 2 件は重複: dirty→idle / wysiwyg→html）
- Notes: 11
- Verdict: **BLOCKED**（Warning も含めて全件修正する方針）

---

## Frontend

### Blockers
なし

### Warnings

- **[W-F-001]** Discard 後に effect が再走しないため、ユーザーが追加編集するまで `dirtyKeys` が再送されない
  - 場所: `app/components/note/editor/useAutosave.ts:189-283`
  - 理由: `useEffect` の deps は `[canFlush, noteId, snapshot, dispatch, saveDraft]`。`abortInFlight()` は effect 内の `controller.abort()` を外部から発火させるだけで、effect 自体は再 mount されない。`setMode` で `canFlush` が真のまま不変なペア（例 `inline → html`、両モードとも `dirtyKeys.size > 0` なら `canFlush=true`）に切替えると、deps が一切変わらず effect は再走しない。aborted な signal を抱えた effect が残り、`flush()` 内の `if (signal.aborted) return` で早期 return が続き、ユーザーが追加編集（`snapshot` を変えるアクション）をするまで autosave が事実上停止する。AutosaveIndicator は `idle` を出すため UI 不整合。
  - 提案: `state.mode` を effect deps に追加して mode 切替で effect を再マウントする（最もシンプル）。

- **[W-F-002]** `abortInFlight` のスコープ（saveDraft 限定）が JSDoc から読み取りづらい
  - 場所: `app/components/note/editor/useAutosave.ts` の `UseAutosaveReturn` JSDoc
  - 理由: `extendLock` 等は abort 対象外という設計判断が暗黙
  - 提案: JSDoc に「`abortInFlight` は saveDraft の AbortController に対する abort のみで、`extendLock` / 他の server function には作用しない」と明記

- **[W-F-003]** 計画書テスト 6「wysiwyg → html switch keeps autosave running after discard」が未実装
  - 場所: `app/components/note/editor/__tests__/noteEditorModeChange.test.tsx`
  - 理由: plan.md ステップ4 / テスト方針 #6 に「期待動作の pin」として明記されているが対応テスト無し
  - 提案: surface="new" の renderEditor バリアントを追加し、`wysiwygUnsupportedDetected` → setMode("html") → confirm OK → 新モードで autosave 再開を assert

- **[W-F-004]** plan.md の reducer テスト「`dirty` → `autosaveDiscarded` → `idle`」が未実装
  - 場所: `app/components/note/editor/__tests__/editorState.test.ts`
  - 理由: plan ステップ 4 で 5 状態網羅予定だったが `dirty` ケースが欠落
  - 提案: 1 ケース追加

### Notes

- **[N-F-001]** `controllerRef` の identity guard は既存 `inFlightRef` の `.finally` パターンと整合的
- **[N-F-002]** `abortInFlight` の `useCallback([dispatch])` 安定化は ADR-002 通り
- **[N-F-003]** `flush()` catch の二段早期 return により abort race 安全性は満たされている
- **[N-F-004]** Tailwind / Utility-first 違反なし
- **[N-F-005]** `saveDraft({ data, signal })` への signal 渡しは TanStack の `FetcherBaseOptions` で型上正しい
- **[N-F-006]** `autosaveDiscarded` の `idle → idle` 短絡は ADR-004 通り

## Test

### Blockers
なし

### Warnings

- **[W-T-001]** reducer `dirty → autosaveDiscarded → idle` のテストが未実装（W-F-004 と重複）
  - 場所: `editorState.test.ts:autosaveDiscarded` describe
  - 提案: `setTitle` で dirty 化 → `autosaveDiscarded` で `kind === "idle"` の遷移 + `dirtyKeys` 保持を pin

- **[W-T-002]** wysiwyg → html 切替後の autosave 再開テストが未実装（W-F-003 と重複）
  - 場所: `noteEditorModeChange.test.tsx`
  - 提案: surface="new" の renderEditor を追加し本ケースを pin

- **[W-T-003]** 2周目合意の `inFlightRef` null 化 assert が未実装
  - 場所: `noteEditorModeChange.test.tsx` の "aborts the in-flight saveDraft" テスト
  - 理由: plan.md レビュー履歴 2周目で取り込み合意した assert（`.finally` の identity guard 経由で null 化されることの間接 pin）
  - 提案: abort 直後にもう一度 dirty 化 → 新規 saveDraft が走ることで `inFlightRef` の事実上の null 化を確認

- **[W-T-004]** "clears the autosaveError banner" テストの mock state が後続テストに残るリスク
  - 場所: `noteEditorModeChange.test.tsx:347-365`
  - 理由: `mockRejectedValue` で全コール reject 設定。`afterEach` で `vi.clearAllMocks()` するが、テスト末尾で discard 後の effect 再評価で再 fire するケースを抑えていない
  - 提案: error 状態の検証直後に `saveDraftMock.mockReset()` するか `mockResolvedValue(undefined)` に戻す

### Notes

- **[N-T-001]** reducer 4 ケースは AAA パターンに整い、`toBe(s0)` で identity 保持を pin
- **[N-T-002]** 統合テストの `saveDraft` mock 設計（abort listener で reject）は実挙動を忠実に再現
- **[N-T-003]** `vi.useFakeTimers()` を `try/finally` で囲む pattern は他テスト汚染を防ぐ
- **[N-T-004]** `await act(async () => { await vi.advanceTimersByTimeAsync(0); })` の microtask flush は適切
- **[N-T-005]** progress.md の「全実装ステップ完了」宣言は W-F-003/004 / W-T-001/002 と矛盾、修正必要

---

## Design Decisions

特になし（W-F-001 の修正は `state.mode` を effect deps に追加するという改変が必要だが、これは設計の根幹を変えるものではなく実装の bug fix。ADR への追記は不要と判断）。
