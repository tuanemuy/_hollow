# テスト実行サマリー — Issue #387

**実行日時**: 2026-06-01
**テストソース**: .issue/387/testing.md
**サーバー**: http://localhost:3100（vite dev / ライブソース）
**ログイン**: セッションcookie `__Host-session` を CDP `Storage.setCookies` で投入

| TC | テスト名 | 種別 | 結果 | 失敗ステップ |
|----|---------|------|------|-------------|
| TC-001 | ディレクトリ選択が一覧に反映 | 正常系 | PASS | - |
| TC-002 | 選択中ディレクトリのチップ表示 | 正常系 | PASS | - |
| TC-003 | チップ×で directoryId 解除 | 正常系 | PASS | - |
| TC-004 | クリアで全解除（directoryId含む） | 正常系 | PASS | - |
| TC-005 | 親ディレクトリは直下のみ（子ノート非表示） | 仕様確認 | PASS | - |
| TC-Edge1 | 非実在 directoryId でエラー境界に落ちない | 異常系 | PASS | - |

**合計**: 6 件（PASS: 6 / FAIL: 0）

## 期待マッピング検証（全一致）
- DirA → NoteA1, NoteA2（2件）
- DirB → NoteB1（1件）
- Parent → 0件（子 Child の NoteChild1 は直下でないため非表示）
- Child → NoteChild1（1件）
- 未選択 → 全4件
- 非実在id → 0件かつエラーなし、チップは汎用ラベル「ディレクトリ」にフォールバック

FAIL なし。Issue 起票不要。
