# PR Review #001 — fix(ui): #732 セッション失効の leaf 観測時の未認証 UI 1 フレーム露出を解消

**PR:** #733
**Date:** 2026-06-14
**Round:** 1回目

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 13
- Verdict: **APPROVED**

## レイヤー別ファイル

- Frontend: review-001-frontend.md（B: 0 / W: 0 / N: 7）
- Test: review-001-test.md（B: 0 / W: 0 / N: 6）

## 指摘一覧

Blocker・Warning ともになし。両レイヤーとも 1 ラウンドでクリーン。

主な確認事項（Notes より）:
- ガード条件の SSOT 一致が構造的に担保され、fresh 未認証の誤抑制（AC-2）が防がれている
- 依存配列を生入力据え置きで #300 per-id 再発火契約・#293 staleTime: Infinity を保持
- 収束経路が実コードと整合、無限ループ・振動なし
- 既存 invalidate 契約 6 ケース無改修維持、新規 BoolProbe / selectUnauthenticatedView の assertion は偽 green でない（ミューテーション感応性あり）
- カバレッジ未到達点（HomeRoute 配線・AC-1/AC-4b）はいずれも plan が手動主担当として明示受容済み

## 完了判定

Step 7 の完了条件「そのラウンドで『このPRで直す』と仕分けた指摘がゼロ」を満たす（Blocker 0・修正対象 Warning 0）。レビューループ終了 → Ready for review。
