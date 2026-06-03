# ブラウザ検証レポート — Issue #425

**Issue**: #425 styles.ts 外のローカルボタン定義 (admin BTN_PRIMARY_CLASS / landing HERO_BTN_*) を common pill primitive へ統一する
**実行日時**: 2026-06-03
**テストソース**: `.issue/425/testing.md`
**サーバー**: http://localhost:5175/（`pnpm dev`、検証後停止）
**結果**: 2 件中 2 件 PASS / 0 件 FAIL

## 概要

純フロントの視覚 refactor（admin 4ファイル＋landing の className を common pill primitive へ寄せ、primary に `data-primary=""` を付与）。最大リスクである `data-primary` 付与漏れ（accent→surface の無音退行）を、landing（未認証）と admin（認証）の両方で computed style を実測して検証した。

## TC-001: landing hero ボタン（PASS）

`/`（未認証）のヒーロー2ボタンを検証。signup(primary)=accent白文字 48px、login(secondary)=surface ink文字 48px、両者が別色で `data-primary` は signup のみ付与。pillBtnTall（h-12/px-8/justify-center）が base を後勝ち上書きして縦長表示されることを実測確認。

- スクショ: `screenshots/tc-001/step-01-hero.png`, `screenshots/tc-001/step-02-hover.png`

## TC-002: admin primary 保存ボタン ×4（PASS）

`/admin/{registration,llm,prompts,design}` を認証して検証（セッション偽造＋CDP cookie 注入）。4画面とも保存ボタンが h-9(36px)/px-4(16px)/accent/白文字/`data-primary=""` で表示。DesignTokensForm では primary・surface・ghost destructive の3系統が回帰なく共存し、ghost destructive は transparent base のまま（filled 化なし＝ADR-005 の据え置き判断が機能）。

- スクショ: `screenshots/tc-002/{registration,llm,prompts,design}.png`

## 自動テスト（併せて実施）

- `pnpm typecheck`: PASS
- `biome check --write` / `format`: クリーン
- `pnpm test:unit`: 3085 テスト PASS
- `pnpm test:integration`: 548 テスト PASS
- `pnpm build`: 成功。生成 CSS で `.h-12`>`.h-9` / `.px-8`>`.px-4` / `.text-md`>`.text-sm` の後勝ち順を確認（pillBtnTall が base を上書き）。

## 起票した Issue

なし（全 PASS）。

## 環境後始末

- agent-browser 全セッション close、dev サーバー停止。
- シードした admin user / session 行は検証後に削除済み（dev D1 をクリーンに戻した）。
