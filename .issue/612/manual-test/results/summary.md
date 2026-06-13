# テスト実行サマリー — Issue #612

**実行日時**: 2026-06-13
**テストソース**: .issue/612/testing.md
**サーバー**: http://localhost:3000

| TC | テスト名 | 種別 | 結果 | 失敗ステップ |
|----|---------|------|------|-------------|
| TC-001 | ヒーロー件数が trashed-but-public を除外（live 件数=4） | 正常系 | PASS | - |
| TC-002 | ヒーロー件数と一覧件数が一致（4==4） | 正常系 | PASS | - |

**合計**: 2 件（PASS: 2 / FAIL: 0）

## 実行しなかった項目と理由

- **確認項目3（公開ノート1000件超で頭打ちにならない）**: testing.md で「任意・大規模 seed が重い場合は integration test で代替可」と明記。追加した D1 integration test（COUNT クエリに limit なし）で担保済みのためブラウザ検証は省略。
- **エッジケース（公開ゼロ・他ユーザー混入なし）・既存機能影響（deleteAccount / listRelatedPublicNotes）**: `findPublicByOwner` 不変更かつ owner スコープ・除外条件は追加した D1 integration test の独立ケース（other-owner 分離、published_at NULL 除外、private/unlisted 除外、zero）で担保済み。

## 検証で確認できた要点

- ヒーローの公開ノート件数 = 4（修正前バグの 5 ではない）。trashed-but-public（relay-lag ゴースト）1 件と published_at NULL の public 1 件がともに除外された。
- ヒーロー件数と一覧カード件数が一致（AC-2、デフォルト経路・フィルタ無し）。
