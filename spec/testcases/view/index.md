# View テストケース

## CreateSavedView

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| 通常入力 | Create | SavedView 作成 |
| 同名 | Create | `BusinessRuleError('saved_view_name_conflict')` |
| isDefault=true、既存 default あり | Create | 既存を unmarkDefault、新規を default に |
| 参照する tagId が削除済み | Create | brokenConditions に markBroken |

## UpdateSavedView

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| 通常更新 | Update | 反映 |
| 同名衝突 | Update | `BusinessRuleError` |
| 他人 view | Update | `AuthorizationError` |

## DeleteSavedView / SetDefaultSavedView

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| 自分の view | Delete | 削除 |
| 他人の view | Delete | `AuthorizationError` |
| SetDefault(viewId=null) | Set | 既定なし状態 |
| SetDefault 既存 default あり | Set | 既存を unmarkDefault、新規を mark |

## ListSavedViews / ValidateSavedView

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| personal | List | 個人 view 一覧、brokenConditions 最新化 |
| public | List | 公開 view 一覧 |
| 参照 tag が削除されている | Validate | brokenConditions に markBroken |

## Handle 系イベント

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| tag.deleted 受信 | Handle | 該当 view を markBroken |
| directory.deleted 受信 | Handle | 同上 |
| note.purged 受信 | Handle | 同上 |
