# PR Review #003 — P20 broken バナーの `.alert` 案D 移行（追加変更）

**PR:** #548
**Date:** 2026-06-07
**Round:** 3回目（APPROVED 後の追加変更に対する focused レビュー）

---

## Summary

- Blockers: 0
- Warnings: 1 → 修正済み
- Notes: 良好
- Verdict: **APPROVED**

### 経緯
review-002 で APPROVED 済みだったが、#539 の実装（PR #547）が main にマージされ `common/styles.ts` に `.alert` 案D の共有 primitive が揃ったため、ADR-004/E-3 で #539 に委ねていた P20 broken バナーの案D 化を本 PR で追加実施（コミット 555cb96）。#547 は P20 broken バナーを含んでおらず #539 は CLOSED だったため、宙に浮いた残課題を本 PR で回収した。この追加変更に絞って focused レビューを実施。

---

## broken バナー案D 移行レビュー

### Blockers
なし

### Warnings
- **[B3-W-001]** アラートアイコンのサイズがモック（20px）および #547 の全 `ALERT_ICON` 利用箇所（`size={20}` 明示）と不一致でデフォルト 16px のままだった。`ALERT_ICON` の `mt-px` は 20px 前提のベースライン合わせのため縦位置にも波及。
  - 場所: `app/components/view/SavedViewsList/index.tsx`（`<Icon icon={AlertTriangle} />`）
  - 対応: **修正済み** — `<Icon icon={AlertTriangle} size={20} />` に変更し、auth/admin の全 ALERT_ICON 利用（size=20）と統一。

### Notes
- 共有 ALERT primitive（`ALERT`/`ALERT_WARNING`/`ALERT_ICON`/`ALERT_CONTENT`/`ALERT_TITLE`/`ALERT_BODY`/`ALERT_BODY_CODE`）を正しく再利用し独自再発明なし。
- `brokenDetail` を `<ul>` + `<li>`（複数 broken 条件対応）で表現するのは mock 単一 `<p>` との妥当な差分。Tailwind preflight の ul リセット + `ALERT_BODY` の `m-0` で bullet は出ない（確認済み）。
- `fixBtn` の `ml-auto self-center max-sm:ml-0 max-sm:self-start`、`max-sm`(640px) の flex-wrap、`bg-surface`/`hover:bg-surface-hover` 配色は mock `.fix-btn` と一致。リテラル px の新規持ち込みなし。
- `role="status"` は mock 準拠。ADR-004 追補は実装と一致。
- ブラウザ目視（`screenshots/tc5-broken-banner-alert-d.png`）で白地 + warning ヘアライン枠 + shadow + code チップ + 修復ピルを確認。

---

## Design Decisions

特になし（ADR-004 追補で記録済み）。

---

## 完了

唯一の Warning（アイコンサイズ）を修正し再検証クリーン。Blocker 0 / Warning 0 で APPROVED。
