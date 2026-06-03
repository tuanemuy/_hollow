# テスト実行サマリー — Issue #425

**実行日時**: 2026-06-03
**テストソース**: `.issue/425/testing.md`
**サーバー**: http://localhost:5175/（`pnpm dev`、検証後停止）

| TC | テスト名 | 種別 | 結果 | 失敗ステップ |
|----|---------|------|------|-------------|
| TC-001 | landing hero ボタン（HERO_BTN_PRIMARY / SECONDARY） | 視覚・正常系 | PASS | - |
| TC-002 | admin primary 保存ボタン ×4 + DesignTokensForm 共存 | 視覚・正常系 | PASS | - |

**合計**: 2 件（PASS: 2 / FAIL: 0）

## 検証の要点（computed style 実測）

### TC-001 landing（未認証 `/`）
- signup（primary）: height 48px(h-12) / paddingLeft 32px(px-8) / bg `oklch(0.371 0 0)`(accent) / color 白 / justify center / `data-primary=""` 有
- login（secondary）: height 48px / paddingLeft 32px / bg `rgb(245,245,247)`(surface) / color ink / justify center / `data-primary` 無
- → signup(accent) と login(surface) が別色。`data-primary` 付与漏れ・誤付与なし。pillBtnTall が base を後勝ち上書き（h-12/px-8）して縦長表示。

### TC-002 admin（認証・registration/llm/prompts/design）
- 4画面とも保存ボタン: height 36px(h-9) / paddingLeft 16px(px-4) / bg `oklch(0.371 0 0)`(accent) / color 白 / pill / `data-primary=""` 有
- DesignTokensForm: primary(accent濃グレー) / surface「＋トークンを追加」(明グレー) / ghost destructive「すべてリセット」(`rgba(0,0,0,0)` transparent) の3系統が回帰なく共存。destructive は filled 化していない（ADR-005 の据え置き判断が機能）。

## 補足
- accent トークンは本テーマ（Apple Calm）で無彩色 `oklch(0.371 0 0)`（chroma=0 の濃グレー）。surface（明グレー）と明確に別色のため primary/secondary は視覚的に区別される。
- hover の `:hover` 擬似クラスは agent-browser の computed style に反映されないため、hover での accent-hover 変化はクラス定義の存在確認に留めた（実装上は base 継承で付与済み）。
- admin の mutation（server-fn POST）は cross-origin 403 のため挙動はブラウザ検証せず、integration テスト（548 件 PASS）で担保。
