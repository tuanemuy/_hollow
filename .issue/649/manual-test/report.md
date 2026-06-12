# ブラウザ検証レポート — Issue #649

**実行日**: 2026-06-12
**テストソース**: .issue/649/testing.md
**サーバー**: http://localhost:5183（pnpm dev / Cloudflare ローカル）
**アカウント**: dev-admin@example.com（Cookie 注入。詳細: seed-data.md）

## 結果

23 件中 PASS 22 / FAIL 0 / SKIP（部分実施）1。詳細は `results/summary.md` と `results/TC-*.md` / `EDGE-*.md` / `IMPACT-*.md`。

- 確定デザイン（CTA ヘッダー集約・ViewSwitcher 化・アイコンのみ操作・segmented ink 濃度差・クリア ×・meta-row 統合・スケルトン追従・P30 モック追従）はすべてモックどおり動作。
- a11y 契約（aria-label / title / tablist / aria-selected / aria-haspopup="listbox" / 44px タッチターゲット / focus-visible）も確認済み。モバイル実測が 43.1px 等になる箇所は fluid root font-size の rem 換算によるもので設計意図どおり。
- EDGE-004（一覧クエリ失敗時の見出し巻き込み）はローダー throw を人工再現できず部分実施。ルートレベルのエラーページ表示と再読み込みでの回復は確認。SectionErrorBoundary 単体の挙動はユニットテストで担保。

## 起票した Issue

なし（FAIL ゼロ）。

## 環境の後始末

シードで投入した保存ビュー 3 件は検証用として残置（seed.sql で冪等管理）。テスト中に作成した一時データは復元済み。
