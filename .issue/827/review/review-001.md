# PR Review #001 — fix(route): #827 RootDocument の二重描画を shellComponent 一元化で解消

**PR:** #830
**Date:** 2026-07-10
**Round:** 1回目

## Summary

- Blockers: 0
- Warnings: 1
- Notes: 7
- Verdict: **APPROVED**（W-001 を本ラウンドで修正）

## レイヤー別ファイル

- Frontend / Presentation: review-001-frontend.md（B: 0 / W: 1 / N: 7）

## 指摘一覧

- [W-001] shellComponent コメントと RouteProgressBar コメントの説明が一部重複（任意対応） — `app/routes/__root.tsx:90-98, 118-122` → **本ラウンドで修正**（RouteProgressBar コメントから boundary の仕組み説明を削り、配置理由のみに簡潔化。shellComponent コメント側に集約）
- [N-001〜N-007] すべて良好の確認（型一致・シェルカバレッジ強化・移設のみ・未使用 import なし・hydration mismatch なし・検証カバレッジ妥当）

## 対応

- W-001 を修正（コメント重複解消）。typecheck / lint 再通過を確認。
- Blocker なし。修正した指摘があるため Step 3 に戻り round-002 でフル再レビューし収束確認する。
</content>
