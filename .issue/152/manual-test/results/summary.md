# テスト実行サマリー — Issue #152

**実行日**: 2026-05-29
**テストソース**: .issue/152/testing.md
**検証方式**: 実ビルド CSS（`dist/client/assets/index-*.css`）をリンクした静的ハーネスを実 Chrome（agent-browser 0.27.0）で開き、各 pill button 定数を enabled / disabled / aria-disabled の状態でレンダリング。実ポインタ hover 前後の computed `background-color` / `color` を比較。

## なぜハーネス方式か

本 Issue は純粋な Tailwind utility 文字列（CSS）変更で、対象定数（`pillBtn` 族・`dialogCloseButton`・`EDITOR_TOOLBAR_BTN`）は認証済み画面・ダイアログ・エディタにしか現れない。実アプリで全状態（特に disabled / aria-disabled）を再現するには auth + DB seed が必要で重く、かつ検証したいのは「実ブラウザでの :hover 時の計算済み色」そのもの。実際にビルドされた CSS をそのままリンクしたハーネスで本物の hover 挙動を計測する方が、対象を直接・確実に検証できる。

## 結果一覧

baseline = hover していない時の bg、hovered = 実ポインタ hover 時の bg。

| TC | 対象 | 状態 | baseline bg | hovered bg | 期待 | 結果 |
|----|------|------|-------------|-----------|------|------|
| TC-001 | pillBtn | enabled | surface (245,245,247) | **surface-hover (236,236,239)** | 変化する | PASS |
| TC-002 | pillBtn | disabled (button) | surface | surface（変化なし） | 変化しない | PASS |
| TC-003 | pillBtn | aria-disabled (anchor) | surface | surface（変化なし） | 変化しない | PASS |
| TC-004 | pillBtnPrimary | enabled | accent (oklch .371) | **accent-hover (oklch .439)** | 変化する | PASS |
| TC-005 | pillBtnPrimary | disabled (button) | accent | accent（変化なし） | 変化しない | PASS |
| TC-006 | pillBtnPrimary | aria-disabled (anchor) | accent | accent（変化なし） | 変化しない | PASS |
| TC-007 | pillBtnDanger | enabled | error-surface (251,235,235) | error-surface（同色・設計通り） | — | PASS |
| TC-008 | pillBtnDanger | disabled (button) | error-surface | error-surface（変化なし） | 変化しない | PASS |
| TC-009 | dialogCloseButton | enabled | transparent | **surface (245,245,247) + text→ink** | 変化する | PASS |
| TC-010 | dialogCloseButton | disabled (button) | transparent | transparent（変化なし） | 変化しない | PASS |
| TC-011 | EDITOR_TOOLBAR_BTN | enabled | surface | **surface-hover (236,236,239)** | 変化する | PASS |
| TC-012 | EDITOR_TOOLBAR_BTN | disabled (button) | surface | surface（変化なし、hovered:true で確認） | 変化しない | PASS |

**合計**: 12 件（PASS: 12 / FAIL: 0）

## 補足

- 全ケースで `el.matches(':hover')` が true（実際に hover が成立している状態）で計測。disabled `<button>` も scrollIntoView 後は :hover が成立し、hover 規則が `:not(:disabled)` で除外されるため色が変化しないことを確認した。
- aria-disabled は `<a>`（アンカー）で検証。アンカーは `:disabled` を持てず `aria-disabled` で無効を表すため、`not-aria-disabled:` ガードが必須であることを TC-003 / TC-006 が実証した（`not-disabled:` のみではアンカーの hover 色変化が残る）。
- TC-007（danger enabled）は元実装でも hover 色 = base 色（ともに error-surface）であり、hover で bg 色が変わらないのは設計通り。本変更の影響なし。
- 生成 CSS のセレクタも検証済み: `:hover:not(:disabled):not([aria-disabled=true])` が出力されている（`pnpm build` 後の grep で確認）。

## スクリーンショット

- 初期表示: `screenshots/harness-initial.png`
- pillBtn enabled を hover: `screenshots/hover-pill-enabled.png`
- pillBtn disabled を hover: `screenshots/hover-pill-disabled.png`
