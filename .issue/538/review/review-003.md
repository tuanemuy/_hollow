# PR Review #003 — feat(ingestion): アップロード導線を「投げっぱなし＋キューで編集・保存」に再設計

**PR:** #677
**Date:** 2026-06-13
**Round:** 3回目

## Summary

- Blockers: 0
- Warnings: 1
- Notes: 12
- Verdict: **BLOCKED**（軽微な修正対象あり）

## レイヤー別ファイル

- Backend: review-003-backend.md（B: 0 / W: 0）
- Frontend: review-003-frontend.md（B: 0 / W: 1）
- Test: review-003-test.md（B: 0 / W: 0）

## 指摘一覧と仕分け

- [W-001/frontend] バッジ取得失敗時の無条件 `setCount(0)` で正しい件数が一瞬消える → **修正**（前回値据え置きでチラつき回避） — `IngestionQueueBadge.tsx:36`
- [N-001/backend] `IngestionJobCountOpts` 挿入で `IngestionJobListOpts` の JSDoc が対象型から切り離された → **修正**（PR が持ち込んだ軽微な doc 結合崩れ、リスト用ブロックを直前へ） — `ingestionJobRepository.ts:6`
- その他 Notes（N-006/007 test の名実整合・退化検知補強等）→ **見送り**（軽微な提案、本 Issue のスコープに対し過剰。記録のみ）
