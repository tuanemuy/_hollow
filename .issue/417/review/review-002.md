# PR Review #002 — refactor(ui): public 画面のボタン系統を common へ統一する

**PR:** #434
**Date:** 2026-06-03
**Round:** 2回目（最終確認）

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 5
- Verdict: **APPROVED**

---

## 最終確認（Frontend/Styling ＋ アーキ/回帰リスク）

### Blockers
なし

### Warnings
なし

round 1 のアクション要指摘（ADR-002 の意図的差分列挙に `active:bg-accent-pressed` が漏れ）はドキュメント修正で解消を確認。`.issue/417/adr.md` ADR-002 の Decision に press 時の暗色化（reduced-motion で無効化されない点まで区別して）追記済み。コードは round 1 から不変。round 1 で「非問題／受容範囲」とされた他 Warning も再検証の結果、修正不要で妥当。

### Notes
- [N-001] コード差分は round 1 から不変。実コード差分は public/styles.ts の3定数 common 合成化と consumer 2箇所の data-primary 付与のみ
- [N-002] 全 consumer の data-primary 付与を再網羅確認（accent 3 / surface 4、誤りなし）
- [N-003] スコープ完全性確認：public/styles.ts に残る rounded-pill 系は input/badge/text-link のみで対象ボタン定数の移行漏れなし
- [N-004] ADR の press scale / disabled / opacity 60→55 記述が common pillBtn の実トークンと整合
- [N-005] GATE_SUBMIT が auth BTN_PRIMARY 同型、SEARCH_FORM_BUTTON 中央寄せが SEARCH_FORM_ICON パターン踏襲、ADR-001/004 と実装一致

---

## Design Decisions

特になし（ADR-002 の受容範囲記述を round 1 で補強済み）。
