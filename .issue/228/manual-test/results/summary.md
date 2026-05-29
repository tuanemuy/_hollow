# テスト実行サマリー — Issue #228

**実行日時**: 2026-05-30
**テストソース**: .issue/228/testing.md
**サーバー**: http://localhost:3000（pnpm dev / InlineRelayTrigger により ingestion は同期実行）
**テストユーザー**: test-user@example.com（ローカル D1 にシード、UUIDv7 形式 id で active）

| TC | テスト名 | 種別 | 結果 | 備考 |
|----|---------|------|------|------|
| TC-1 | カスタムプロンプト入力 UI の表示 | 正常系 | PASS | アコーディオン＋2 textarea 表示 |
| TC-2 | override が LLM 処理に反映 | 正常系 | PASS | タグ=META_MARKER_888 / 本文H1=KOZO_MARKER_777 |
| TC-3 | 空入力フォールバック | 正常系 | PASS | 通常結果に到達・マーカー漏れなし |
| TC-4 | 複数ファイル一括で全件適用 | 正常系 | PASS | 2ファイル両方 BATCH_MARKER_999 |
| Edge-1 | 過大プロンプトのガード | 異常系 | PASS | 18000B 入力でエラー・編集画面に未到達 |

**合計**: 5 件（PASS: 5 / FAIL: 0）

## 自動テストでカバー済み（ブラウザ未実行）
- TC-5（再生成時の override 保持）: runIngestionJob 統合テストで「regenerate 後も同じ override が LLM に渡る」を検証済み。
- Edge-2（html/markdown では structure override 無視）: plan「既知の仕様上の制約」。runIngestionJob のパイプライン分岐（html/markdown は structureToHtml を呼ばない）として設計上担保。

## 参考所見（軽微・非ブロッカー）
- Edge-1: 過大入力時のエラー文言が汎用的（「エラーが発生しました」）で、サイズ上限超過の旨が明示されない。ガード自体は機能。UX 改善余地として progress.md に記録。
