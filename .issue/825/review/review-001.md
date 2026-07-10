# PR Review #001 — feat(note): #825 P12 モバイルエディタの残 UX 改善

**PR:** #831
**Date:** 2026-07-10
**Round:** 1回目

## Summary

- Blockers: 1
- Warnings: 8（重複除去後の実質: 6）
- Notes: 13
- Verdict: **BLOCKED**

## レイヤー別ファイル

- Frontend: review-001-frontend.md（B: 1 / W: 2）
- Test: review-001-test.md（B: 0 / W: 4）
- Accessibility: review-001-a11y.md（B: 0 / W: 2）

## 指摘一覧（重複除去・仕分け済み）

### このPRで直す
- [B-001] LinkDialog `type="url"` が相対/アンカー/クエリURLをブロック — `LinkDialog.tsx:82`（Frontend, = A11y W-002）
- [W-001] リンク挿入後フォーカスが本文でなくトリガーへ戻る — `WysiwygEditor.tsx:422-432`（Frontend）
- [W-002] エラーが `aria-describedby` 未関連付け — `LinkDialog.tsx:80-97`（Frontend, = A11y N-001）
- [A-W-001] オーバーフローメニューの適用中 Check が SR に伝わらない（`aria-hidden`）— `WysiwygEditor.tsx:667`（A11y）
- [T-W-001] リンク挿入(AC-6)が弁別的に未検証（setLink 実行を確認していない）— `wysiwygEditorLinkDialog.test.tsx`（Test）
- [T-W-002] 解除(unsetLink)のユニット担保なし — `wysiwygEditorLinkDialog.test.tsx`（Test）
- [T-W-003] リンク編集分岐(プレフィル/更新)未カバー — `wysiwygEditorLinkDialog.test.tsx`（Test）
- [T-W-004] 適用中 Check 表示に自動ゲートなし — `wysiwygEditorToolbarOverflow.test.tsx`（Test）
- [N-005] モックの aria-label「書式設定」と実装「書式」の差（軽微・ついでに整合）— `P12-editor.html`（Frontend）

### 見送り（記録のみ）
- [A-N-002] overflow メニュー項目が実効約36px（共有プリミティブ `menuItem`、WCAG AA は充足）— スコープ外・共有プリミティブ変更は影響広範のため本PRでは触らない
- [A-N-003] `role="toolbar"` に roving tabindex 未実装 — 本PR導入ではなく既存挙動・実害なし
- [T-N-003] disabled 伝播の未検証 — 軽微。T-W-* 修正時に余力で足せれば足す
