# PR Review #002 — feat(a11y): #506 非モーダル dialog Popover に open 時の初期フォーカスを追加

**PR:** #812
**Date:** 2026-07-01
**Round:** 2回目

## Summary

- Blockers: 0
- Warnings: 2（Frontend 1 / Test 1 — 同一指摘）
- Notes: 14
- Verdict: **BLOCKED**（コメント精度の Warning を潰すため）

## レイヤー別ファイル

- Accessibility: review-002-accessibility.md（B: 0 / W: 0）
- Frontend: review-002-frontend.md（B: 0 / W: 1）
- Test: review-002-test.md（B: 0 / W: 1）

## 指摘一覧

- [W-001][frontend]＝[W-001][test] close→reopen テストのコメントが過大主張 — `Popover.test.tsx:613-619` → **このPRで対応**（コメント訂正）
  - 内容: 「`prevOpenRef.current = open` リセット行を削除するとテストが落ちる」は事実に反する。両 reviewer がミューテーション実測で確認 — 行を丸ごと削除すると `prevOpenRef` は初期値 `false` に固定され毎回 rising edge 扱いになり refocus が発火するため、テストは緑のまま。テストは「一度きり発火（`if(open) true` 化）」への回帰ガードとしては有意だが、コメントの位置づけが不正確。実装（リセット行）は RSC/Suspense の effect 再発火に対し必要で据え置き。コメントのみ是正。

## 対応方針

- Frontend/Test W-001（同一）: `Popover.test.tsx:613-619` のコメントを、テストが守る実際の失敗モード（"fire once, never re-arm" ＝ `if(open) true` 化）に合わせて訂正。リセット行の丸ごと削除は happy-dom の deps 安定性ゆえ分離検証不能である点も明記。実装は変更しない。
- Accessibility は 2周目で B/W ともゼロ（収束）。
