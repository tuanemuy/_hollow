# PR Review #001 — モバイルボタンのサイズ整合性改善 (#633)

**PR:** #640
**Date:** 2026-06-11
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 16
- Verdict: **APPROVED**

レビューレイヤー: Frontend/Styling、Design Spec/Mock Consistency の2視点を並列実施。両視点とも Blocker・Warning ゼロ。1ラウンドクリーンで完了。

---

## Frontend / Styling

#### Blockers
なし

#### Warnings
なし

#### Notes
- **[N-001]** 定数化と Tailwind JIT の整合は正しい。`TOUCH_TARGET` / `TOUCH_TARGET_SQUARE` / `pillBtnSmDense` はいずれも完結したクラストークンリテラルで、テンプレートリテラル合成はランタイム結合に過ぎず JIT 走査に影響なし。
- **[N-002]** `pillBtn` h-9→h-10 / `pillBtnIcon` w-9→w-10 の波及は健全。`pillBtnTall`(h-12 enlarging)・`pillBtnSm`(data-[sm] variant) の specificity 勝敗維持、`pillBtnIcon` の正方形(h-10 w-10)も保持され「縦長事故」回避。
- **[N-003]** 床解除の opt-in 反転は specificity 上正しい。新デフォルト小型ボタンは base 床(0,1,0)のみで競合消失→生成順依存に陥らず、`pillBtnSmDense`の(0,2,0)が確定的に勝つため`!important`不要。
- **[N-004]** admin の `!important` 床回復撤去＋`pillBtnSmDense`切替に漏れ・副作用なし。Jobs(5)/UsersTable(4)/DesignTokensForm(1)全切替、`data-sm=""`維持、`min-h-[44px]!`残骸0件。
- **[N-005]** 直書き床→定数参照の import パス全件正しい(typecheck exit 0)。直書き`min-h/w-[44px]`残骸0件。
- **[N-006]** 非admin消費者(identity/publication/tag TagActions)の据え置きは正しい。`pillBtnSmDense`への誤切替なし、`data-sm=""`維持。
- **[N-007]** `LINK_MINI_ROW` 床回復撤去は妥当。#589 ADR-007 の latent bug が自動解消。
- **[N-008]** JSDoc の px 直値言及は新方針に更新済み、取り残しなし。
- **[N-009]** 役割差の意図的高さ(auth h-11、public ヒーロー h-12 等)は維持。
- **[N-010]** spec/design/index.md の px 撤廃は計画どおり、ADR-001 の依存方向遵守。

## Design Spec / Mock Consistency

#### Blockers
なし

#### Warnings
なし

#### Notes
- **[N-001]** 指針の px 撤廃は完遂(§3/§7.1/寸法ノーマライズ/行225 の4箇所)。残存する 24/44 はアイコンサイズ・ブレークポイント等の正当な値。
- **[N-002]** ADR-001 の依存方向遵守。指針本文に実装定数名(TOUCH_TARGET)のヒットゼロ。
- **[N-003]** モック98ファイルでグローバル床が主要アクション限定に統一、blanket 床ゼロ、方針割れ解消。
- **[N-004]** 実装側の寸法・密度が一致(.pill-btn=40 / admin .btn=40 / standalone .icon-btn=36 / mobile admin .btn.sm=compact 28)。
- **[N-005]** 床解除例外の opt-in 反転が完遂、LINK_MINI_ROW の latent bug 自動解消。
- **[N-006]** 履歴ファイル(review/drafts)は無改変、desktop/mobile basename 対応は妥当(common-toast の desktopのみは正当)。

---

## Design Decisions

このラウンドで新たに見つかった設計判断: 特になし（Phase 1/2 の ADR-001〜004 で網羅済み）。
