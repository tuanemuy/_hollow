# PR Review #001 — feat(a11y): prefers-reduced-motion を motion-reduce バリアント一括併用で対応

**PR:** #123
**Date:** 2026-05-21
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 7（重複削除後）
- Notes: 多数（おおむねポジティブ）
- Verdict: **BLOCKED**（Warning 7 件をその場で修正してから再レビュー）

---

## Frontend / Styling

### Blockers
なし

### Warnings

- **[W-F-001]** `motion-reduce:transition-none` の挿入位置が一貫していない
  - 場所: `app/components/admin/DesignTokensForm/index.tsx:23,30,34` / `app/components/admin/Jobs/index.tsx:29` / `app/components/admin/LLMSettingsForm/index.tsx:35,38,40` / `app/components/admin/PromptsForm/index.tsx:42,45,47` / `app/components/admin/RegistrationForm/index.tsx:18,21,80` / `app/components/admin/UsersTable/index.tsx:34` / `app/routes/admin/route.tsx:42,145`
  - 理由: `styles.ts` 系では `transition-colors motion-reduce:transition-none ...` と直後に併記、`admin/*` 系では `transition-colors duration-[...] ease-[...] motion-reduce:transition-none ...` と duration/ease を挟んだ位置。CLAUDE.md L52「同位置に併用」、運用ルール grep 検知の精度に影響
  - 提案: `admin/*` 側を `transition-colors motion-reduce:transition-none duration-[...] ease-[...]` に揃える

### Notes
- 全 59 箇所の網羅率は完璧。`rg "transition-(colors|all|transform|opacity|shadow|\[)"` のうち `motion-reduce:` 併用なしは 0 件
- arbitrary value transition (`public/styles.ts:45,113,139`) も漏れなく対応
- RegistrationForm のトグルスイッチは 1 className 内に body と疑似要素の対応を押し込む構造上やむを得ず、可読性は許容範囲

---

## A11y / UX

### Blockers
なし

### Warnings
なし

### Notes
- WCAG 2.3.3 (Animation from Interactions) の要件カバレッジは適切
- `focus:shadow-focus` などの focus indicator 自体は維持（即時切替になるのみ）。WCAG 2.4.7 (Focus Visible) と両立
- `backdrop-filter` は意図通り抑制対象外
- 公開ページ（landing / login / signup / public profile / search / share gate）の網羅対応は a11y 観点で重要
- `motion-safe:animate-pulse` 先行例と `motion-reduce:*` の対称性が保たれている
- `PasswordResetConfirmForm` 強度メーターの色変化抑制も対応済み

**Verdict (A11y/UX 単独)**: APPROVED

---

## Architecture / Documentation

### Blockers
なし

### Warnings

- **[W-A-001]** ADR-007 のステータスが `Proposed` のままになっている
  - 場所: `.issue/72/adr.md:7`
  - 理由: 本 PR が ADR-007 を起源とする実装変更を同梱しており決定済み。`.issue/70/adr.md` の ADR-001〜006 はすべて `Accepted` で統一されている
  - 提案: `Status` を `Accepted` に変更（任意で「Accepted: 2026-05-21 (PR #123)」と付記）

- **[W-A-002]** CLAUDE.md の Motion ルールだけ日本語で記述されており、既存 Styling 箇条書きの英語スタイルから外れている
  - 場所: `CLAUDE.md:52`
  - 理由: Styling セクションの他 8 項目は英語の宣言文 + 詳細形式。Motion 行だけ日本語の常体で混在
  - 提案: 他項目と同じ英語スタイルに揃える

- **[W-A-003]** variant ordering の根拠が ADR / CLAUDE.md のどちらにも説明されていない
  - 場所: `.issue/72/adr.md` 全体 / `CLAUDE.md:52`
  - 理由: `motion-reduce:after:` を慣用とする決定だけが残っており、なぜそれが望ましいかの根拠不在
  - 提案: ADR-007 の本文か Related に「grep ベース検知の容易さ」「Tailwind 公式 variant ordering 推奨」など根拠を 1〜2 行追記

- **[W-A-004]** `.issue/72/plan.md` step 7 の記述と最終実装で variant ordering が食い違っている
  - 場所: `.issue/72/plan.md:92` 付近
  - 理由: plan.md は `after:motion-reduce:transition-none`、実装は `motion-reduce:after:transition-none`。今後 plan.md を参照する人が逆順を再導入するリスク
  - 提案: plan.md step 7 を `motion-reduce:after:transition-none` に修正

- **[W-A-005 / W-F-002]** ADR-007 内の「約 48 箇所」と plan.md の「約 59 箇所」が不一致
  - 場所: `.issue/72/adr.md` の Context / Decision 理由 5 / Consequences の各「約 48 箇所」
  - 理由: plan.md は P-001 で 48 → 59 に修正済みだが ADR 側は更新漏れ
  - 提案: ADR-007 内の 3 箇所の「約 48 箇所」を「約 59 箇所」に統一

- **[W-F-003]** TC-004 報告に未生成（はずの）utility ルールが事実として記載されている
  - 場所: `.issue/72/.manual-test/results/TC-004.md`
  - 理由: ソースに `after:motion-reduce:transition-none` は存在しないが、TC-004 は `.after\:motion-reduce\:transition-none` を「検出された utility 例」として列挙
  - 提案: TC-004 の例示一覧から該当行を削除、`hasAfterTransitionNone` の OR 判定なら備考に追記

### Notes
- ADR-002 の精神を ADR-007 が緩めていない（Decision 理由 1 で「議論の余地あり」と緩和表現、主たる根拠は次項以降に置く）
- `.issue/72/` ディレクトリ構造は `.issue/70/` と一致
- spec/design 整合性メモが ADR-007 Related に明記され spec-sync 誤検出予防として機能

---

## Design Decisions

このラウンドで新たに見つかった設計判断はなし。既存の ADR-007 の補強（variant ordering 根拠の明文化）が W-A-003 として求められている程度。
