# Review 002 — 計画・Issue 要件整合とアクセシビリティ（PR #648 / Issue #626）ラウンド2

レビュー対象: PR #648（デザインモックのみ、未コミット修正分含む `git diff origin/main`）
参照: Issue #626 / `.issue/626/plan.md` / `.issue/626/adr.md` / `.issue/626/review/review-001-plan-a11y.md`

## 総評

ラウンド1指摘の修正をすべて確認した。Issue の2課題（表示切り替えの視覚的優先度・CTA 重複）の解消、plan.md の実装ステップ完遂、スコープ限定（P10 系モック + drafts + .issue/626 のみ）はラウンド1の評価から変化なし。W-1（フォローアップ Issue 起票）は Phase 4 対応予定のため本ラウンドの指摘対象外。**Blocker / Warning なし。承認（APPROVED）。**

## ラウンド1指摘の修正検証

### W-2（title 適用範囲の ADR / モバイルモック不整合）— 修正済み

- `adr.md` ADR-001 Decision が「`title` はホバーが存在するデスクトップ（hover 可能環境）でのみ必須とし、タッチ主体のモバイルでは省略可」と明確化され、トレードオフ節も「デスクトップは加えて `title`」とデバイス別に書き分けられた。
- 正モックと整合: `P10-home.html` は全 tab に `aria-label` + `title`、`mobile/P10-home.html` は `aria-label` のみで、CSS コメントに「title はホバーが存在しないタッチ主体環境のため省略（ADR-001 のデバイス別適用範囲どおり）」と根拠が残っている。
- drafts も同一規約（デスクトップフレーム = title あり / モバイルフレーム = title なし）で統一されており矛盾なし。

### W-3（モバイルタップターゲット 36×32px）— 修正済み

- `adr.md` ADR-001 寸法節に「実装時は見た目のアイコン寸法を維持したまま padding 等で当たり判定を 44×44px 相当（Apple HIG 44pt）へ拡大すること」が追記された。
- `mobile/P10-home.html` の CSS コメントにも同旨の実装注記（44×44px 相当へ拡大、見た目のアイコン寸法は維持）があり、モック側・ADR 側の両方でフォローアップ時に拾える状態。提案どおり。

### N-001 / N-002 — 対応確認

- モック上の修正として反映済みであることを確認（aria 契約コメントの明記、ink 濃度差 active のトークン化 `--color-ink-tertiary` → `--color-ink` + hover 中間段 `--color-ink-secondary`）。非テキストコントラストは引き続き双方 3:1 を満たし、状態は `aria-selected` で機械可読。

## Blockers

なし

## Warnings

なし

## Notes

### N-1: focus-visible とモバイル当たり判定 44px をフォローアップ Issue 本文に確実に含めること（W-1 / Phase 4 への引き継ぎ）

ラウンド1 N-2 の focus-visible（アイコンのみ tab はキーボード利用時のフォーカスリングが唯一の手がかり）と、今回 ADR に追記された 44×44px 当たり判定拡大は、いずれもモック静的 CSS では表現されず実装でのみ満たされる契約。Phase 4 で起票する実装フォローアップ Issue の要件に両方を明記すること（ADR-001 には 44px は載ったが focus-visible の言及はないため、Issue 本文での補完が必要）。

### N-2: スケルトン segmented-ph は幅 104px が実寸（32×3 + padding 8 = 104px）と完全一致に更新済み

高さは 32px vs 実寸 36px（button 28 + padding 4×2）と僅差だが、スケルトンは厳密一致が目的ではなく許容範囲。配置（右端グループ末尾）と CTA プレースホルダ削除も正モックの確定レイアウトに正しく追従している。指摘のみ。

### N-3: モバイル segmented に hover スタイルがないのは意図どおり

デスクトップのみ `:hover { color: var(--color-ink-secondary) }` を持ち、タッチ主体のモバイルは active の2値のみ。title の省略判断と同じデバイス別ロジックで一貫している。
