# PR Review #005 — feat(media): #468 source blob のストレージ衛生

**PR:** #834
**Date:** 2026-07-11
**Round:** 5回目

## Summary

- Blockers: 0
- Warnings: 5
- Notes: 22
- Verdict: **BLOCKED**（修正対象 Warning 4 / 見送り 1）

## レイヤー別ファイル

- Domain: review-005-domain.md（B: 0 / W: 1）
- Use Case: review-005-usecase.md（B: 0 / W: 0）
- Infrastructure: review-005-infrastructure.md（B: 0 / W: 1）
- Test: review-005-test.md（B: 0 / W: 3）

## 指摘一覧

- [W-001] sweep の fresh ガードが cutoff を再検査しない（JSDoc の「再スタンプ=先送り」が候補列挙〜再読間に成立しない） — `sweepAbandonedSourceIntakes.ts:59-67`（Domain）→ このPRで修正（ガードに cutoff 再検査を追加）
- [W-001] テンプレート↔ローカル wrangler.toml の binding パリティテストがない — （Infrastructure）→ 見送り: 新規テスト基盤＋依存追加の判断が要るため「pruner 回収の運用強化」Issue に束ねる
- [W-001] `ObjectStorage.delete` 冪等性契約が実 R2 実装（miniflare）に対して未検証 — （Test）→ このPRで修正
- [W-002] sweep デフォルト猶予 24h の境界が未ピン留め — （Test）→ このPRで修正
- [W-003] tick が sweep/purge をデフォルト猶予で呼ぶことの固定なし — （Test）→ このPRで修正
