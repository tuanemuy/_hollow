# テスト実行サマリー — Issue #233

**実行日時:** 2026-05-28
**テストソース:** `.issue/233/testing.md`
**サーバー:** http://localhost:3002

| TC | テスト名 | 種別 | 結果 |
|----|---------|------|------|
| TC-233-001 | 新規ノート = WYSIWYG タブが初期選択 | 正常系 | PASS |
| TC-233-002 | 既存ノート編集 = ビジュアル(inline) タブが初期選択 | 正常系 | PASS |
| TC-233-003 | dirty 状態でモード切替時に confirm ダイアログ表示 | 正常系 | PASS |

**合計**: 3 件（PASS: 3 / FAIL: 0）

## 検証範囲のスコープ説明

testing.md 全 9 確認項目のうち、ブラウザ自動操作で意味のある「ユーザー可視のデフォルト挙動」と「dirty 確認」の 3 件を実行。残りは以下の理由で本検証では実行せず:

- **TC-3（構造保持）/ TC-4（パース失敗フォールバック）/ エッジ1（空ボディ）/ エッジ4（ペースト）**: `inlineEditor.test.tsx` のユニットテスト 8 件（happy-dom + createRoot + act）で構造保持・装飾保持・Enter抑止・ペースト無害化・空ボディ・onInitFailed・外部 value 同期・disabled toggle を検証済み
- **TC-6（inline→wysiwyg 切替時の警告）/ エッジ2（pre）/ エッジ3（IME）**: 単体テストで挙動が pin されており、ブラウザ操作での価値が低い

確認済みユニットテスト: `pnpm test:unit` 132 files / 2615 tests all pass。

## 起票したIssue
- なし（全 PASS）

## 関連ファイル
- レポート: `.issue/233/manual-test/results/`
- スクリーンショット: `.issue/233/manual-test/screenshots/`
- testing.md: `.issue/233/testing.md`
