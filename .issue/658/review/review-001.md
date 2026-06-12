# PR Review #001 — feat(home): P10 FilterBar「+ タグ」ゴーストチップとタグピッカー

**PR:** #665
**Date:** 2026-06-13
**Round:** 1回目

## Summary

- Blockers: 0
- Warnings: 9
- Notes: 16
- Verdict: **BLOCKED**（Warning 修正対象あり）

## レイヤー別ファイル

- Frontend: review-001-frontend.md（B: 0 / W: 4）
- Shared Components Regression: review-001-shared.md（B: 0 / W: 2）
- Test: review-001-test.md（B: 0 / W: 3）

## 指摘一覧（仕分け: 全件このPRで修正）

- [FE W-001] popoverSheetPanel fixed 化の期間/公開状態への波及（DatePopover の date input × シート未検証）
- [FE W-002] マルチセレクト listbox の初期フォーカスは最初の選択済み option にすべき（APG）
- [FE W-003] useRovingMenu のフォーカス復元 effect がグローバル波及 → opt-in 化
- [FE W-004] TAG_OPTION_ITEM のコメント不正確・フォーカスリング不揃い
- [SH W-001] relatedTarget=null ガードのグローバル挙動変更を JSDoc に明記
- [SH W-002] refocus が古い activeIndex 参照 → クランプ追加
- [SH N-004] adr.md の ADR-005 番号重複（修正対象に含める）
- [TS W-001] "keeps the panel open" がナビ resolve 後をアサートしていない
- [TS W-002] 解除方向の楽観トグル未テスト
- [TS W-003] tagButton() ヘルパーが open 時に曖昧マッチ
