# PR Review #001 — feat(note): #754 モバイルのノート一覧フィルターを集約トリガー+ボトムシート化

**PR:** #756
**Date:** 2026-06-18
**Round:** 1回目

## Summary

- Blockers: 0
- Warnings: 4
- Notes: 18
- Verdict: **BLOCKED**（Warning 4件を修正してから再レビュー）

## レイヤー別ファイル

- Frontend / UX / a11y: review-001-frontend.md（B: 0 / W: 3）
- Test: review-001-test.md（B: 0 / W: 1）
- 規約準拠・デスクトップ不変・スコープ: review-001-conventions.md（B: 0 / W: 0）

## 指摘一覧

- [Frontend W-001] モバイルトリガーに `focus-visible` アウトリングが無い — `styles.ts:133-134`
- [Frontend W-002] 件数バッジが SR に「4」とだけ読まれ文脈が無い — `FilterBar.tsx:479-481`
- [Frontend W-003] シート `<h2>` タイトルに `pr-10`（×ボタン回避）が無い — `FilterBar.tsx:508-510`
- [Test W-001] in-sheet の公開状態ラジオ・期間プリセット操作経由の `router.navigate` が未テスト

## 仕分け

全 4 件「このPRで直す」。いずれも変更ファイル内に閉じる軽微な改善で、見送り対象なし。
