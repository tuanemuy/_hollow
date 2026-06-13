# テスト実行サマリー — Issue #692

**実行日時**: 2026-06-13
**テストソース**: .issue/692/testing.md
**サーバー**: http://localhost:3000

| TC | テスト名 | 種別 | 結果 | 失敗ステップ |
|----|---------|------|------|-------------|
| TC-001 | エディタ本文の caret-only 化（AC-1） | 正常系 | PASS | - |
| TC-002 | タイトル入力の caret-only 化（AC-2） | 正常系 | PASS | - |
| TC-003 | 通常 input の 2px リング細線化（AC-3/AC-7） | 正常系 | PASS | - |

**合計**: 3 件（PASS: 3 / FAIL: 0）

## 実測値
- `--shadow-focus = 0 0 0 2px var(--color-accent)`、accent = `oklch(37.1% 0 0)`
- エディタ本文 wrapper / ProseMirror / タイトル: box-shadow=none（caret-only、caret=accent）
- 検索 input（実 Tab ナビゲーションで :focus-visible 発火）: `oklch(0.371 0 0) 0px 0px 0px 2px`（2px・不透明）
- 退行確認: 旧 4px / alpha 0.28 半透明リングは実測・grep とも残存ゼロ
