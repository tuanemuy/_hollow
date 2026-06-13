# PR Review #001 — fix: ページ再訪時のスケルトンflash解消（leaf route の staleTime を本番キャッシュ化）

**PR:** #685
**Date:** 2026-06-13
**Round:** 1回目

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 6
- Verdict: **APPROVED**

## レイヤー別ファイル

- Frontend / キャッシュ挙動: review-001-frontend.md（B: 0 / W: 0 / N: 3）
- アーキテクチャ / 計画カバレッジ / ADR: review-001-arch.md（B: 0 / W: 0 / N: 3）

## 指摘一覧

- [N-001] (B) 公開ルートの自動再検証喪失は gcTime(60s) で bound・ADR-002 と整合（許容） — `app/routes/search.tsx:62-63`（Frontend）
- [N-002] `routeCache.ts` は単一定数 module で命名の毛色が既存とやや異なる（配置・様式は慣習準拠・実害なし） — `app/components/public/routeCache.ts`（Frontend）
- [N-003] (A)/(C) に gcTime 未追加は計画判断どおり正しい — `app/routes/about.tsx`（Frontend）
- [N-001] ブラウザ検証コマンドの testing.md ↔ 実施の不整合（`pnpm preview` 記載 / 実施は `pnpm start`） — `.issue/683/testing.md`（Arch）→ **本ラウンドで修正済み**（`pnpm start` に統一）
- [N-002] ルート設定の単体アサートテスト未追加（計画上の任意項目で問題なし） — `.issue/683/plan.md:233`（Arch）
- [N-003] `routeCache.ts` の命名がドメイン語彙とやや毛色が異なる（許容範囲） — `app/components/public/routeCache.ts`（Arch）

## 仕分けと対応

- **Blocker: なし。** **修正対象 Warning: なし。**
- Notes 6 件のうち、Arch[N-001]（testing.md のコマンド不整合）のみ軽微な doc 不整合として**その場で修正**（`pnpm preview` → `pnpm start`、実証済みの正規配信手順に統一）。
- 残り Notes は許容範囲の情報提供・任意項目で対応不要（命名は配置・様式とも既存慣習準拠、単体アサートテストは計画で任意とされた範囲）。

## 完了判定

このラウンドで「このPRで直す」と仕分けた指摘ゼロ（Blocker 0 / 修正対象 Warning 0）。doc Note 1 件はその場で解消。→ **APPROVED**。Ready for review に切り替える。
