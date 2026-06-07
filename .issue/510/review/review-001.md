# PR Review #001 — design: 各画面の UX 最適化（#500 後続・モック改善）

**PR:** #518
**Date:** 2026-06-06
**Round:** 1回目

---

## Summary

- Blockers: 1
- Warnings: 1
- Notes: 多数（大半は main からの既存・本 PR 由来でない）
- Verdict: **BLOCKED**

3観点（デザイン整合性・SSOT / UX・要件カバレッジ / レスポンシブ・a11y）で並列レビュー。確定決定事項10項目は全てモックに正しく反映、スコープ厳守、構造破綻なし。残る要修正は B-001（P15/P16 横スクロール）と W-001（§2.1 文言 ⇔ P31 不整合）の2点。

---

## レスポンシブ・a11y・コード健全性

### Blockers
- **[B-001]** モバイル390px横スクロール（P15-export / P16-export-jobs）
  - 場所: `P15-export.html:520`（640px ブロック）/ `P16-export-jobs.html:341`。ヘッダーは P13 と完全同一構造（grid `auto 1fr auto` + `.search` + 縮退しない2連 pill「新規作成」「アップロード」+ avatar）。
  - 理由: ブラウザ検証の対象15画面に P15/P16 が含まれず、P13 と同型の横スクロール誘発パターン（pill 非縮退）が残存。index.md §3「ページ全体の横スクロール禁止」違反。
  - 提案: P13 と同じ縮退ルール（`.header-right .pill-btn span.label { display:none }` + `.pill-btn { width:36px; padding:0; justify-content:center }`）を両ファイルの 640px ブロックに追加。
  - **→ 本ラウンドで修正**

### Notes
- N-001: P13a `.panel` が role/aria-modal 無し（設計ステート見本のため許容、実装は Dialog primitive 準拠）。
- N-002: admin `.icon-btn` 角丸 `--radius-full`（正方形では full=pill で視覚不変、無害）。
- a11y/タップ領域/CSS 健全性/app 非変更: いずれも良好。

---

## デザイン整合性・SSOT / UX・要件カバレッジ

### Warnings
- **[W-001]** §2.1 文言と P31 バックリンク表現の不整合（ADR-004 が Proposed のまま未決着）
  - 場所: `index.md:30`（§2.1「バックリンクはカード型リスト1箇所に集約」）/ `P31-public-note.html`（`.backlink-item` 軽量リスト）vs `P11-note-detail.html`（`.backlink-card`）
  - 理由: §2.1 文言は「カード型」という表現スタイルまで縛るため、P31 の軽量リスト（被リンク=軽量リスト / 関連ノート=カードグリッドの差別化）が文言上は違反に見える。ADR-004 自身がレビュー決着を宿題化。
  - 提案（両エージェント一致）: §2.1 を「**1箇所に集約**（表現はカード/リストを回遊文脈に応じて選ぶ）」へ緩め、§2.5「画面最適優先」と整合。ADR-004 を Accepted に確定。#510 の「一貫性のための一貫性に陥らない」方針に合致。
  - **→ 本ラウンドで修正**

### Notes（main からの既存・本 PR 由来でない。別Issue候補）
- N: `prefers-reduced-motion` を持つモックが36中7件のみ（プロジェクト全体のギャップ）。
- N: `--opacity-disabled` が全モックの `:root` に無い（tokens.md 最終形には存在）。
- N: P32 `:root` に非規約 `--shadow-lg` 残存（本 PR は P32 未変更）。
- N: P24 がパスワードまで要求（決定を上回るが破壊操作の UX として妥当、退化でない）。

---

## Design Decisions

W-001 の決着を ADR-004 に反映（Proposed → Accepted、§2.1 文言緩和）。
