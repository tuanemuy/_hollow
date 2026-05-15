# Tag テストケース

## CreateTag

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| 新規 name | CreateTag | 作成 |
| 既存 name（正規化後一致） | CreateTag | `BusinessRuleError('tag_name_conflict')` |
| 50 字超 | CreateTag | `ValidationError` |
| `#abc` で始まる | CreateTag | `#` を除去して保持 |
| ブラックリスト名 | CreateTag | 作成成功（ブラックリストはユーザー作成で解除扱い） |

## RenameTag

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| 新名衝突なし | RenameTag | name 変更、関連ノート本文の `#oldName` も置換 |
| 新名既存 | RenameTag | `BusinessRuleError('tag_name_conflict')` |
| 本文に大量出現 | RenameTag | バッチで Note を save、Outbox 発火 |

## MergeTags

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| 異なる 2 タグ | MergeTags | source を target にマージ、source 削除 |
| 同一タグ | MergeTags | `BusinessRuleError('tag_merge_same')` |
| 他人 owner | MergeTags | `BusinessRuleError('tag_owner_mismatch')` or `AuthorizationError` |
| 重複（既に target を持つノート） | MergeTags | 重複除去で 1 つに |

## DeleteTag

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| 使用中タグ | DeleteTag | 関連ノートから除去、Blacklist 追加、Tag 削除 |
| 未使用タグ | DeleteTag | Blacklist 追加、Tag 削除 |

## ListTags

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| 100 件タグ | ListTags(limit=50) | 50 件 + nextCursor |
| 0 件 | ListTags | 空 |
