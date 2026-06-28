# PR Review #002 — refactor(ingestion): move the in-progress upload badge to the sidebar upload item

**PR:** #807
**Date:** 2026-06-28
**Round:** 2回目

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 11
- Verdict: **APPROVED**

## レイヤー別ファイル

- Frontend: review-002-frontend.md（B: 0 / W: 0 / N: 3）
- Accessibility: review-002-accessibility.md（B: 0 / W: 0 / N: 2）
- Test: review-002-test.md（B: 0 / W: 0 / N: 6）

## 指摘一覧

直すべき Blocker・Warning はゼロ。すべて受容可能・情報提供の Notes。

- [N frontend] `queueBadgeBus` のバス名 "Badge" 表記は plan で据え置きと明示済み・実害なし
- [N frontend] ハイドレーション後の件数出現による軽微なレイアウトシフトはライブ件数の性質上不可避・移設前と同挙動
- [N frontend] `data-active` の値表現差（UploadButton `"true"` / Link `""`）は Tailwind が属性存在のみ判定するため両者問題なし
- [N a11y] 可視 `99+` と aria-label 実数の乖離は SR に正確件数を伝える意図的分岐（WCAG 2.5.3 充足）
- [N a11y] ライブ更新の aria-live 非依存は移設前と同等・AC-4 は静的構造の要求でライブ通知は対象外
- [N test] Round 1 W-001（実 uploadQueueLabel 未実行）は `useIngestionQueueCount.test.tsx` で解消確認
- [N test] 層分離・カバレッジ後退なし・Link モックの activeProps スプレッド適正、ほか

## 収束

Round 1 の Warning 2件（99+分岐の明文化 / 実 uploadQueueLabel のテスト実行）は修正済み。Round 2 は3レイヤーとも Blocker・Warning ゼロで収束。APPROVED。
