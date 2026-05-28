# PR Review #002 — feat(issue/292): add button form usage guideline to spec and align existing UI

**PR:** #304
**Date:** 2026-05-29
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 1 (新規) → 修正済み
- Notes: 8
- Verdict: **APPROVED with one suggestion fixed**

---

## Spec / Design Documentation

### Blockers
なし

### Warnings

- **[W-S-004]** 「リンク的ボタン」の客観基準と例示が矛盾していた → **修正済み**
  - 場所: `spec/design/index.md:135`
  - 内容: 3 条件「①`<a>` 実装 / ②pill 形状ではない / ③周囲に primary CTA 無し」の例として「サインアップ／ログイン」を併記していたが、実装 (`PublicLayout.tsx`) では「ログイン」は `PILL_BTN`（pill 形状の primary CTA）で条件②③に該当しない。
  - 対応: 例を「サインアップ」(`PUBLIC_TEXT_LINK_SIGNUP`) のみに絞り、隣接する「ログイン」(`PILL_BTN`) は条件②③の対照例として参照する形に修正。

### Notes

- **[N-S-006]** W-S-001 解消確認: MUST/SHOULD が明確に分離され、§4 ホバー非依存原則と整合。
- **[N-S-007]** W-S-002 解消確認: chip 本体 (L134) → close 例外 (L145) の forward reference が機能。
- **[N-S-008]** W-S-003 の主旨達成: 3 条件で客観基準化。例の問題（W-S-004）は本ラウンドで修正済み。
- **[N-S-009]** L144「本節冒頭の通り」の二重参照を「§7.1 本文の通り」に統一（追加 fix）。
- **[N-S-010]** §3 / §7.1 本文 / §8 / §4 との整合性 OK。例外（admin / chip close）は親ルールへの参照と理由付きで記述。
- **[N-S-011]** 例外 (a)/(b) と ADR-001/002 の整合 OK。
- **[N-S-012]** Issue #292 完了条件はすべて記述済み。
- **[N-S-013]** ConfirmDialog 11箇所と UI 修正分は1周目 review-001 で APPROVED 確認済み、本ラウンドでは spec のみ再評価。

---

## Design Decisions

新規設計判断は無し。W-S-004 は実装事実に合わせた例の修正のみ。

---

## Verdict

**APPROVED** — 全 Blocker / Warning 解消。次のラウンドでクリーン判定見込み。
