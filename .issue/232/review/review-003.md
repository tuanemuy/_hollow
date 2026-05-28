# PR Review #003 — feat(issue/232) after review-002 fixes

**PR:** #291
**Date:** 2026-05-28
**Round:** 3回目

---

## Summary

- Blockers: 0
- Warnings: 2 (Accessibility 副作用)
- Verdict: **BLOCKED**

## Frontend
- 問題点ゼロ
- FE-R2-W-001/W-002 解消確認
- 副次改善（DIRECTORY_NAME_MAX_LENGTH 統一）の妥当性確認

## Accessibility
- **[A11Y-R3-W-001]** A11Y-R2-W-002 修正（input 残す）の副作用で、エラー後に Esc/empty/unchanged で抜けるとエラー表示が孤児化する
- **[A11Y-R3-W-002]** エラー発生後の input にフォーカスが戻らない（再入力にクリックが必要）

## Architecture / Spec
- 問題点ゼロ
- ARCH-R2-W-001 (DIRECTORY_NAME_MAX_LENGTH 80 統一) 解消確認
- 後方互換破壊なし（domain で既に 80 超は弾かれていた）
