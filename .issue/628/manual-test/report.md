# ブラウザ検証レポート — Issue #628 ヘッダー（グローバル）UI再設計

**実行日**: 2026-06-10
**テストソース**: `.issue/628/testing.md`
**検証環境**: `pnpm dev --port 5174`（Cloudflare workerd）/ dev-admin セッション cookie 注入

## 結論

全 6 テストケース **PASS**（FAIL 0）。確定デザイン（ADR-001〜004）が実装に正しく反映され、既存機能（BulkActionBar・ユーザーメニューの設定/ログアウト動線）も非回帰。起票した Issue はなし。

## 確認できたこと

- **デスクトップ**: 検索が中央列で glow 維持、ヘッダー右はアップロード（accent・先頭）→ 新規作成（テキスト）、アバターはヘッダーから消えサイドバー最下部のユーザー行（D / Dev Admin / dev-admin@example.com）へ移設。下部固定CTAバーなし。
- **ユーザーメニュー**: サイドバー下部の行クリックで上方向（`bottom-full`）に開き、管理者 / 設定 / ログアウトを表示。
- **モバイル 390px**: ヘッダーに メニュー / 検索 / アップロード（accentアイコン）/ 新規作成（+アイコン）。アバター無し・下部CTA無し。
- **モバイル 320px**: 横スクロールなし（`scrollWidth == clientWidth == 320`）。
- **モバイルドロワー**: ユーザー行がドロワー内最下部に表示。
- **BulkActionBar 非回帰**: 選択時に `position:fixed` 全幅下端シート（z-index 40）として表示。

## スクリーンショット

`screenshots/` 配下:
- tc01-desktop-home.png / tc02-user-menu.png / tc03-mobile-390.png / tc04-mobile-320.png / tc05-mobile-drawer.png / tc06-mobile-bulkbar.png

## 静的ゲート

- `pnpm typecheck`: PASS
- `pnpm lint:fix` / `pnpm format`: 適用済（新規エラーなし）
- `pnpm test:unit`: 3495 件 PASS（UserMenu テスト含む）
