# PR Review #001 — fix(design): 見出し・本文の幅制約と強制改行による不自然な折り返しを解消 (#199)

**PR:** #377
**Date:** 2026-05-31
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 3（いずれもコード変更不要と判定 — 詳細は各項目の「対応」を参照）
- Notes: 11
- Verdict: **APPROVED**

---

## Frontend

### Blockers
なし

### Warnings

- **[W-001-FE]** `m-0` と `mt-2` の相殺は堅牢だが意図がコード上に表れていない
  - 場所: `app/components/landing/LandingPage.tsx`（FOOTER_TAGLINE 第2段落）
  - 理由: CSS のロングハンド優先（`margin-top` が `margin` ショートハンドに勝つ）で `mt-2` が常に効くため結果は正しい。実害なし。
  - **対応: 変更なし。** ロングハンド優先は CSS 仕様で保証された挙動であり堅牢。`space-y-2` ラッパで囲む案も提示されたが、JSX 構造を増やす利得が薄く現状で十分。

### Notes
- **[N-001]** `max-w-[var(--content-max)]` は任意値記法で `@theme inline` ブリッジ不要。既存の `PROFILE_NAME`（styles.ts:83）と同一パターンで先例・規約に整合。
- **[N-002]** `text-balance`/`text-pretty` は Tailwind v4 ネイティブ。見出し/本文の使い分けが用途に合致。
- **[N-003]** `grep` でアプリ全体の `ch` 幅 0 件。AC を厳密充足。
- **[N-004]** landing/auth の折り返し `<br />` 0 件。スコープ外（メール HTML・markdownRenderer コメント）は意図通り未変更。
- **[N-005]** rem リテラル幅は全て module-scoped 定数内で JIT スキャン対象。規約準拠、新規 CSS/`@apply` なし。
- **[N-006]** レスポンシブ・アクセシビリティへの悪影響なし。`<br />` 削除・段落分割はむしろ読み上げ改善。

---

## Design/UX

### Blockers
なし

### Warnings

- **[W-001-UX]** SECTION_LEAD（44rem）と PROFILE_BIO（760px）は英語ダミー時に1行が ~75ch をわずかに超える
  - 場所: `LandingPage.tsx`（SECTION_LEAD）、`public/styles.ts`（PROFILE_BIO）
  - 理由: 主対象の日本語(CJK)では適切レンジ（SECTION_LEAD ≈41字/行・PROFILE_BIO ≈47字/行）。英語では ~78ch/~84ch と理想上限を微超過するが「破綻」はしない。
  - **対応: 変更なし。** AC「英語ダミーで破綻しない」は満たす（report.md の TC-2/TC-6 で崩れなし確認済み）。CJK が主対象で、英語に寄せると CJK が窮屈になるトレードオフ。本格 i18n 対応は本Issueのスコープ外であり、「念のため Issue」化もしない（Phase 4 方針）。

- **[W-002-UX]** FOOTER_TAGLINE の `max-w-[30rem]` が 1280px の grid トラック（1.4fr≈360px）より広く効いていない
  - 場所: `LandingPage.tsx`（FOOTER_TAGLINE / FOOTER_GRID）
  - 理由（レビュアー指摘）: desktop の `lg:grid-cols-[1.4fr...]` トラック幅で先に折り返すため cap が非拘束。
  - **対応: 変更なし（指摘は desktop のみの分析で不完全）。** FOOTER_GRID は `grid-cols-1`（モバイル/<lg）→ `lg:grid-cols-[1.4fr_1fr_1fr_1fr]` のレスポンシブ定義。モバイル単一カラムでは tagline がコンテナ全幅トラックに置かれるため、`max-w-[30rem]`(480px) が**実効的に効き**、tagline が全幅に間延びするのを防ぐ。desktop で非拘束なだけで、削除するとモバイルで回帰する。よって据え置きが正しい。

### Notes
- **[N-001]** 4つの AC をすべて充足。`grep` で `ch`/折り返し `<br />` 0 件、biome クリーン。
- **[N-002]** text-balance（見出し）/text-pretty（本文）の役割分担が CSS 設計意図どおり。
- **[N-003]** HERO_TITLE の max-w 完全撤去で間延びリスクなし（report.md: 1280px 1行/1024px 2行均等）。ADR-001 に退路も明記。
- **[N-004]** PROFILE_BIO の `--content-max` 採用は PROFILE_NAME と幅基準が統一され一貫性向上。SSOT 尊重（ADR-002）。
- **[N-005]** auth の `<br />` 削除で意味のまとまり維持。密接案内文は改行のみ削除、独立2文（フッター）は段落分割という使い分けが妥当。

---

## Design Decisions

このラウンドで新たな設計判断はなし。W-002 の「FOOTER_TAGLINE max-w はモバイル単一カラムで実効」という点は既存実装の意図の再確認であり、ADR 追記は不要。

## 完了判定

Blocker 0件。Warning 3件はいずれも精査の結果コード変更不要（W-001-FE: CSS 仕様で堅牢 / W-001-UX: AC 充足・i18n はスコープ外 / W-002-UX: モバイルで実効のため削除不可）。実体としてのクリーンに達したと判断し、1ラウンドで **APPROVED**。
