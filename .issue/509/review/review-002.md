# PR Review #002 — feat(ui): #509 エクスポート画面のデザイン未実装を解消

**PR:** #769
**Date:** 2026-06-21
**Round:** 2回目

## Summary

- Blockers: 0
- Warnings: 1
- Notes: 9
- Verdict: **BLOCKED**（W-001 を直して再レビュー）

## レイヤー別ファイル

- Frontend: review-002-frontend.md（B: 0 / W: 1）
- Architecture / Styling: review-002-architecture.md（B: 0 / W: 0、APPROVE 相当）

## 前ラウンド指摘の解消

- [B-001] segmented focus ring → `has-[:focus-visible]:` で解消・ADR-007 記録 ✅
- [W-001] PAGE_TITLE/PAGE_SUBTITLE 共通 import 化 ✅
- [W-002] aria-live を `<section>` 末尾の単一箇所へ復元・集約 ✅

## 指摘一覧

- [W-001] `JOB_META` の `border-t` が詳細ビュー（`<dl>` が `<section>` の最初の子）で「上に何もない」宙に浮いた罫線になる。一覧カードでは区切り線として正しいが詳細の dual-use で意図しないハードレールが出る — `app/components/export/styles.ts`（JOB_META）（Frontend）

## 仕分け

- W-001: このPRで直す（border-t を共有定数から使用側=一覧カードへ分離し、詳細では出さない）

## 備考

- Round 1 の修正は作業ツリーにあり未コミット → W-001 修正と合わせてコミットする。
