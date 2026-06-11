# PR Review #001 — design: モックの可視ロゴを Vesica ロックアップ化＋#628 ヘッダー確定形へ追従

**PR:** #643
**Date:** 2026-06-11
**Round:** 1回目

---

## Summary

- Blockers: 1
- Warnings: 2
- Notes: 13
- Verdict: **BLOCKED**

---

## デザイン忠実度・実装整合

### Blockers
なし

### Warnings
- **[W-001]** `.issue/631/adr.md` の ADR-001〜005 が Status: Proposed のまま（ADR-006〜009 は Accepted）。実装済みなので Accepted へ更新すべき。

### Notes（抜粋）
- ロゴ SVG は全79箇所が完全同一スニペット、wordmark path は `BrandLogo.tsx` の `WORDMARK_PATH` と verbatim 一致。
- header-right ブロックは desktop 19ファイル / mobile 14ファイルで md5 完全一致。ヘッダー内アバター残存ゼロ。
- 非対象領域（admin / drafts / public / auth / `app/`）の保全を git diff で確認。
- Issue #631 完了条件4項目すべて充足。

## 網羅性・HTML/CSS健全性

### Blockers
- **[B-001]** ADR-006（`.logo` への `display:flex; align-items:center`）が74ファイル中31ファイルで未適用。ヘッダー sweep 群（desktop A群＋mobile B群＋skeleton）に集中 — Worker 分担境界の取りこぼし。height=16 SVG のベースラインギャップ（約4–5px）が残り、適用済み43ファイルと縦位置が不一致。→ 基底 `.logo` に同じ2宣言を追加（カスケード無傷は確認済み）。

### Warnings
- **[W-001]** `mobile/P20-views.html` の `.sidebar-brand` も SVG 化したのに flex 化されておらず同じギャップ。`display:flex; align-items:center` を追加すべき。

### Notes（抜粋）
- 受け入れ grep 全合格、タグ開閉・波括弧バランス全ファイル0件、cta-bar 削除の padding 後始末も正しい。
- `.sidebar-user` 二重追加なし、重複セレクタはすべて意図した「基底＋media query 上書き」パターン。

---

## Design Decisions

特になし（既存 ADR-006 の適用漏れ修正のみ）。
