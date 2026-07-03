# PR Review #001 — feat(a11y): #506 非モーダル dialog Popover に open 時の初期フォーカスを追加

**PR:** #812
**Date:** 2026-07-01
**Round:** 1回目

## Summary

- Blockers: 0
- Warnings: 4（Accessibility 2 / Frontend 1 / Test 1）
- Notes: 23
- Verdict: **BLOCKED**（Warning を潰すため）

## レイヤー別ファイル

- Accessibility: review-001-accessibility.md（B: 0 / W: 2）
- Frontend: review-001-frontend.md（B: 0 / W: 1）
- Test: review-001-test.md（B: 0 / W: 1）

## 指摘一覧

- [W-001][a11y] 非モーダル role="dialog" の実 AT（NVDA/VoiceOver）での SR 読み上げ未検証 — `Popover.tsx:152-163`（Accessibility）→ **見送り**（自動検証スコープ外。実機 SR 読み上げ確認は follow-up。フォーカス着地・role 維持は manual-test で確認済み）
- [W-002][a11y] `prevOpenRef = useRef(false)` により将来 open 状態でマウントする dialog consumer がユーザー操作なしに初期フォーカスを奪う余地（WCAG 3.2.1）— `usePopover.ts:191` → **このPRで対応**（JSDoc に注意を追記）
- [W-001][frontend] close→reopen 再アーム（`prevOpenRef.current = open` リセット）が未テスト。リセット行を消しても緑 — `Popover.test.tsx` → **このPRで対応**（Test W-001 と同一。テスト追加）
- [W-001][test] prevOpenRef ガードの close→reopen 再アーム分岐が未テスト — `Popover.test.tsx` → **このPRで対応**（Frontend W-001 と統合）

## 対応方針

- Frontend W-001 / Test W-001（同一）: `Popover.test.tsx` に「open → 別要素へ focus → close → 再 open → 先頭へ再フォーカス」ケースを追加し、`prevOpenRef.current = open` リセットの退行を固定する。
- Accessibility W-002: `usePopover.ts` の `prevOpenRef` JSDoc/コメントに「open 状態でマウントする dialog を作る場合、マウント時に初期フォーカスが動く（WCAG 3.2.1 の考慮が要る）。現行 consumer は全て閉状態開始で無影響」旨を一言追記。
- Accessibility W-001: 見送り（記録のみ）。
