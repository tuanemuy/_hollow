# PR Review #001 — feat(#309): ボタン形態ガイドライン横断適用

**PR:** #317
**Date:** 2026-05-29
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 2
- Notes: 多数（既存仕様起因の整理候補が中心）
- Verdict: **BLOCKED**（Warning 2 件を修正 → 再レビューへ）

レビューレイヤー: Frontend / Accessibility / Spec整合性（3 並列）

---

## Frontend

### Blockers
なし

### Warnings
- **[W-001]** `EDITOR_TOOLBAR_BTN` の `rounded-pill` は 36×36 に適用されると円形になるが、JSDoc/ADR-006 が「square（正方形）」と表現しており語彙が不一致。
  - 場所: `app/components/note/editor/WysiwygEditor.tsx`（EDITOR_TOOLBAR_BTN 定義）
  - 対応: ✅ 修正。JSDoc と ADR-006 の表現を「circular / 円形」に訂正（既存 `dialogCloseButton` の円形 icon-button と同パターンであることを明記）。実装は円形のまま維持（マニュアルテスト TC-6 で視覚確認済み）

### Notes
- N-001〜006: Icon ラッパー規約準拠（size SSOT、w-/h- なし）、barrel import ゼロ、import 順序 Biome 準拠、server-component 維持、STATUS_ICON 36→24 スナップ妥当、`FormatButton.label` が React key 専用になった点（誤読余地はあるが用途明確）。いずれも修正不要。

## Accessibility

### Blockers
なし

### Warnings
なし

### Notes
- **N-001:** STATUS_ICON / CALLOUT 等で親要素と子 `Icon` の `aria-hidden` が二重付与だが、ARIA 仕様上無害かつ置換前から同構造（本 PR 起因でない）。
- **N-002:** WysiwygEditor ツールバーは roving-tabindex 未実装だが `main` 時点からの既存仕様でスコープ外。
- 重点観点（accessible name 二重化なし / 装飾 aria-hidden / 44×44px 幅高さ両担保 / aria-pressed 背景反転 / title 非上書き / 同種並置 MUST 非抵触）すべて適合。APPROVE 相当。

## Spec整合性

### Blockers
なし（4 領域すべて網羅、完了条件全項目充足）

### Warnings
- **[W-001]** LoginForm「メール未確認」CALLOUT の `Phone` アイコンが意味的に不適切（メール確認文脈に電話アイコン）。既存 inline SVG の不整合の継承だが、Icon 化のタイミングで意味的に適切なアイコンへ修正するのが §7.1「情報伝達」趣旨に沿う。
  - 場所: `app/components/auth/LoginForm/index.tsx`
  - 対応: ✅ 修正。`Phone` → `MailWarning` に変更。plan.md マッピング表も更新。

### Notes
- N-001〜003: STATUS_ICON 36→24 スナップは型上限 24 のため唯一解、`Clock`/`Check`/`AlertCircle`/`Info` 等のマッピングは意味的に妥当、44px は CSS クラス静的確認のみ（実寸計測は将来 a11y 監査で補完）。

---

## 修正対応サマリー（このラウンド）

- **[Frontend W-001]** → JSDoc・ADR-006 の「square」を「circular/円形」に訂正
- **[Spec W-001]** → LoginForm の `Phone` → `MailWarning`（plan.md マッピング表も更新）

## Design Decisions

- WysiwygEditor のツールバーボタンは `rounded-pill` による**円形** icon-button とする（既存 `dialogCloseButton` と同パターン）。ADR-006 に反映。
- LoginForm の未確認メール callout は `MailWarning`（メール + 警告）を採用。既存の phone アイコンは誤用だったため、Icon 化に合わせて意味的に正す。
