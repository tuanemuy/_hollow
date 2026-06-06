# PR Review #002 — fix(#532): サイトメタデータをテンプレ初期値から hollow 固有へ差し替え

**PR:** #534
**Date:** 2026-06-06
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 1（W-001、本ラウンドで修正済み）
- Notes: 4
- Verdict: **BLOCKED → 修正済み（round 3 で再確認）**

---

## General Review

### Blockers
- なし

### Warnings
- **[W-001]** リポジトリ正面の `README.md` がテンプレ残骸を保持したまま（棚卸しスコープの取りこぼし）
  - 場所: `README.md:1`（`# tanstack-start-template`）、本文 `:3`/`:5`（"A reference template for building applications…" / "give you a worked example of…"）
  - 理由: Issue #532 のスコープは「テンプレ残骸の棚卸し・一掃」を含む。本体（ディレクトリ構成・コマンド・デプロイ＝既に `hollow.maku-ja.com` 参照）は hollow にそのまま正確で、テンプレ前提なのは冒頭の H1 + イントロのみ。H1 リネームは `docs/runtime_cloudflare.md` のような命名規約衝突を伴わない安全な置換で、同一ファイル内で完結する。
  - → **修正済み**: H1 を `# hollow` に、イントロを hollow（「静かで個人的なテキストアーカイブ」）前提の記述へ書き換え。技術本体セクションは正確なため据え置き。

### Notes
- **[N-001]** round 1 の全指摘解消を確認。W-001(reseed) / B-add-1(webmanifest) / B-add-2(OG画像 SVG+PNG) すべて解消済み。OG PNG は 1200x630・8-bit grayscale で SVG と整合。
- **[N-002]** 片側 rename の整合性リスクなし。`Symbol.for` キー・統合テストキュー名・wrangler indexer すべて両側/全 binding 一致。
- **[N-003]** メタデータ差し替えは型適合、据え置き判断も妥当。
- **[N-004]** `docs/runtime_cloudflare.md:84-95` の据え置きは妥当（doc の命名規約 `{template}-{resource}-{stage}` が実構成 `hollow-{stage}-{resource}` と異なり単純置換不可）。Phase 4 で follow-up Issue 化を検討する。

---

## Design Decisions

特になし。
