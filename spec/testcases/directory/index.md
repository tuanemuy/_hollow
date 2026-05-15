# Directory テストケース

## CreateDirectory

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| ルート配下 / 同名なし | CreateDirectory | 作成成功 | |
| 同名兄弟あり（大文字差） | CreateDirectory | `BusinessRuleError('directory_name_conflict')` | |
| 深さ 10 階層目の親 | CreateDirectory（11階層目） | `BusinessRuleError('directory_too_deep')` | |
| 他人の parent_id | CreateDirectory | `AuthorizationError` | |
| 禁止文字を含む name | CreateDirectory | `ValidationError` | |
| parent_id が存在しない | CreateDirectory | `ResourceNotFoundError('directory')` | |

## RenameDirectory

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| 通常リネーム | RenameDirectory | 反映 |
| ルートをリネーム | RenameDirectory(root) | `BusinessRuleError('cannot_rename_root')` |
| 同名兄弟あり | RenameDirectory | `BusinessRuleError('directory_name_conflict')` |
| 自分自身と同名 | RenameDirectory | no-op で成功 |

## MoveDirectory

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| 別親へ移動 | MoveDirectory | 反映、子孫の depth 再計算 |
| 自分の子孫を親に指定 | MoveDirectory | `BusinessRuleError('directory_cyclic_move')` |
| 移動先で同名兄弟 | MoveDirectory | `BusinessRuleError('directory_name_conflict')` |
| 移動先 depth 上限超 | MoveDirectory | `BusinessRuleError('directory_too_deep')` |

## DeleteDirectory

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| 空ディレクトリ | DeleteDirectory | 削除成功、Outbox イベントなし |
| 配下にノートあり | DeleteDirectory | ノートが trash 化、Outbox `note.deleted` 発火、ディレクトリ物理削除 |
| 配下に子ディレクトリあり | DeleteDirectory | 再帰削除 |
| ルートを削除 | DeleteDirectory(root) | `BusinessRuleError('cannot_delete_root')` |
| 他人のディレクトリ | DeleteDirectory | `AuthorizationError` |

## GetDirectoryTree

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| 3 階層のツリー | GetDirectoryTree | 正しい木構造 |
| ノードなし（新規ユーザー） | GetDirectoryTree | ルートのみ返す |
