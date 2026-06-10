# テスト実行サマリー — Issue #628

**実行日時**: 2026-06-10
**テストソース**: .issue/628/testing.md
**サーバー**: http://localhost:5174/（`pnpm dev --port 5174`、Cloudflare workerd）
**ログイン**: `pnpm seed:dev-admin` の dev-admin セッション cookie（`__Host-session`）注入

| TC | テスト名 | 種別 | 結果 | スクリーンショット |
|----|---------|------|------|-------------------|
| TC-01 | デスクトップ ヘッダー再設計（検索中央・アップロードaccent先頭・新規作成テキスト・アバター無し・サイドバー下部ユーザー行・下部CTA無し） | 正常系 | PASS | tc01-desktop-home.png |
| TC-02 | サイドバー下部ユーザーメニュー（上方向に開き 管理者/設定/ログアウト） | 正常系 | PASS | tc02-user-menu.png |
| TC-03 | モバイル390 ヘッダー（メニュー/検索/アップロードaccent/新規作成 アイコンのみ・アバター無し・下部CTA無し） | 正常系 | PASS | tc03-mobile-390.png |
| TC-04 | モバイル320 横スクロールなし（scrollWidth==clientWidth==320, overflow=false） | エッジ | PASS | tc04-mobile-320.png |
| TC-05 | モバイルドロワー内にユーザー行（D Dev Admin dev-admin@example.com） | 正常系 | PASS | tc05-mobile-drawer.png |
| TC-06 | BulkActionBar 非回帰（選択でfixed全幅下端シート・z-index 40） | 回帰 | PASS | tc06-mobile-bulkbar.png |

**合計**: 6 件（PASS: 6 / FAIL: 0）

## 補足
- 検索の glow（focus リング）・トークンは既存維持（ADR-002）。
- ヘッダー操作行は 36px（h-9）で検索input・CTA・メニューが統一（ADR-003/004）。
- 下部固定CTAバー（旧 BottomCtaBar/BottomActionBar）は廃止済み・残存なし（ADR-001）。
- 起票したIssue: なし（全PASS）。
- 静的ゲート: `pnpm typecheck` PASS / `pnpm lint:fix`・`pnpm format` 適用済 / `pnpm test:unit` 3495 PASS。
