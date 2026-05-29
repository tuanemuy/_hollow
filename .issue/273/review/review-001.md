# PR Review #001 — pillボタンスタイルを common 1系統に集約

**PR:** #328
**Date:** 2026-05-29
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 12
- Verdict: **APPROVED**

2レイヤー並列レビュー（Frontend/Styling、移行網羅性・回帰リスク）。両レイヤーとも Blocker / Warning ゼロ。1ラウンドクリーンで完了。

---

## Frontend / Styling

#### Blockers
なし

#### Warnings
なし

#### Notes
- **[N-001]** danger 9 consumer 全件が `${pillBtn} ${pillBtnDanger}` + `data-danger=""` をペアで保持。className 出現数と data-danger 出現数が一致（機械的確認）。付け忘れによる「色が出ない」ケースゼロ。
- **[N-002]** primary 側も全 consumer が `${pillBtn} ${pillBtnPrimary}` + `data-primary=""` で揃う。
- **[N-003]** 静的常時 danger の `data-danger=""`（空文字・常時ON）は CLAUDE.md ADR-003 の「statically-on は data-x=""」慣習に準拠。`data-[danger]:` は値でなく属性の存在を判定するため空文字で発火。
- **[N-004]** 押下アニメ `active:scale-[0.985] motion-reduce:active:scale-100` は canonical pillBtn に一元付与、全 pill が自動取得。reduced-motion で無効化。
- **[N-005]** import 整理良好（PILL_BTN のみ除去、FORM_ERROR/ROW_ACTIONS/FIELD_* 等は維持）。typecheck パス、未使用 import 0。
- **[N-006]** pillBtnDanger の JSDoc に「data-danger 必須」「素 utility の出力順負け」理由と ADR-003 参照を明記。付け忘れ防止ガイダンスとして適切。

## 移行網羅性・回帰リスク

#### Blockers
なし

#### Warnings
なし

#### Notes
- **[N-001]** 移行網羅性は完全。plan.md の 8 consumer すべて移行済み。`grep PILL_BTN | grep -v public/` は 0 件。layout の PILL_BTN export 削除、ROW_ACTIONS_SMALL_PILL 等は残存。
- **[N-002]** pillBtnDanger の適用形は全 9 consumer（移行6+既存3）で統一。`className={pillBtnDanger}` 単独残存ゼロ。
- **[N-003]** public/styles.ts は不可侵（diff --stat で変更なし）。スコープ外判断は妥当で誤爆なし。
- **[N-004]** ADR-003 の Tailwind CSS-order 主張は技術的に妥当。variant utility が base utility の後にソートされ確実に勝つのは Tailwind v4 の確立挙動。manual-test の computed style 実測が経験的に裏付け。
- **[N-005]** 退行なし・型安全。typecheck exit 0、Biome 13ファイル No fixes。押下アニメは移行8ボタンも common ~28 ボタンも統一取得。
- **[N-006]** ROW_ACTIONS_SMALL_PILL 放置は一貫性を損なわない（consumer 不在・別バリアント、ADR-001補足に将来方針あり）。

---

## Design Decisions

特になし（ADR-001〜003 は計画/実装フェーズで記録済み。ADR-003 はブラウザ検証で発見した既存灰色描画バグへの data 駆動 variant 化による根本修正で、レビューでも技術的妥当性を確認）。
