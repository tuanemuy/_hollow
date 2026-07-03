# PR Review #003 — feat(a11y): #506 非モーダル dialog Popover に open 時の初期フォーカスを追加

**PR:** #812
**Date:** 2026-07-01
**Round:** 3回目

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 2
- Verdict: **APPROVED**

## レイヤー別ファイル

- Frontend: review-003-frontend.md（B: 0 / W: 0）
- Test: review-003-test.md（B: 0 / W: 0）
- （Accessibility は Round 2 で B/W ともゼロ収束済みのため R3 は再実行せず）

## 指摘一覧

- Blocker・修正対象 Warning ともゼロ。2周目 W-001（コメント過大主張）は訂正が正確であることを両視点でミューテーション検算し収束を確認。

## 完了判定

「そのラウンドで『このPRで直す』と仕分けた指摘がゼロ」を満たし **APPROVED**。3ラウンドで収束。

## 見送り記録（別Issue化せず）

- [R1 Accessibility W-001] 非モーダル `role="dialog"` の実 AT（NVDA/VoiceOver）でのダイアログ境界アナウンス読み上げは自動検証スコープ外。フォーカス着地・role 維持は manual-test（全6 TC PASS）で観測済み。実機 SR 読み上げ確認は follow-up 検証活動であり、コード変更を要さないため別Issue化しない。
