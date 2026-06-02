# ブラウザ検証レポート — Issue #419

**実行日時:** 2026-06-03
**テストソース:** .issue/419/testing.md
**サーバー:** http://localhost:5175（vite dev / Cloudflare runtime）
**検証方式:** computed style 直接読み取り（agent-browser eval）+ スクリーンショット

## サマリー

| TC | 検証内容 | ページ | 結果 |
|----|---------|--------|------|
| A | disabled opacity が 0.55 に統一 | /login | PASS |
| B | focus-visible リング（box-shadow=--shadow-focus）表示 | /login | PASS |
| C | 同上を signup でも確認 | /signup | PASS |

**合計:** 3 件（PASS: 3 / FAIL: 0）

## 詳細

### A. disabled opacity 0.55 統一 — PASS
- `--opacity-disabled` トークン値 = `0.55`
- submit ボタンが `disabled:opacity-disabled` / `aria-disabled:opacity-disabled` utility を保持
- `disabled` 強制付与時の computed `opacity` = `0.55`（トークンと一致）
- スクショ: `screenshots/A-login.png`

### B. focus-visible リング — PASS
- `--shadow-focus` トークン値 = `0 0 0 4px oklch(37.1% 0 0 / 0.28)`
- Tab キーによるキーボードフォーカスで `el.matches(':focus-visible')` = true、computed `box-shadow` が `--shadow-focus` と一致
- password input / submit ボタンとも確認
- スクショ: `screenshots/B-focus.png`

### C. signup ページ — PASS
- `--opacity-disabled` = 0.55、disabled 強制時 computed opacity = 0.55
- 「アカウントを作成」ボタンのキーボードフォーカスで box-shadow = `--shadow-focus`、`:focus-visible` true
- スクショ: `screenshots/C-signup.png`

## 補足・制約
- 認証必須ページ（admin 等）は本検証では扱っていない。disabled opacity の正規化はトークン経由のため、`opacity-disabled` utility を持つ全要素（admin pill ボタン群含む）で同一値が適用される（ビルド生成 CSS で `.disabled\:opacity-disabled:disabled { opacity: var(--opacity-disabled) }` を確認済み）。
- focus リングはグローバル `:focus-visible`（index.css）由来で全 focusable 要素に共通適用されるため、公開ページでの検証結果が全画面に一般化できる。
- 据え置き対象（discarded / pending の opacity-60）は本検証の対象外で変更なし。

## 起票した Issue
- なし（全 PASS）
