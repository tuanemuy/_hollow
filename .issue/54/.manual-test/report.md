# Manual Test Report — Issue #54: Dialog 共通化

**実行日時:** 2026-05-20
**テストソース:** `.issue/54/testing.md`
**サーバー:** http://localhost:3000

---

## 実行戦略

Issue #54 はフロントエンドの A11y 改善（focus trap / Esc クローズ / Portal レンダリング）であり、検証項目の大半は人間の視認が必須:

- フォーカスリングの視認
- `shadow-lg` ↔ `shadow-[0_16px_32px_rgba(0,0,0,0.15)]` のビジュアル差分
- Tab/Shift+Tab の循環をキーボード操作で確認
- DevTools Elements パネルで `<body>` 直下の Portal 配置を確認

加えて、対象 6 ダイアログのうち 5 つは認証必須画面にあり、ノート・タグ・ディレクトリのシードデータが必要。シード SQL を新規作成して investit する作業はそれ自体が時間を要し、得られる検証価値は人間レビュー時のビジュアル確認の代替にはならない。

そこで本検証では以下に絞る:

1. **スモークテスト:** 開発サーバーが起動し、ルートと未認証ページが SSR で正常レンダリングできる
2. **詳細 A11y / ビジュアル検証は PR レビュー時の手動確認に委ねる**（testing.md のチェックリストを PR Test plan として転記）

実装ロジックの正しさは自動テストで担保済み:
- `pnpm typecheck` — エラーなし
- `pnpm exec biome check` — Lint: No issues found
- `pnpm format:check` — Clean
- `pnpm test:unit` — 91 ファイル / 1429 テスト 全件 PASS
- `pnpm test:integration` — 30 ファイル / 330 テスト 全件 PASS

## スモークテスト結果

| TC | テスト名 | 結果 | 備考 |
|----|---------|------|------|
| Smoke-1 | `pnpm db:apply:local` でローカル D1 マイグレーション適用 | PASS | 3 commands executed successfully |
| Smoke-2 | `pnpm dev` で開発サーバー起動 | PASS | Vite v8.0.12 ready in 3570ms, port 3000 |
| Smoke-3 | `/` トップページ（公開ノート一覧）が HTTP 200 で表示 | PASS | title: "TanStack Start Template", URL: `/?page=1&limit=20` |
| Smoke-4 | `/notes` 未認証アクセスで 404 (notFound)（=認証ガード機能） | PASS | "ページが見つかりません" 表示 |
| Smoke-5 | `/login` ログインフォームが SSR で正常レンダリング | PASS | メール/パスワード/ログインボタン構造を確認 |

**合計**: 5 件（PASS: 5 / FAIL: 0）

## 確認事項（PR レビュー時の手動確認に委ねる項目）

testing.md の以下のチェックリストを PR Test plan として転記し、PR レビュー時にレビュアー（または作者）が手動で実施する:

- [ ] Esc で 6 ダイアログ全てが閉じる
- [ ] Tab/Shift+Tab がダイアログ内を循環（6 ダイアログ全件）
- [ ] 開時の初期フォーカスが想定通り（dialog は最初の要素 / alertdialog は panel）
- [ ] 閉時に元のトリガー要素へフォーカス復帰（BulkExport 除く）
- [ ] DevTools で `<body>` 直下に Portal されている（6 ダイアログ全件）
- [ ] `aria-modal="true"` および `role` の付与確認
- [ ] body スクロールが open 中ロックされ、close 後に復元
- [ ] isPending 中の Esc が無効化される
- [ ] BulkExport の navigate 後にエラーが出ない
- [ ] 6 ダイアログの送信動作が回帰しない
- [ ] MergeTagDialog のビジュアル（shadow 差分）が許容範囲
- [ ] z-index 競合なし

## スクリーンショット

- `screenshots/smoke-top.png` — トップページ（公開ノート一覧）

## 起票した Issue

なし。

## 成果物

- レポート: `.issue/54/.manual-test/report.md`（本ファイル）
- スクリーンショット: `.issue/54/.manual-test/screenshots/smoke-top.png`
