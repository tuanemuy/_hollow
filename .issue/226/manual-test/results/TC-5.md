# TC-5: Front Matter raw JSON 編集

**判定**: PASS（エッジケース 4「不正な Front Matter JSON」も同時にカバー）
**実施日**: 2026-05-27

## 手順と結果

### 5.1 不正な JSON 入力時

| # | 操作 | 期待 | 実際 |
|---|---|---|---|
| 1 | FrontMatter フィールドに `{not: "valid"` を入力 | OK | OK |
| 2 | 「登録」を押下 | インラインエラー、他フィールド保持 | OK（モーダル内に `alert: エラーが発生しました` 表示。タイトル / FrontMatter テキストエリアの内容は保持） |

### 5.2 有効な JSON 入力時

| # | 操作 | 期待 | 実際 |
|---|---|---|---|
| 1 | FrontMatter フィールドを `{"author": "tc-5", "category": "test"}` に修正 | OK | OK |
| 2 | タイトルを `FM JSON Test (valid)` に変更 | OK | OK |
| 3 | 「登録」を押下 | ノート詳細遷移、FM 反映 | OK（`/notes/019e6992-dd6c-7118-9f10-a2e7e5951662` へ遷移）|
| 4 | DB を直接照会 | `front_matter_json = {"author":"tc-5","category":"test"}` | OK（完全一致） |

## エッジケース 4 への適合

- `BusinessRuleError("FRONT_MATTER_JSON_INVALID")` 相当のエラーが alert role でモーダル内表示 — OK
- ただしエラーメッセージは「エラーが発生しました」とジェネリックで、`FRONT_MATTER_JSON_INVALID` 等の詳細コードは表示されていない（spec の `FRONT_MATTER_JSON_INVALID` 相当の文言には足りない可能性あり）
- 他フィールド (タイトル / FrontMatter テキストの入力値) は保持 — OK

## スクリーンショット

- `screenshots/tc-5/01-invalid-fm.png`
- `screenshots/tc-5/02-invalid-error.png` - 不正 JSON 時のエラー表示
- `screenshots/tc-5/03-after-valid.png` - 有効 JSON 時のノート詳細遷移

## 起票候補（軽微）

- エラーメッセージのジェネリック化: 「エラーが発生しました」だけでなく `FRONT_MATTER_JSON_INVALID` 等の意味のあるテキストを表示する余地あり
