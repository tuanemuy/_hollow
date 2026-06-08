# ブラウザ検証レポート — Issue #587 モバイル共通基盤

**実行日:** 2026-06-08
**テストソース:** `.issue/587/testing.md`
**サーバー:** http://localhost:3000（`pnpm dev`、認証は `__Host-session` cookie 注入）
**検証対象画面:** note アプリシェル `/`（サイドバー drawer を持つ P10 相当のホーム/ノート一覧）+ 設定/プロフィール

> 注: 当初の `/admin` は別レイアウト（管理者ダッシュボード、横タブナビ・ハンバーガー無し）で本Issueの drawer 基盤対象外のため、サイドバー drawer を持つ note アプリシェル `/` で全 TC を実施した。

## 結果サマリー

| TC | テスト名 | 結果 | 計測値 / 観察 |
|----|---------|------|---------------|
| TC-1 | アプリシェルの横スクロール無し | PASS | 320/375/390/430px すべて overflow=0（scrollW==clientW） |
| TC-2 | サイドバー drawer | PASS | aside=280px(≤86vw)・`fixed z-[100] translate-x-0`、backdrop `bg-black/20 z-[90]` 表示、本文約110px 覗き。Escape で閉じる |
| TC-3 | Dialog ボトムシート化（最重要） | PASS | パネル下端吸着・width=390(フルワイド)・上端のみ角丸(`border-top-left-radius:12px`/`bottom:0`)・padding-bottom=20px(safe-area)・grabber(34×4px `aria-hidden` span)表示・二重マージン無し |
| TC-4 | タッチ床44px・フォーム1カラム | PASS | input/textarea min-h=44px、ボタン各44px、1カラム縦積み、overflow=0 |
| TC-5 | desktop 非破壊（1280px） | PASS | aside `sticky` 260px 常設(in-flow)・ハンバーガー非表示・Dialog 中央モーダル(width=480・全角丸・grabber 非表示) |

**合計:** 5件（PASS: 5 / FAIL: 0）

## 受け入れ基準の充足

- [x] 320〜430px でアプリシェル・共通ダイアログ・共通フォームに横スクロールが発生しない（overflow=0）
- [x] drawer・ボトムシート・タッチ床44px が共通コンポーネント側で表現され、各画面が継承できる
- [x] 寸法・色はデザイントークン経由（grabber は `bg-hairline-strong`/`rounded-full`、CTAバーは `var(--header-blur)`）
- [x] agent-browser で代表シェル画面を 390px で目視し overflow=0 を確認
- [x] `pnpm typecheck && pnpm lint:fix && pnpm format` が通る（実装フェーズで確認済み）

## 補足

- `BottomActionBar` / `popoverSheetPanel` は本Issueでは画面未接続（#588 で実消費）のため、frame の実画面確認は #588 に引き渡し。実装は styles.ts 定数 + 薄い frame コンポーネントとして提供済み。
- grabber は `aria-hidden` 非 focusable span で focus trap 非干渉（ADR-002）であることを実装・計測の両面で確認。

## 成果物

- スクリーンショット: `.issue/587/manual-test/screenshots/`（tc1-{320,375,390,430}.png / tc2-drawer-open,closed.png / tc3-dialog-sheet.png / tc4-form.png / tc5-desktop.png）

## 起票したIssue

なし（全 TC PASS）。
