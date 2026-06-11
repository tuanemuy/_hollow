# PR Review #002 — design: モックの可視ロゴを Vesica ロックアップ化＋#628 ヘッダー確定形へ追従

**PR:** #643
**Date:** 2026-06-11
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 多数（検証記録）
- Verdict: **APPROVED**

---

## デザイン忠実度・実装整合

Blockers: なし / Warnings: なし

- Round 1 指摘（ADR Status・flex 漏れ・sidebar-brand）の修正 be617561 をすべて確認。
- 全79箇所の SVG が単一スニペット、wordmark `d` は `BrandLogo.tsx` の `WORDMARK_PATH` と md5 で verbatim 一致。
- header-right は desktop 19 / mobile 15 ファイルで md5 完全一致。ヘッダー内アバター・cta-bar 残存ゼロ。
- `app/` への diff ゼロ、admin の AD アバター維持（ADR-003）。受け入れ grep 合格。

## 網羅性・HTML/CSS健全性

Blockers: なし / Warnings: なし

- flex 未適用残 0 件（74ファイル全量パース）。修正コミットは各32行の宣言追加のみで過剰変更なし。
- カスケード健全性: media query の `.logo{display:none}` 後勝ち、mobile 非表示6ページも `none` が有効でロゴ非表示挙動維持。
- 軽微 Note: 非表示ページの基底 `.logo` の flex は実質デッドコードだが ADR-006 の一律方針の帰結として許容。

---

## Design Decisions

特になし。
