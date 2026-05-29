# ブラウザ検証レポート — Issue #152

**実行日**: 2026-05-29
**Issue**: #152 — disabled 中の hover utility 無効化を pill button ファミリーに横断適用
**検証ツール**: agent-browser 0.27.0（実 Chrome）
**テストソース**: `.issue/152/testing.md`

## 概要

pill-style button 系定数の hover/active utility に `not-disabled:`（および `pillBtn` 族はアンカー対応で `not-aria-disabled:`）を付与し、無効化されたボタン/リンクで hover による視覚変化が起きないようにした変更を検証。実際にビルドされた CSS をリンクした静的ハーネスを実 Chrome で開き、12 ケースについて hover 前後の computed style を計測した。

## 結果

**全 12 ケース PASS（FAIL 0）。** 詳細は `results/summary.md` を参照。

- **無効状態（disabled button / aria-disabled anchor）**: hover しても bg・text 色が一切変化しない。Issue の主要要件「disabled なボタンに hover した時、視覚的な色変化が起きないこと」を満たす。
- **有効状態**: 従来通り hover で色が変化する（pillBtn→surface-hover、primary→accent-hover、closeBtn→surface+ink、toolbar→surface-hover）。リグレッションなし。
- **アンカーの aria-disabled** で hover 色変化が止まることを実証し、`not-aria-disabled:` ガードの必要性（ADR-001）を裏付けた。

## 起票した Issue

なし（全 PASS）。

## 成果物

- レポート: `.issue/152/manual-test/report.md`
- サマリー: `.issue/152/manual-test/results/summary.md`
- スクリーンショット: `.issue/152/manual-test/screenshots/`
- 検証ハーネス: `dist/client/manual-test-harness.html`（ビルド成果物配下の一時ファイル。git 管理外）
