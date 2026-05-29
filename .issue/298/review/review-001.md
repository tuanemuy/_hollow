# PR Review #001 — fix(issue/298): パネルと Button 背景色の同化を解消（bg-surface-elevated 昇格）

**PR:** #324
**Date:** 2026-05-29
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 12
- Verdict: **APPROVED**

レビューレイヤー: (1) Frontend / Styling / アクセシビリティ、(2) デザインシステム整合 / spec 整合 / 回帰スコープ。両レイヤーとも Blocker・Warning ゼロ。

---

## Frontend / Styling / アクセシビリティ

### Blockers
- なし

### Warnings
- なし

### Notes
- **[N-001]** `bg-surface-elevated` は `tokens.css:14`（`#fbfbfd`）定義 + `index.css:17` の `@theme inline` ブリッジ済みで Tailwind ユーティリティとして正しく解決。タイポなし。新トークン追加ゼロで CLAUDE.md 規約準拠。
- **[N-002]** utility-first / トークン規約違反なし。ハンドCSS・`@apply`・新規CSS追加なし。3ファイルとも className 内1語の差し替えのみ。共有定数（`pillBtn`/`chip`/`fieldControl`）無改変で ADR-001 を実コードでも担保。
- **[N-003]** 同色衝突の再発なし。3パネル内部の塗り要素は全て新パネル色より暗く（surface #f5f5f7 / surface-hover #ececef）、`bg-surface-elevated` を使う子要素は存在しない。「白 > elevated > surface > surface-hover」の単調階調が成立。
- **[N-004]** hover/focus/disabled と矛盾なし。`pillBtn` hover=`bg-surface-hover` は明るいパネル上で従来以上にコントラストが付き、`fieldControl` の `focus:bg-bg`(白) はパネルより明るく自然な反転。
- **[N-005]** 3ファイルの変更は完全に一貫。plan.md の行番号と一致。ADR-002（admin 不対応）も妥当。
- **[N-006]** WCAG テキストコントラストはむしろ僅かに向上（背景が白に近づく方向）。境界視認性は明度差 + `border-hairline` で担保。

## デザインシステム整合 / spec 整合 / 回帰スコープ

### Blockers
- なし

### Warnings
- なし

### Notes
- **[N-001]** パネル昇格は tokens.md L30/L32 の用途定義（surface=入力/ボタン、surface-elevated=浮上カード）と完全整合。衝突解消が同時に「規約準拠への是正」になっている。
- **[N-002]** admin DesignTokensForm の `CARD_CLASS`（L39）は `bg-bg`(白) を実コードで確認。対応不要の ADR-002 は正確。
- **[N-003]** `app/components`・`app/routes` 総当たりで見落とし箇所なし。landing `FEATURE_CARD`（内部アイコン bg-bg）・auth `CALLOUT`/`NOTICE`（アクションはテキストリンク）・FilterBar/NoteListToolbar の select/input（白ページ上の単独コントロール）はいずれも非衝突で対象外妥当。
- **[N-004]** `pillBtn` 参照ファイル数を実測＝29 ファイル（ADR の「約28」と一致）。SSOT 温存・パネル3点のみ変更の回帰スコープ絞り込みは妥当。
- **[N-005]** spec/design/tokens.md の更新不要で正しい（トークン値・用途定義の変更を伴わない付け替えのみ）。
- **[N-006]** 明度差約4%は控えめだが `border-hairline` 併用＋目視 PASS でカバー済み。将来さらに分離を強める場合のみ `border-hairline-strong` が次の一手（今回は不要）。

---

## Design Decisions

特になし（Phase 1 で記録済みの ADR-001 / ADR-002 を両レビュアーが実コードで裏取りし妥当と確認）。
