# PR Review #006 — review-005 指摘対応確認（W-001 / N-001 / N-003）

**PR:** #518
**Date:** 2026-06-06
**Round:** 6回目（review-005 の指摘対応分）

---

## Summary

- Blockers: 0
- Warnings: 0
- Nits: 2（再掲のみ。既存 N-002 / N-004）
- Verdict: **APPROVED**

review-005 が検出した W-001・N-001・N-003 の 3 件をすべて確認。W-001（`--shadow-lg` 除去）と N-001（`min-width:44px` 追加）は正しく反映済み。N-003（`profile-hero` / `profile-head` の gap トークン化）も主要箇所で反映済み。構文破綻・回帰なし。

---

## 指摘充足マトリクス（review-005 W-001 / N-001 / N-003）

| # | 指摘 | 判定 | 該当行・根拠 |
|---|------|------|------|
| W-001 | `common-toast.html` の `.phone .toast` から `box-shadow: var(--shadow-lg)` を除去 | ✅ | 修正後の `.phone .toast`（312〜318 行）は `position / left / right / bottom / max-width` のみ。`box-shadow` プロパティ自体が存在せず、基底 `.toast`（218 行）の `box-shadow: var(--shadow-md)` がそのまま継承される。SSOT（index.md §フィードバック原則「白地 + `--shadow-md` + `--radius-lg`」）と完全一致。 |
| N-001 | `P20-views.html` のモバイル MQ に `.row-menu-btn { min-width: 44px; }` を追加 | ✅ | 590〜598 行の `@media (max-width: 640px)` ブロック内 597 行に `/* タッチでは ⋯ メニューボタンのタップ領域を 44px に拡張 */ .row-menu-btn { min-width: 44px; }` が追加されている。コメントで意図も明記済み。高さは既存の global mobile MQ（158〜168 行の `button { min-height: 44px }`）で確保されており、44×44 が揃った。 |
| N-003 | `P30-user-public-top.html` の `.profile-hero` / `.profile-head` の gap を px 直値からトークンへ置換 | ✅ | デスクトップ: `.profile-hero { gap: var(--space-5) }` (272 行)、`.profile-head { gap: var(--space-6) }` (278 行)。モバイル MQ: `.profile-hero { gap: var(--space-3) }` (500 行)、`.profile-head { gap: var(--space-4) }` (503 行)。review-005 が指定した `--space-5`/`--space-6`（デスクトップ）・`--space-3`/`--space-4`（モバイル）のとおり置換されている。 |

---

## 回帰チェック

### CSS 構文・括弧 balance
- `common-toast.html`（312〜318 行）: `.phone .toast` は 1 プロパティ追加削除のみ。ブレース balance 問題なし。
- `P20-views.html`（590〜598 行）: `@media (max-width: 640px)` ブロックへの 1 ルール追加。開閉対称。
- `P30-user-public-top.html`（268〜278 行、499〜503 行）: `gap:` 値の置換のみ。構文変化なし。

### 新規固定 px 任意値の混入
- 3 ファイルの修正箇所で新規のマジックナンバー導入なし。変更はすべてトークン変数への置換または既存プロパティの削除。
- N-003 の対象外箇所（`.profile-stats { gap: 18px }`（315 行）、`.note-row { gap: 24px }`（423 行）、`.footer-links { gap: 18px }`（490 行））は修正前から存在する px 直値であり、今回の変更で増えていない。トークン化の方向と整合し、縮小方向に推移している。

### common-toast.html の全体健全性
- トークン準拠: `:root` は正準トークンのみ。`--toast-*` 等の新規トークンなし。
- Apple Calm: 白地（`--color-surface-elevated`）+ `--shadow-md`（218 行）+ `--radius-lg`（217 行）の単一パネル。塗りつぶし背景なし。
- 横スクロール: variation table は `.table-wrap { overflow-x: auto }` に隔離（322〜328 行）。ページ全体への溢れなし。
- a11y: `role="status"` / `aria-live="polite"` / `role="alert"` / `aria-live="assertive"` の使い分けあり。icon-only の close ボタンに `aria-label`・`title`・装飾 SVG に `aria-hidden`。モバイル MQ（283〜286 行）で `.toast-close { min-width:44px; min-height:44px }` / `.toast-action { min-height:44px }` のタッチ拡張あり。

---

## 残存 Nit（許容・別 Issue 候補として再掲）

- **[N-002]** `spec/design/pages/P43-admin-tokens.html` の `grid-template-columns: 220px 1fr 108px`（116 行付近）— 108px はアクション列の実測固定値。admin 高密度 UI の役割差として現状維持で可。将来変更時のため列幅の意図をコメント化する程度が望ましい。別 Issue 候補。
- **[N-004]** `spec/design/pages/P16-export-jobs.html` の行アクション「詳細」アイコン — `aria-label="詳細を開く"` は付与済みで a11y 床は満たす。デスクトップ密度の行アクションとして許容。気になる場合はアイコン差別化 or ラベル併用を別 Issue で検討。

---

## 確認した健全性（問題なし）

- W-001 の `--shadow-lg` は `.phone .toast` から完全消滅し、基底 `.toast` の `--shadow-md` のみが有効。SSOT との不整合が解消された。
- N-001 の追加コメント（597 行）は意図を明記しており、将来の保守で意図が消えるリスクを低減している。
- N-003 の置換後、`profile-hero`・`profile-head` の gap は 4 箇所すべてトークン参照となり、P30 内のトークン活用率が向上した。
