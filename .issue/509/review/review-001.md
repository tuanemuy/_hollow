# PR Review #001 — feat(ui): #509 エクスポート画面のデザイン未実装を解消

**PR:** #769
**Date:** 2026-06-21
**Round:** 1回目

## Summary

- Blockers: 1
- Warnings: 2
- Notes: 13
- Verdict: **BLOCKED**

## レイヤー別ファイル

- Frontend: review-001-frontend.md（B: 1 / W: 2）
- Architecture / Styling: review-001-architecture.md（B: 0 / W: 0）

## 指摘一覧

- [B-001] segmented control のキーボードフォーカスリングが出ない（`focus-visible:` を label に当てているが実フォーカスは内側 sr-only radio。plan 指定の `focus-within:` から逸脱・WCAG 2.4.7） — `app/components/export/styles.ts:52`（Frontend）
- [W-001] `PAGE_TITLE`/`PAGE_SUBTITLE` のローカル完全重複（hoisting 違反・AC-8 違反。list/detail は共通 import で扱いが割れている） — `app/components/export/ExportForm/index.tsx:41-43`（Frontend）
- [W-002] 成功メッセージの `aria-live` ライブリージョンを footer 内へ複製移動（純スタイリングのスコープを越えた DOM 位置移動） — `app/components/export/ExportForm/index.tsx:308-312,326-330`（Frontend）

## 仕分け

- B-001: このPRで直す（必須）
- W-001: このPRで直す（共通定数 import に統一）
- W-002: このPRで直す（元の DOM 位置に戻し、スコープをスタイリングに限定）
