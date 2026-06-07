# PR Review #001 — feat(ui): インラインアラートを案D（.alert）に統一する実装追従

**PR:** #547
**Date:** 2026-06-07
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 2
- Notes: 10
- Verdict: **BLOCKED**（Warning を全件修正のため）

---

## フロントエンド / モック忠実度・a11y

### Blockers
なし

### Warnings

- **[W-001]** P47/P40 の `alert.code` mono 見出しが mock とフォントサイズ不一致（`text-sm` vs mock `text-xs`、不要な負トラッキング残存）
  - 場所: `app/components/admin/Dashboard/index.tsx:84` / `app/components/admin/Metrics/index.tsx:198`（`${ALERT_TITLE} font-mono`）、定数 `common/styles.ts`
  - 理由: P47 mock の `.alert-title` mono ローカル変種は `font-mono` + `text-xs` かつ letter-spacing 指定なし。`${ALERT_TITLE} font-mono` だと `text-sm` + `tracking-[-0.01em]` のまま mono 化され 1 段大きく描画される。
  - 提案: mono 見出し専用定数（`text-xs` + `font-mono`、tracking なし）を切り出して共有する。
  - **対応:** `common/styles.ts` に `ALERT_TITLE_MONO = "m-0 text-xs font-mono font-semibold text-[var(--alert-accent)]"` を新設し、Dashboard/Metrics の見出しを置換（重複 `font-mono` も除去）。✅ 修正済み

- **[W-002]** P01b アラート本文内リンクが hover 時のみ下線（mock は常時下線）
  - 場所: `app/components/auth/AdminSignUpForm/index.tsx`（本文 `<Link className={textLink}>`）
  - 理由: P01b mock `.alert-body a { color: accent; text-decoration: underline; text-underline-offset: 3px }`（常時下線）。`textLink` は hover 時のみ下線。
  - 提案: 本文リンク用に常時下線を当てる（または `ALERT_BODY` に `[&_a]` ルールを追加）。
  - **対応:** `ALERT_BODY` に `[&_a]:text-accent [&_a]:underline [&_a]:[text-underline-offset:3px]` を追加（mock `.alert-body a` を全アラート共通で再現）。AdminSignUpForm 本文リンクから冗長な `textLink` を除去（terms/privacy リンクの `textLink` は現役のため import 保持）。✅ 修正済み

### Notes
- severity → tone / icon マッピングは案Dの4 tone に正しく収束（`critical→ERROR`、icon は P47 と一致）。
- info の無彩色グレー厳守（`--color-info = var(--color-accent)`、border が chroma 0 と計測確認）。
- a11y 契約が正しい（アイコン装飾 `aria-hidden`、box 側 `role` が用途に整合し mock と 1:1）。
- 新規リテラル px の持ち込みなし（`mt-px`/`tracking-[-0.01em]`/offset 3px は mock 値を忠実に写したもの）。
- 旧 4 系統（CALLOUT 系/NOTICE）完全削除、残参照ゼロ。
- P06 は mock の SVG（circle）に合わせ `AlertCircle` を採用、独自解釈なし。

## スタイリング規約・スコープ整合・リファクタ健全性

### Blockers
なし

### Warnings

- **[W-001]**（フロントレビューと同一指摘）admin mono 見出しが mock の `text-xs` / no-tracking と乖離。→ 上記 W-001 対応で解消。

### Notes
- スコープ整合は良好。スコープ外（P12/P17/P20/P24/P33/P41/common-confirm-dialog/P01/FORM_ERROR 全面化/export/ステータスバッジ/トースト）はすべて未変更。
- リファクタ健全性良好。削除定数の参照漏れゼロ、`BANNER_*`/`bannerToneFor`/`BannerTone` 完全除去、未使用 import なし。
- CLAUDE.md Styling 規約適合（utility-first 維持、トークン経由、module-scoped 定数集約、severity は定数 map、border 幅+色両方）。
- progress.md の P13/P15 委譲判定は妥当（純新規 UI を #541/#509/#401 へ、既存表示の格上げ取りこぼしなし）。

---

## Design Decisions

`ALERT_TITLE_MONO` を新設（P47 監視キー見出しの mono ローカル変種）。`${ALERT_TITLE} font-mono` の合成では mock の `text-xs` / no-tracking を再現できないため、専用定数として切り出した。`ALERT_BODY` の `[&_a]` ルール追加で mock の `.alert-body a`（常時下線 accent）を全アラート共通で担保した。重要度は中程度のため ADR への追記は不要と判断（実装詳細）。
