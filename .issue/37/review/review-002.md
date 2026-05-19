# PR Review #002 — feat(note): WYSIWYG unsupported-tag warning banner (Issue #37)

**PR:** #67
**Date:** 2026-05-19
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 5
- Verdict: **APPROVED**

---

## Round 1 指摘対応状況

| ID | 対応状況 | 備考 |
|----|---------|------|
| F-W-001 | ✓ | `aria-live="assertive"` 削除、`role="alert"` のみで暗黙 `assertive` |
| F-W-002 | ✓ | ack 前後で同一 `<div>` シェル維持・`className`/`role` のみ切替。ack 押下時に `editor?.commands.focus()` で本文へフォーカス戻し |
| F-W-007 | ✓ | banner を toolbar の **前** に移動。Tab 順序が自然に |
| F-W-003 | ✓ | コンポーネント JSDoc に「4 props はセット運用」「partial wiring で autosave が永久停止する」旨を明記 |
| F-W-005 | ✓ | `<span key>...{i>0?", ":""}` を `Fragment` + `renderTagList()` ヘルパに整理 |
| A-W-003 | ✓ | F-W-005 と統合済み |
| F-W-006 | ✓ | ack 後 notice でも `<code>{<${t}>}</code>` を共通ヘルパ経由で表示 |
| F-W-008 | ✓ | `onUnsupportedTagsDetected` JSDoc に reducer の `setsEqual` 同集合 no-op 仕様を追記 |
| F-W-004 | ✓（妥当） | スコープ外として保留。既存 `wysiwyg-editor`/`wysiwyg-toolbar` も同様に CSS 未定義であり Issue #37 起因の regression ではない |
| T-W-001 | ✓ | `wysiwygEditorOnCreateDetect.test.tsx` で canonical / unsupported / 編集後再発火なしの 3 ケース pin |
| T-W-002 | ✓ | 同ファイル内で `unsupportedAck` 切替時の `role="alert"`/`role="note"` + ボタン有無を 2 ケース pin |
| A-W-001 | ✓ | `shouldFlushAutosave` JSDoc に「`wysiwygUnsupportedAck` は WYSIWYG editor unmount/remount を跨いで保持」を追記 |
| A-W-002 | ✓ | `onUnsupportedTagsDetectedRef` および対応 `useEffect` 削除、`onCreate` 内で props 直接参照 |

## 新規 Blockers
なし

## 新規 Warnings
なし

## 新規 Notes
- **[N-001]** `wysiwygEditorOnCreateDetect.test.tsx` と既存の `wysiwygEditorOnChange.test.tsx` で `beforeEach/afterEach` / `flushTipTapMount` セットアップが約 30 行重複。現状 2 ファイルだけなので許容範囲だが、3 ファイル目を追加するタイミングで `__tests__/_setup/tiptapHarness.ts` 等に括り出すのが妥当
- **[N-002]** `onAcknowledge?.() → editor?.commands.focus()` の順序は安全。`onAcknowledge` は同期 dispatch のみで React は onClick から戻った後に再 render する
- **[N-003]** `renderTagList()` は内部で hooks を呼ばないので Rules of Hooks 違反なし
- **[N-004]** banner を `wysiwyg-editor` ラッパー内・toolbar 前に置く変更で外側コンポーネント（`NoteEditor`）のレイアウトには波及していない
- **[N-005]** `useEditor` の `extensions` 配列は参照不安定だが TipTap は `deps` 未指定で editor を再生成せず `setOptions` パスを通る。`onCreate` は初回 1 回のみ発火、A-W-002 修正後の「初期クロージャに固定された `onUnsupportedTagsDetected`」を呼ぶ挙動で正しく動作

## Design Decisions

このラウンドでの新規設計判断は無し。Round 1 のフィードバックを既存 ADR の運用上の補足として JSDoc に追加した。

## 総合判定

Round 1 の Warning 12 件（F-W-001/002/003/005/006/007/008、T-W-001/002、A-W-001/002/003）はすべて妥当に対応済み。F-W-004（CSS 未定義）はスコープ外保留が妥当。新規 Blocker / Warning は発生していない。**APPROVED**。
