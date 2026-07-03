# PR Review #001 — test(admin): #471 /admin/users のデータ経路 listAll に回帰テストを追加

**PR:** #816
**Date:** 2026-07-03
**Round:** 1回目

## Summary

- Blockers: 0
- Warnings: 1
- Notes: 8
- Verdict: **APPROVED**

## レイヤー別ファイル

- General Review: review-001-general.md（B: 0 / W: 1）

## 指摘一覧

- [W-001] `nextId` の共有 `counter` がテスト間で reset されない — `app/core/adapters/d1/__tests__/userRepository.integration.test.ts`（General）

## 仕分け

- **[W-001] 見送り（実害なし・既存規約準拠）**: `counter` はモジュールスコープで単調増加し、beforeEach の TRUNCATE で DB はクリーンになる。各テストは seed → 同一テスト内で query して結果を assert するため、id 昇順は「そのテスト内で生成した相対順序」で保証され、counter の絶対値・prefix に依存しない。さらにファイル内の既存 describe（searchPublicByUsernamePrefix 系）も同じ共有 counter を reset せず使っており、reset を足すと逆にファイル規約から外れる。したがって修正せず見送る。

## 判定

このラウンドで「このPRで直す」と仕分けた指摘は 0 件（Blocker 0 / 修正対象 Warning 0 — W-001 は見送り記録済み）。完了条件を満たすため **APPROVED**。
