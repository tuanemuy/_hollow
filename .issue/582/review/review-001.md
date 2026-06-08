# PR Review #001 — feat(brand): 各ページの可視ロゴを Vesica ロックアップへ反映

**PR:** #591
**Date:** 2026-06-08
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 4（+ 任意 Note 1）
- Notes: 多数（良点）
- Verdict: **BLOCKED**（Warning を残さず潰す方針のため対応する）

---

## Frontend

### Blockers
なし

### Warnings
- **[B-/W-001] BrandMark がデッドコード + ADR-001 と乖離** — `BrandLockup` が `LOCKUP_CHILDREN` で `<circle>` を独自展開し `BrandMark` を再利用していない。二円定義が `MARK_CHILDREN` と `LOCKUP_CHILDREN` の2箇所に重複。`BrandMark` は消費者ゼロ。
- **[W-002] 公開フッターのロゴだけ muted** — `PublicLayout.tsx:80` の `<div>` に色指定がなく親 `text-ink-tertiary` を継承。他フッター（ランディング）は `text-ink`。一貫性欠如。
- **[W-003] `width="auto"` の明示** — viewBox + height があれば width は不要。素材は数値 width。意図が伝わりにくい。

## Accessibility & Style

### Blockers
なし

### Warnings
- **[W-001(a11y)] JSDoc がコンポーネントでなく定数に紐づく** — JSDoc ブロックが `MARK_CHILDREN` / `LOCKUP_CHILDREN` の上にあり、`export function` にドキュメントが付かない。Icon.tsx は関数直上。
- **[N-002] 装飾分岐式の不一致** — `BrandMark` は `label !== undefined && label !== ""`、`BrandLockup` は `label !== ""`。挙動等価だが正準形に揃えると一貫。

### Notes（良点・両レビュー共通）
- aria コントラクトは Icon.tsx と整合（空リンク・二重読みなし、manual-test 項目9で確認）
- スコープ管理が的確（旧定数削除・残参照ゼロ、文章中 Hollow 不変、admin 3ヘッダーも漏れなくカバー）
- currentColor テーマ追従を実測確認（rgb(29,29,31)=--ink）
- スタイル規約遵守（ハンドCSS/@apply なし、size/height を SSOT、className に w-/h- 無し）

---

## 対応方針（このラウンドで全件修正）

1. **W-001**: 二円図形を `MARK_CHILDREN` 1箇所に集約し、`BrandLockup` の `<g>` 内で `MARK_CHILDREN` を再利用（重複解消）。`BrandMark` は Issue 要件「マーク単体の共有コンポーネント」として export を維持し、JSDoc に単体利用 API である旨を明記。ADR-001 の「再利用」記述を実装に合わせて訂正。
2. **W-002**: 公開フッターの `<div>` に `text-ink` を付与しランディングフッターと一貫させる。
3. **W-003**: `width="auto"` を削除（viewBox + height で比率導出）。
4. **W-001(a11y)**: JSDoc を各 `export function` の直上へ移動。
5. **N-002**: `BrandLockup` の装飾分岐式を `label !== undefined && label !== ""` に揃える。

## Design Decisions
- ADR-001 を「マークの図形（二円）は共有フラグメント `MARK_CHILDREN` として定義し、`BrandMark` と `BrandLockup` の双方で再利用する。`BrandMark` は単体利用 API として提供」と実態に合わせて更新（review 時の追記）。
