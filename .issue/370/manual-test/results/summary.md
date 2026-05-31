# テスト実行サマリー — Issue #370

**実行日時**: 2026-05-31
**テストソース**: `.issue/370/testing.md`
**サーバー**: http://localhost:3002/（vite dev, live source）

| TC | テスト名 | 種別 | 結果 | 失敗ステップ |
|----|---------|------|------|-------------|
| TC-001 | admin 再暗号化ボタンのスモーク + already-new-key 確認 | 正常系 | PARTIAL | Step 4（環境起因） |

**合計**: 1 件（PASS: 0 / PARTIAL: 1 / FAIL: 0）

## 備考

- TC-001 は UI 表示・server function 発火・エラーハンドリングは PASS。再暗号化の実処理結果のみ、headless ブラウザの同一オリジンガード（`FORBIDDEN_CROSS_ORIGIN`）により未検証。これは agent-browser の制約であり実装バグではないため Issue は起票しない。
- 再暗号化ロジックの正当性は `reencryptApiKey.integration.test.ts`（6 ケース）・`decryptWithFallback.test.ts`・`secretBox.test.ts`・`createConsumerContainer.integration.test.ts` のグリーンで担保。
- rotation シナリオ（testing.md 確認項目 2・3、異常系 1・2）はサーバー再起動による env 差し替えが必要で headless 自動検証の対象外。integration テストでカバー済み。
