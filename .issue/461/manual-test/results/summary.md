# テスト実行サマリー — Issue #461

**実行日時**: 2026-06-04
**テストソース**: .issue/461/testing.md
**サーバー**: http://localhost:5180（vite dev / Cloudflare runtime）
**認証**: dev-admin（`pnpm seed:dev-admin` → `__Host-session` CDP注入）

| TC | テスト名 | 種別 | 結果 | 備考 |
|----|---------|------|------|------|
| TC-1 | login/signup 入力欄 h-11 維持 | 意図的差維持 | PASS | 実測 44px |
| TC-2 | 公開検索ヒーロー h-12 維持 | 意図的差維持 | PASS | 実測 48px |
| TC-3 | FilterBar 入力/select h-7 統一 | 統一確認 | PASS | 実測 28px |
| TC-4 | 標準フォーム input h-10 | 統一確認 | PASS | 実測 40px |
| TC-5 | textarea が潰れない/上辺貼付なし（P-001） | 回帰防止 | PASS | pt10px/min-h320px |
| TC-6 | admin フォーム input h-10 統一 | 統一確認 | PASS | LLM/Prompts/DesignTokens 全て40px |
| TC-7 | アイコンボタン真円維持（rounded-pill） | 視覚不変 | PASS | 32×32/36×36 真円 |
| TC-8 | text-[13px]→text-sm 移行完了 | 統一確認 | PASS | grep 0件 |

**合計**: 8件（PASS: 8 / FAIL: 0）

## ライブ描画できなかった項目（テストデータ不足・実装バグではない）
- タグチップ / BulkActionBar: DB にノート/タグ0件のため実体未描画。コード上の寸法クラス（h-7 / gap-1.5 / rounded-pill）は確認済み。
- UsersTable: `/admin/users` がローダーエラー（CSS無関係の既存のデータ取得起因。`/admin` 本体は正常認証）。検索入力の `h-10` はコードで確認済み。

## 結論
CSS寸法リファクタによる視覚リグレッションは検出されず。意図的差（h-11/h-12 大型入力）は全ページで維持。最重要懸念だった textarea 合成（fieldControl への h-10 追加）も実測で潰れ・貼り付きなしを確認。
</content>
