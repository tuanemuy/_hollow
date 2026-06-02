# PR Review #001 — refactor(ui): auth ボタン系統 (BTN_*) を common pill primitive へ統一する

**PR:** #424
**Date:** 2026-06-02
**Round:** 1回目

---

## Summary

- Blockers: 1
- Warnings: 1
- Notes: 13
- Verdict: **BLOCKED**

---

## Frontend / Styling

#### Blockers
- なし

#### Warnings
- なし

#### Notes
- **[N-001]** data-primary 付与の網羅性・正確性が完璧。17 箇所全てに `data-primary=""`、surface 系 BTN_SECONDARY_TALL には付けていない。無音退行リスク解消。
- **[N-002]** data-* 規約準拠（静的 on = `data-primary=""`）。
- **[N-003]** JSX 正確性。multiline button で disabled 属性保持、biome クリーン。
- **[N-004]** size add-on 後勝ちを実ビルドで検証（h-9<h-12, px-4<px-8, text-sm<text-md）。
- **[N-005]** 意図的変化（disabled 60→55, active:scale, aria-disabled 継承）すべて ADR 記録済み。
- **[N-006]** 死蔵 BTN_SECONDARY 削除の参照漏れなし、未使用 import なし。
- **[N-007]** pillBtnTall の JSDoc が pillBtnPrimary/Danger と同水準。

## CSS Cascade / Architecture

#### Blockers
- **[B-001]** `justify-center` の欠落による text 左寄せ退行（視覚回帰、ADR 未記載・未認識）
  - 場所: `app/components/common/styles.ts:21`（`pillBtn` base に `justify-center` なし）/ `app/components/auth/styles.ts`（BTN_PRIMARY / BTN_PRIMARY_INLINE / BTN_SECONDARY_TALL の新合成）
  - 理由: 旧 BTN_* は 4 つすべてが `justify-center` を持っていた。新合成チェーン（pillBtn + pillBtnTall + pillBtnPrimary）には `justify-center` が無く、base は `inline-flex items-center` で水平デフォルト = flex-start。ボタン幅がテキストより広いとき（w-full / min-w-[200px]）テキストが左寄せになる。manual-test スクショ tc-001-login.png で「ログイン」テキストの左寄せを実視確認（旧 UI は中央揃え）。TC-001 が PASS したのは水平 alignment を検証項目に含めていなかったため。
  - 提案: (a) `pillBtnTall` add-on に `justify-center` を含める（縦長 pill は full/min-width 運用が前提）、または (b) auth 各合成末尾に `justify-center` を足す。ADR への記録も必要。
  - → 修正: (a) を採用。`pillBtnTall` に `justify-center` を追加し ADR-001 に記録。

#### Warnings
- **[W-001]** `pillBtnTall` の line-height が text-sm 由来になる（軽微、ADR-005 の分析が片手落ち）
  - 場所: 生成 CSS（`.text-md{font-size:var(--text-md)}` のみで line-height ペアなし）
  - 理由: text-md は font-size のみ宣言。pillBtn(text-sm) + pillBtnTall(text-md) で font-size は text-md が後勝ちするが line-height は text-sm の値（≈1.43）が残る。実害は小さい（h-12 固定・items-center 単一行で line-height はレイアウトに効かない）が、ADR-005 が font-size の後勝ちのみ論じ line-height の取り残しに言及していない。
  - 提案: ADR-005 に line-height の挙動を補足する。
  - → 修正: ADR-005 に補足を追記。

#### Notes
- **[N-001]** 後勝ち検証を生成 CSS のバイトオフセットで確定（h-9<h-12, px-4<px-8, text-sm<text-md）。ADR-005 の主張と一致。
- **[N-002]** SSOT / 配置妥当。pillBtnTall は common、auth 固有差分（w-full / min-w）は合成末尾に残置。
- **[N-003]** data-primary 17 箇所全付与、surface 系は属性なしで正しい。
- **[N-004]** gap 判断妥当（gap-0 は後勝ちできず & テキストのみで無害）。
- **[N-005]** 意図的変化（ADR-002/003/004）は実コードと一致。

---

## Design Decisions

- B-001 修正で `justify-center` を `pillBtnTall` に含める判断（縦長 pill は width-constrained CTA 運用が前提で、content-width 利用でも無害）を ADR-001 に追記する。
- W-001 で text-md が line-height ペアを持たず text-sm の line-height が残る挙動を ADR-005 に補足する（実害なし）。
