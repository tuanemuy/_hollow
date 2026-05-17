# PR Review #002 — feat(note): P12 WYSIWYG editor with TipTap (Issue #9)

**PR:** #35
**Date:** 2026-05-17
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 4（Frontend 2 + Test 2）
- Notes: 18（Frontend 10 + Test 11）
- Verdict: **BLOCKED**（Warning 修正後に再レビュー）

Round 1 の指摘 14 件はすべて解消されたが、解消によって新たに 4 件の Warning が発見された。

---

### Frontend

#### Blockers
なし

#### Warnings

- **[FE-W-101]** 初回マウント時の TipTap HTML 正規化が `lastEmittedHtmlRef` ガードを擦り抜ける
  - 場所: `app/components/note/editor/WysiwygEditor.tsx:81, 98-103`
  - 理由: `lastEmittedHtmlRef` は親 `value`（生 HTML）で初期化されるが、TipTap は ProseMirror schema 経由で正規化する（`""` → `<p></p>`、`<P>X</P>` → `<p>X</p>`）。初回 `onUpdate` で `next !== lastEmittedHtmlRef.current` になり `onChange` が誤発火 → dirty 化
  - 提案: `useEditor({ onCreate })` で `lastEmittedHtmlRef.current = editor.getHTML()` を同期。テストに `value=""` ケースを追加

- **[FE-W-102]** `onSelectionUpdate` 内 `forceRender` が高頻度で全 toolbar を再構築
  - 場所: `app/components/note/editor/WysiwygEditor.tsx:104-106, 160-220`
  - 理由: selection 変化は文字入力 / 矢印 / IME 確定など毎回発火。10 ボタンの `isActive()` schema lookup が毎回走る
  - 提案: `useEditorState` で active state のみ subscribe、または rAF coalesce。**スコープ外の最適化として進行**

#### Notes
- FE-N-101〜FE-N-110: Round 1 の 6 Warning は全て解消（aria-pressed、isAllowedLinkUri、latest-ref、aria-label 日本語、`lastEmittedHtmlRef` ガード）。サニタイザ整合・JSDoc・ADR 追記は良好

---

### Test

#### Blockers
なし

#### Warnings

- **[TS-W-009]** `setTimeout(50)` の待機が flaky リスク
  - 場所: `wysiwygEditorOnChange.test.tsx:46-48, 63-65, 77-79`
  - 理由: TipTap の `immediatelyRender: false` 遅延マウントは rAF ベース。CI 負荷で 50ms 超過すると偽 PASS（「呼ばれない」のアサーション）
  - 提案: `requestAnimationFrame` を 2 ティック明示的に flush、または `setTimeout(50)` の根拠コメントを追記

- **[TS-W-010]** ポジティブケースが欠落（ユーザー編集時に `onChange` が呼ばれる）
  - 場所: `wysiwygEditorOnChange.test.tsx`
  - 理由: 2 ケースとも `not.toHaveBeenCalled()` のみで、`lastEmittedHtmlRef` ガードが過剰一致してユーザー入力まで吸収する regression を検出できない
  - 提案: `editor.commands.insertContent("typed")` 経由で意図的に変更 → `onChange` が呼ばれることを確認するテストを 1 件追加

#### Notes
- TS-N-001〜TS-N-011: Round 1 の 8 Warning は全て解消（`MEDIA_ID_FROM_URL` export、3 段ラウンドトリップ、`reason === "disallowed tag"`、エッジケース 3 件、saving/dirty 状態 setMode、`wysiwygEditorOnChange.test.tsx` 新規、ステージング再検証 progress.md 追記、TC-008 根本原因の JSDoc 記録）

---

## Design Decisions

- **本ラウンドで修正**: FE-W-101（`onCreate` 同期 + `value=""` テスト）、TS-W-009（rAF 2 回 flush）、TS-W-010（ポジティブケース追加）
- **記録のみ**: FE-W-102（toolbar re-render コスト）。10 ボタン規模では実害なし。`useEditorState` 化は将来 Issue 候補として progress.md 追記
