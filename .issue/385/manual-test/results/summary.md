# テスト実行サマリー — Issue #385

**実行日時**: 2026-06-02
**テストソース**: `.issue/385/testing.md`
**サーバー**: http://localhost:8787（`pnpm build && pnpm start`）
**ログイン**: `existing@example.com`（成功）

| TC | テスト名 | 種別 | 結果 | 失敗ステップ |
|----|---------|------|------|-------------|
| TC-001 | UUID形式の非存在 noteId で notFound 表示 | 異常系 | PASS | - |
| TC-002 | 実在ノートが従来どおり表示される | 正常系 | PASS | - |
| TC-003 | 不正な形式の noteId で notFound 表示 | エッジ | PASS | - |

**合計**: 3 件（PASS: 3 / FAIL: 0）

## 結論

存在しない noteId（UUID形式・不正形式いずれも）で「ノートが見つかりません」（`role="alert"`）が表示され、汎用エラー境界「エラーが発生しました」には落ちないことを確認。正常系のノート詳細表示にも回帰なし。Issue #385 の修正は意図どおり動作している。

## 備考

- 手順書は password 欄 Enter 送信を前提にしていたが、本環境では Enter では遷移せず「ログイン」ボタンの click で正常に submit・遷移した（cross-origin 拒否は発生せず）。
