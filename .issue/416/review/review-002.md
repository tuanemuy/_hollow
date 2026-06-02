# PR Review #002 — refactor(ui): auth ボタン系統 (BTN_*) を common pill primitive へ統一する

**PR:** #424
**Date:** 2026-06-02
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 12
- Verdict: **APPROVED**

---

## Frontend / Styling

#### Blockers
- なし

#### Warnings
- なし

#### Notes
- **[N-001]** B-001 修正が正しく反映。`pillBtnTall = "h-12 px-8 text-md justify-center"`、auth 各合成からは重複指定なし（SSOT 維持）。
- **[N-002]** カスケード安全性確認。base `pillBtn` は `justify-content` を一切宣言しないため `justify-center` は唯一の宣言で後勝ち順序に依存せず確定適用。
- **[N-003]** content-width pill への波及なし。pillBtnTall consumer は auth 3 定数のみで全て width-constrained。base に入れなかった判断で他 ~28 箇所は不変。
- **[N-004]** auth ボタンの中央寄せが意図通り（1周目ブラウザ実視確認と整合）。
- **[N-005]** data-primary 付与の正確性維持。
- **[N-006]** ADR 記録完備（ADR-001 justify-center 判断 / ADR-005 line-height 補足）。

## CSS Cascade / Architecture

#### Blockers
- なし

#### Warnings
- なし

#### Notes
- **[N-001]** B-001 修正を生成 CSS で実証（`.justify-center{justify-content:center}` 1回出力、base に justify-content 宣言なしで競合なし）。
- **[N-002]** ADR-001 の justify-center 判断記述が実コードと矛盾なし。
- **[N-003]** 死蔵 BTN_SECONDARY 削除の参照漏れなし。
- **[N-004]** data-primary 網羅性を全 auth consumer で確認。
- **[N-005]** W-001 補足（text-md は line-height ペアなし・h-12 単一行で実害なし）の記述が生成 CSS と一致。
- **[N-006]** size add-on の後勝ち（拡大方向のみ）を生成 CSS バイトオフセットで再確認。ADR-005 の一般化と整合。

---

## Design Decisions

特になし（1周目で記録した ADR-001 補足・ADR-005 補足で完結）。

---

## 結論

1ラウンド目の Blocker [B-001] / Warning [W-001] は 2 ラウンド目で両視点とも解消確認。Blocker 0 / Warning 0 で APPROVED。1ラウンドクリーンのためレビュー完了。
