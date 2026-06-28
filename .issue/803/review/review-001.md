# PR Review #001 — feat(note): #803 タグ候補パネルの viewport クランプ / 外側クリッククローズ

**PR:** #806
**Date:** 2026-06-28
**Round:** 1回目

## Summary

- Blockers: 0
- Warnings: 2（いずれも仕分け済み — 直す対象 0）
- Notes: 11
- Verdict: **APPROVED**

## レイヤー別ファイル

- Frontend: review-001-frontend.md（B: 0 / W: 2 / N: 7）
- Test: review-001-test.md（B: 0 / W: 0 / N: 4）

## 指摘一覧と仕分け

- [W-001] ADR-005 status を Proposed→Accepted に — `.issue/803/adr.md:107`（Frontend）
  → **対応不要（事実誤認）**: ADR-005 は既に `Accepted（実装時に確定）`。計画/レビュー時 ADR=Proposed・実装時確定 ADR=Accepted のリポジトリ慣習（#789 準拠）どおり。
- [W-002] resize 中にパネル open のままだと innerHeight 変化で re-clamp しない — `TagsInput.tsx:143-159`（Frontend）
  → **見送り（記録）**: 確立パターン `usePopover` も open 時のみクランプ。本 Issue の AC 範囲外の edge case で実害低・パターン整合。将来 resize 追従要件が出れば usePopover 側と合わせて対応。

## 完了判定

このラウンドで「このPRで直す」と仕分けた指摘は 0 件（Blocker 0 / 修正対象 Warning 0、W-001 は対応不要・W-002 は見送り記録済み）。Step 7 の完了条件を満たし **APPROVED**。
