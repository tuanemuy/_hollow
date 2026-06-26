# PR Review #001 — feat(search): #779 公開検索(P32)の結果タイトルにキーワードハイライトを適用

**PR:** #785
**Date:** 2026-06-27
**Round:** 1回目

## Summary

- Blockers: 0
- Warnings: 2
- Notes: 14
- Verdict: **BLOCKED**（Warning を修正するため次ラウンドへ）

## レイヤー別ファイル

- Domain / Application: review-001-domain.md（B: 0 / W: 1）
- Adapter / Infrastructure: review-001-adapter.md（B: 0 / W: 0）
- Frontend: review-001-frontend.md（B: 0 / W: 1）
- Test: review-001-test.md（B: 0 / W: 0）

## 指摘一覧

- [W-001] 公開描画面が highlight 既定 true に依存（明示せず） — `app/core/application/search/searchPublicNotes.ts:55-68`（Domain）→ 修正
- [W-1] highlightSnippet.tsx の JSDoc がスニペット専用のまま — `app/components/public/highlightSnippet.tsx`（Frontend）→ 修正
- [N-001/N-002（Test）] AC-4/AC-5 のスニペット正アサーション欠如・LIKE 片値のみ検証 → 取り込み（回帰防止）
- [N-004（Test）] SearchHighlightedTitle 空文字受理テスト欠如 → 取り込み（兄弟 VO と対称）
- その他 Notes（Domain/Adapter/Frontend）: 良い点・参考情報。対応不要

## 仕分け結果

- W-001 / W-1: 同一ファイル内で完結する軽微改善のため本 PR で修正
- Test N-001 / N-002 / N-004: 回帰防止・対称性向上として本 PR で取り込み
- 各レイヤーの Notes（intentional / e2e でカバー済みのもの）: 見送り（記録のみ）
