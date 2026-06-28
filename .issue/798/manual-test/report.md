# Browser Verify Report

**実行日時**: 2026-06-28
**テストソース**: .issue/798/testing.md
**サーバー**: http://localhost:3000
**修正ラウンド**: 0回

---

## サマリー

| 項目 | 値 |
|---|---|
| テストケース総数 | 4 |
| PASS | 4 |
| FAIL | 0 |
| PASS率 | 100% |
| 起票Issue数 | 0 |

部分的に自動検証対象外（FAIL ではない）:
- TC-2 の「OS ネイティブのファイル選択ダイアログ起動」— agent-browser では観測不能。ボタンが enabled でクリックしても画面が壊れないところまで確認。
- TC-3 のインラインモード — `/notes/new`（new surface）の EditorModeSwitch は WYSIWYG / HTML の2タブのみ表示する既存仕様で、インラインタブが UI に出ないため。inline は本変更の対象外（ツールバー非保持＝html と同構造）であり、html モードで「非WYSIWYG にツールバー・画像ボタン無し」を検証済みのため代替担保される。

---

## シードデータ

- `pnpm db:migrate`（適用済み）+ `node scripts/seed-dev-login.mjs`
- アカウント: `dev-login@example.com` / `DevPassw0rd!2024`（member, active）
- ノート編集は root directory 無しでも描画可のため追加投入なし。

---

## テスト結果一覧

| TC | テスト名 | 種別 | 最終結果 | 初回結果 | 修正ラウンド | 備考 |
|----|---------|------|---------|---------|-------------|------|
| TC-1 | WYSIWYG ツールバーに画像ボタン表示（AC-1/AC-7） | 正常系 | PASS | PASS | - | aria-label/title="画像"、リンクボタン直後、aria-pressed 無し、enabled |
| TC-2 | 画像ボタンが enabled でクリック可能（AC-2 検証可能部） | 正常系 | PASS | PASS | - | クリックで画面破壊・コンソールエラー無し。OSダイアログ起動は自動検証対象外 |
| TC-3 | html/inline にツールバー・画像ボタン無し（AC-5） | 正常系 | PASS | PASS | - | html で確認。本文下 input[type=file] 健在。inline タブは new surface で非表示のため対象外 |
| TC-4 | 既存書式ボタンの回帰なし | 正常系 | PASS | PASS | - | 太字〜リンク＋画像の全11ボタン健在 |

---

## 起票した Issue

なし（全 PASS）。

---

## 環境情報

- **OS**: Darwin
- **agent-browser**: 0.28.0
- **サーバーコマンド**: pnpm dev（vite dev / workerd）
- **ポート**: 3000
</content>
