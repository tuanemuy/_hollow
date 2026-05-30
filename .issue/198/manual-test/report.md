# ブラウザ検証レポート — Issue #198: エラー UI の設計成果物化

**実行日:** 2026-05-30
**テストソース:** `.issue/198/testing.md`
**検証対象:** 静的 HTML モック（`file://` 直開き）。アプリ本体サーバー・DB・シードは不要。
**検証ツール:** agent-browser 0.27.0（Chrome for Testing）、デスクトップ（既定幅）/ モバイル（375×800）でフルページスクリーンショット目視。

---

## サマリー

| TC | 対象 | 種別 | 結果 |
|----|------|------|------|
| TC-001 | P01-signup.html エラーバリアント | 表示確認 | PASS |
| TC-002 | P01b-admin-setup.html エラーバリアント | 表示確認 | PASS |
| TC-003 | P03-login.html エラーバリアント | 表示確認 | PASS |
| TC-004 | レスポンシブ（375px）折り返し・タップ領域 | 異常系 | PASS |
| TC-005 | 成功状態モックの非破壊 | 既存機能 | PASS |

**合計: 5 件（PASS: 5 / FAIL: 0）**

---

## TC-001: P01-signup.html エラーバリアント — PASS

スクショ: `screenshots/P01-signup-desktop.png` / `screenshots/P01-signup-mobile.png`

- 成功状態ブロックの下に (a)validation / (b)conflict なし版 / (c)conflict あり版 / (d)system・unknown が縦に詰まって並ぶ（is-variant 修正が効いている）。
- (a): username / email / password が `--color-error-surface` 背景 + 赤リング、hint が赤文言、email に前回値「yumenaut@」が保持（入力保持）。
- (b): `.form-error`（role=alert）に「登録に失敗しました。 すでに登録されています」。field 無印。
- (c): email field のみ赤エラー（あり版の field 直下開示）。
- (d): `.form-error` に「登録に失敗しました。 システムエラーが発生しました」（抽象化維持）。
- トーンは Apple Calm（淡いピンク・強い赤を多用せず）。キャプション見出しが各バリアントを控えめに区切る。

## TC-002: P01b-admin-setup.html エラーバリアント — PASS

スクショ: `screenshots/P01b-admin-setup-desktop.png` / `screenshots/P01b-admin-setup-mobile.png`

- 成功状態（Setup Token エラー埋め込みのリファレンス）+ (a)validation / (b)unauthorized 特殊 / (c)conflict なし / (d)conflict あり / (e)system・unknown。
- (b): setupToken field に has-error + `invalid_setup_token`「Setup Token が正しくありません。」と `setup_token_disabled`「Setup Token が設定されていません。」の両分岐 callout を提示。実際は片方のみ表示の旨はコメントで明記。
- Setup Token の reveal トグル（目アイコン）も保持。

## TC-003: P03-login.html エラーバリアント — PASS

スクショ: `screenshots/P03-login-desktop.png` / `screenshots/P03-login-mobile.png`

- 成功状態（warning 配色 callout のリファレンス）+ (a)validation / (b)unauthorized 認証失敗汎用 / (c)unauthorized 未認証+再送 / (d)system・unknown。
- (b): `.form-error`（role=alert）「ログインできませんでした。 認証が必要です」。ユーザー存在/PW違いを判別させない抽象化を維持。email 入力保持。
- (c): `.callout.callout-neutral`（role=status）が **neutral グレー surface + accent アイコン**配色で描画（ADR-004）。上部成功状態の warning 配色 callout と明確に区別できる。再送は `<button type="button">`。
- (d): 「ログインできませんでした。 システムエラーが発生しました」（抽象化維持）。

## TC-004: レスポンシブ（375px） — PASS

- モバイル幅で callout・field hint・キャプション見出しがすべて折り返し、**横スクロールなし**。
- callout 本文の長い日本語が自然に折り返しオーバーフローなし（harden 観点）。
- 再送ボタン等のタップ領域はグローバル mobile fix（min-height 44px）が効く。

## TC-005: 成功状態モックの非破壊 — PASS

- 各ファイル先頭の成功状態ブロックは変更前と同じ見た目を維持。エラーバリアント追記は既存ブロックを破壊していない。
- トークン追加なしのため他ページモックの `:root` 参照への影響なし。

---

## 起票した Issue

なし（全 PASS）。

## a11y 目視（HTML 確認）

- 誤入力 input に `aria-invalid="true"`、ブロッキングエラー callout に `role="alert"`、未認証案内 callout に `role="status"`、装飾 SVG に `aria-hidden="true"`、reveal トグルに `aria-label`。いずれも §フィードバック原則に整合。

## クリーンアップ

- agent-browser 全セッション close 済み。サーバー起動なし（静的 HTML のため）。
