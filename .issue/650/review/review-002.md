# PR Review #002 — feat(ui): 表示モードの前回値を localStorage に永続化し P10 初期表示に適用 (#650)

**PR:** #721
**Date:** 2026-06-13
**Round:** 2回目

## Summary

- Blockers: 0
- Warnings: 2
- Notes: 18
- Verdict: **BLOCKED**（Warning 全件をこの PR で対応するため）

## レイヤー別ファイル

- Frontend: review-002-frontend.md（B: 0 / W: 1）
- Test: review-002-test.md（B: 0 / W: 1）

## 指摘一覧

- [Frontend W-001] Round 1 の修正（テスト4件・コメント）が未コミット／未 push — 作業ツリーにのみ存在
- [Test W-001] active 表示が実効モードに追従する pin テスト不足（URL 無指定+永続値 calendar → calendar タブが aria-selected）— `app/components/note/list/__tests__/DisplayModeSwitch.test.tsx`

## 仕分け

- Frontend W-001: メインが Test W-001 修正と合わせてコミット＆push（手続き上の指摘、実装/テスト内容は Round 1 で完了済み）
- Test W-001: テスト1件追加（この PR で対応、ADR-005 の関心分離 (B) 側を能動的に固定）
