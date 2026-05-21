# テスト実行サマリー — Issue #72

**実行日時**: 2026-05-21
**テストソース**: `.issue/72/testing.md`
**サーバー**: http://localhost:3000/ (`pnpm dev`)
**実行手法**: agent-browser によるスモークテスト + 生成 CSS の静的検証

| TC | テスト名 | 種別 | 結果 | 備考 |
|----|---------|------|------|------|
| TC-001 | `/` ランディング スモークテスト | 正常系 | PASS | レンダリング崩れなし |
| TC-002 | `/login` スモークテスト | 正常系 | PASS | フォーム描画正常 |
| TC-003 | `/register` → `/signup` スモークテスト | 正常系 | PASS | 実パスは `/signup`（既存ルーティング、本Issue無関係） |
| TC-004 | 生成 CSS の `@media (prefers-reduced-motion: reduce)` 検証 | 正常系 | PASS | 12 ルール検出、`transition-property: none` / `scale: 1` / `::after` 系すべて出力済み |

**合計**: 4 件（PASS: 4 / FAIL: 0）

## 検証ポイント

- Tailwind v4 では `motion-reduce:*` は **utility セレクタ内にネストされた `@media`** として生成される（トップレベルの `@media` ルールではない）
- `.motion-reduce\:transition-none`, `.motion-reduce\:active\:scale-100`, `.motion-reduce\:after\:transition-none`, `.motion-reduce\:active\:scale-100\!`（Plan B 用 !important 版も生成済）すべて確認
- 既存の `.motion-safe\:animate-pulse` 先行例も無傷
- `active:scale-[0.985]` と `motion-reduce:active:scale-100` の specificity 順 OK → Plan B（`!important`）は不要

## 検証の限界

agent-browser CLI には Playwright の `emulateMedia({ reducedMotion: 'reduce' })` 相当機能がないため、reduce motion ON 状態の **視覚挙動**（transition 即時切替、active scale 抑制、トグルスイッチつまみの瞬間移動）は自動テストでは検証不可。

視覚挙動の最終確認は `.issue/72/testing.md` の手順に従って **Chrome DevTools の Rendering タブから人の目で確認** する必要がある。本スモークテストでは:

1. レイアウト崩れなし（通常状態 → reduce motion なし時の回帰確認）
2. 生成 CSS に正しいルールが出力されている

までを担保する。
