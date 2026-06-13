# PR Review #002 — feat(editor): #696 ノート編集画面に WYSIWYG モードを追加

**PR:** #715
**Date:** 2026-06-13
**Round:** 2回目

## Summary

- Blockers: 0
- Warnings: 2
- Notes: 17
- Verdict: **BLOCKED**（修正対象 Warning 2件を直すため次ラウンドへ）

## レイヤー別ファイル

- Frontend: review-002-frontend.md（B: 0 / W: 1）
- Test: review-002-test.md（B: 0 / W: 1）

## 指摘一覧と仕分け

### 直す（このPR）
- [Frontend W-001] 装飾消失ゲートが surface 非依存（`NoteEditor.tsx:241-247` は `nextMode === "wysiwyg"` のみ判定）で、新規作成画面でも「HTMLタブで非対応タグ入力→WYSIWYGタブ」経路でダイアログが新規に出る。AC-6「新規作成画面の挙動は変わらない」と字義的に食い違う。
  - **対応方針（ユーザー判断）: 編集画面のみに限定する。** ゲートを `surface === "edit" && nextMode === "wysiwyg"` に変更し、新規作成画面は従来挙動を完全維持する。plan の AC-6 を厳守し、ADR に surface 限定の判断を追記。新規画面が非対応タグありでもダイアログを出さないことをテストで pin する。
- [Test W-001] AC-8 の WYSIWYG「確認して切り替える」経路の `contentHtml` 不変 assertion が tautological（切替前に捕捉した不変文字列定数を再 assert するだけで、切替後の `state.contentHtml` を実観測していない） — `noteEditorModeChange.test.tsx:799-839`
  - 対応方針: 確認後に HTML タブへ戻して textarea から実際の `state.contentHtml` を観測する等で、切替後のコンテンツ不変を実観測に変える（abort 契約の pin はそのまま維持）。実観測が困難な場合はその制約をコメントで明記。
