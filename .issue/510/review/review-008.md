# PR Review #008 — Round 7 nits (N-001 / N-002) 対応の確認

**PR:** #518
**Date:** 2026-06-07
**Round:** 8回目（review-007 の指摘対応の追認 / 未コミット作業ツリー差分）
**対象:** `spec/design/index.md` / `spec/design/pages/{common-toast,P01-signup,P01b-admin-setup,P03-login}.html`（5 ファイル、未コミット差分）

---

## Summary

- Blockers: 0
- Warnings: 0
- Nits: 0（前回 N-001 / N-002 はいずれも解消、N-003 は意図的に据え置きで妥当）
- Verdict: **APPROVED**

review-007（APPROVED + nit 3 件）の指摘対応を追認した。N-001（トースト SSOT 文言の追従）と N-002（P01 の死にルール `.alert-body a`）はいずれも正しく解消され、N-003（per-page margin のばらつき）は前回の判断どおり据え置き（違反ではない）。今回の差分で新たな退行（ブレース崩れ・CSS 破綻・`.form-error` 残骸・トークン違反・canonical 逸脱）は検出されなかった。PR518 のトースト／インラインアラート使い分け intent は引き続き完全に充足している。

---

## 指摘充足マトリクス（review-007 nit）

| # | 指摘 | 判定 | 根拠 |
|---|------|------|------|
| N-001 | トースト SSOT（index.md §241）が「左に細いセマンティックバー**か**アイコン色」のままで、now-canonical なアイコンのみ実装と緩く乖離 | ✅ 解消 | index.md:241 が「塗りつぶし背景**も左のセマンティックバーも使わず**、白地のままアイコン色だけで意味を出す」へ tighten。`common-toast.html` の CSS コメント（204 行）・prose（375-376 行）と**文言一致**。実装側も `border-left` 撤去済み（grep 0 件）で、SSOT・モック規範・実装の三者が「アイコン色のみ」に揃った。EITHER 許容の緩い乖離は消滅。 |
| N-002 | `P01-signup.html` の `.alert-body a` が死にルール（本文内にアンカー無し） | ✅ 解消 | `.alert-body a` は全 `spec/design/pages/` で **P01b-admin-setup.html:287 のみ**に残存（grep）。P01 からは削除済み。P01b は line 455「通常のサインアップは `<a>こちら</a> から`」で実使用しており、局所拡張として正当に維持。NEEDED な `.alert-body a` を失ったページは無し。 |
| N-003 | auth 3 ページの基底 `.alert` margin 方向のばらつき | ✅ 据え置き妥当 | review-007 の判断どおり「per-page 調整は許容範囲・トークン参照で規約遵守・違反ではない」。今回未変更。 |

---

## 回帰チェック（問題なし）

- **N-002 修正後の canonical 一致**: P01 の `.alert-icon`(304) / `.alert-content`(305) / `.alert-title`(306) / `.alert-body`(307) / `.alert-body strong`(308) は P04(308-312) / P15(519-523) / P44(191-195) と**プロパティ単位で完全一致**。canonical はいずれも `.alert-body a` を持たないため、削除により P01 は逆に canonical と完全整合した（前回唯一の divergence が解消）。`.alert` 基底（287-310）も `--alert-accent`/`align-items:flex-start`/`padding:--space-4`/`--radius-lg`/`background:--color-bg`/`color-mix 30%`/`--shadow-xs`/`margin-bottom:--space-6` + `.form .alert{margin-bottom:0}` で正準型を維持。
- **ブレース balance**: P01 **61/61**（前回 62/62 → `.alert-body a` ルール 1 件削除で正しく 1 減）、P01b **70/70**、P03 **63/63**、common-toast **43/43**。すべて開閉一致。
- **`.form-error` 残骸**: 変更 3 ページ（P01/P01b/P03）に `form-error` の文字列ゼロ（grep exit 1）。クラス定義・HTML 利用とも全廃。
- **`border-left` / 塗りつぶし callout 残骸**: 4 ファイルに `border-left` 0 件。`--color-error-surface` のヒットは ① 各ページ冒頭のトークン定義（`#fbebeb`、従来から存在・未変更）と ② `.field.has-error .input { background: var(--color-error-surface) }`（入力フィールドのエラー時背景、本件と無関係の既存ルール・全 auth ページ共通）のみで、撤去した callout 背景とは別物。退行なし。
- **トークン準拠**: 新規マジックナンバー px の混入なし。トースト側 `18px`（`.toast-icon svg`）は SVG アイコン実寸の属性運用で従来踏襲、`calc(var(--text-sm) * var(--leading-snug))`（sub 付き時のアイコン縦中央合わせ）もトークン参照。
- **トースト差分の健全性**: `border-left` 撤去・`padding` 対称化（`--space-3`）・単一行 `align-items:center` / `:has(.toast-sub)` で複数行のみ上揃え、の論理は well-formed（前ラウンド確認から不変）。

---

## 総括

review-007 の APPROVED 後に挙がった nit 2 件（N-001 SSOT 追従 / N-002 死にルール削除）はいずれも的確に対応され、副作用・退行は無い。トースト（白地・アイコン色のみ）とインラインアラート `.alert`（案D）の使い分けは SSOT・参照モック・実装コメントの三層で一貫した。**APPROVED（指摘なし）**。
