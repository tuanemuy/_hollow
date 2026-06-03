# PR Review #001 — refactor(ui): admin BTN_PRIMARY_CLASS / landing HERO_BTN_* を common pill primitive へ統一 (#425)

**PR:** #441
**Date:** 2026-06-03
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 14
- Verdict: **APPROVED**

2視点（Frontend/Styling、Architecture/Scope/A11y）並列レビューとも Blocker・Warning ゼロ。1ラウンドクリーンで完了。

---

## Frontend / Styling

### Blockers
なし

### Warnings
なし

### Notes
- **[N-001]** `data-primary=""` 付与5箇所すべて正しい（RegistrationForm:135 / LLMSettingsForm:493 / PromptsForm:242 / DesignTokensForm:323 / LandingPage signup）。`pillBtnPrimary` の `data-[primary]:` variant 駆動で accent になり、付け忘れ（accent→surface の無音退行）ゼロ。`data-primary=""`（空文字）は CLAUDE.md ADR-003 の静的属性記法に準拠。
- **[N-002]** SECONDARY（landing login）誤付与なし。`grep data-primary` が landing で 1 件（signup のみ）。逆方向退行（surface→accent）も無い。
- **[N-003]** landing tall の後勝ちを生成 CSS で実証（`.h-9`<`.h-12`、`.px-4`<`.px-8`、`.text-sm`<`.text-md`）。`min-w-[200px]` 末尾合成も #416 `BTN_PRIMARY_INLINE` と同一パターン。
- **[N-004]** dead code なし。旧 `BTN_PRIMARY_CLASS` 削除後の残存参照ゼロ、未使用 import なし、import 位置も既存規約順。
- **[N-005]** DesignTokensForm は primary のみ common 化、`BTN_BASE`/surface/ghost/small が残存し dead code でない。ADR-005/006 の判断と実コードが整合。
- **[N-006]** 視覚回帰差分（duration 120→150ms / active:scale / max-sm:min-h / aria-disabled capability）はすべて ADR-001〜004 に意図的変化として記録済み。opacity は #419 済で差分ゼロ。未記録の回帰なし。

## Architecture / Scope / A11y

### Blockers
なし

### Warnings
なし

### Notes
- **[N-001]** SSOT 集約が #416 パターンに完全準拠。common/styles.ts への新規追加ゼロ（既存 primitive 再利用）で SSOT の二重化なし。
- **[N-002]** named scope の取りこぼし・はみ出しなし（実 grep 確認）。`BTN_PRIMARY_CLASS` 置換後ゼロ、landing data-primary ちょうど1件。DesignTokensForm の BTN_BASE/surface/ghost/small・PromptsForm の ghost・landing `HEADER_CTA` はいずれも意図的残置で plan「含まれないもの」に明記済み。他の `bg-accent-surface` は chip/badge でボタンでない。
- **[N-003]** ADR-001 の duration/ease 記述が tokens.css（`--duration-fast: 120ms`、`--ease-standard: cubic-bezier(0.4,0,0.2,1)`）と完全一致。ease 不変・duration 120→150ms の根拠付けが正確。
- **[N-004]** opacity「差分なし」判断が正しい（admin 旧文字列は #419 で `opacity-disabled` 済、base と一致）。Issue 本文の `opacity-50` は stale。
- **[N-005]** a11y 改善方向が正しい。`max-sm:min-h-[44px]`（admin タップターゲット 44px）・`aria-disabled` capability（anchor 向け純増）はいずれも回帰なしの改善。
- **[N-006]** `data-primary=""` 静的属性記法が CLAUDE.md ADR-003 準拠。LLMSettingsForm:493 の `data-all-env-locked`（動的）と `data-primary`（静的）併存は独立属性で衝突なし。
- **[N-007]** ADR-005 が Issue 本文の誤り（「pillBtnDanger も destructive 相当」）を実コード照合で訂正（ghost vs filled の視覚差）。視覚回帰ゼロ原則に沿う非対象判断は正当。
- **[N-008]** DesignTokensForm の common/ローカル混在は ADR-006 の意図的スコープ限定。将来フォローアップで回収する旨も記録済み。

---

## Design Decisions

このラウンドで新たに見つかった設計判断は特になし（plan/adr の既存 ADR-001〜006 がすべての差分を過不足なく根拠付けており、両レビュアーとも実ソースとの一致を確認）。
