# ブラウザ検証レポート — Issue #776

**実行日時**: 2026-06-26
**テストソース**: `.issue/776/testing.md`
**サーバー**: http://localhost:3000（`pnpm dev` / ローカル D1）
**ツール**: agent-browser 0.28.0

## 結果概要

| 検証対象 | TC | 結果 |
|---|---|---|
| 並び替え軸 segmented（radiogroup / automatic activation） | TC-TAG-1, TC-TAG-2 | PASS |
| 編集モード tabs（APG Tabs / manual activation） | TC-EDITOR-1, TC-EDITOR-2 | PASS |

**合計 4 件: PASS 4 / FAIL 0**

受け入れ基準のうち実機で確認すべき AC-1〜AC-6 をすべて充足。詳細は `results/summary.md` および `results/TC-TAG.md` / `results/TC-EDITOR.md` を参照。

## 確認できたこと

- 並び替え軸が `role="radiogroup"`(`aria-orientation="horizontal"`) + 各ボタン `role="radio"`/`aria-checked`、roving tabindex（選択のみ 0）、Arrow/Home/End で移動=即選択、両端ラップ。`tablist`/`tab`/`aria-selected` の残存なし。sort/order の URL 反映も不変。
- 編集モードが完全な APG Tabs: `tablist`/`tab`/`aria-selected` + `aria-controls` → 実体 `role="tabpanel"`（`aria-labelledby` が選択中 tab に一致）。manual activation で矢印=フォーカスのみ・選択不変、Enter で活性化、未保存確認は活性化時のみ発火。

## 追跡事項（スコープ外・PASS）

並び替え軸の連続矢印キーで RSC loader 再実行に伴うフォーカス脱落あり（単発選択は正常、全 AC PASS）。#776 の ARIA 変更起因ではなくデータ駆動 RSC ルート共通の既存特性のため、フォローアップ Issue として起票し追跡する（`results/summary.md` 参照）。

## 成果物

- サマリー: `.issue/776/manual-test/results/summary.md`
- テスト結果: `.issue/776/manual-test/results/TC-TAG.md`, `TC-EDITOR.md`
- シードデータ: `.issue/776/manual-test/seed-data.md`
