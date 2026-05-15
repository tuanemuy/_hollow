# Publication テストケース

## ChangePublicationVisibility

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| 自分のノート、private → public、自分メディアのみ | Change | publishedAt 設定、Outbox `note.publish_changed` |
| 他人メディア参照あり | Change(→public) | `BusinessRuleError('media_not_owned')` |
| public → private | Change | publishedAt=null、検索インデックス再構築用イベント |
| unlisted → private | Change | 全 ShareLink revoke、state private |
| trashed ノート | Change | `BusinessRuleError('note_trashed')` |
| 他人ノート | Change | `AuthorizationError` |

## IssueShareLink

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| unlisted ノート、password 無し | IssueShareLink(password=null) | ShareLink 発行 |
| public ノート | IssueShareLink | 発行可（ShareLink 利用は通常 unlisted だが拒否はしない） |
| private ノート | IssueShareLink | `BusinessRuleError('visibility_private')` |
| 10 リンク既発行 | IssueShareLink | `BusinessRuleError('share_link_quota_exceeded')` |
| 弱い password | IssueShareLink | `ValidationError('password_weak')` |

## RevokeShareLink

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| active リンク | Revoke | status=revoked |
| 既に revoked | Revoke | no-op |
| 他人のリンク | Revoke | `AuthorizationError` |

## SetShareLinkPassword

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| active リンク、新パスワード | Set | hash 更新 |
| revoked リンク | Set | `BusinessRuleError('share_link_revoked')` |
| password=null | Set | パスワード解除 |

## ListShareLinks

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| 自分のノート | List | リンク一覧 |
| 他人のノート | List | `AuthorizationError` |

## ResolveShareLink

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| 有効リンク、パスワード一致 | Resolve | noteId 返却、failedAttempts リセット |
| パスワード不一致 | Resolve | `BusinessRuleError('share_link_password_invalid')`、failedAttempts++ |
| 5 回連続失敗 | Resolve | `BusinessRuleError('share_link_password_invalid')` + lockedUntil 設定 |
| ロック中 | Resolve | `BusinessRuleError('share_link_locked')` |
| revoked | Resolve | `BusinessRuleError('share_link_revoked')` |
| 存在しない token | Resolve | `ResourceNotFoundError('share_link')` |

## HandleNoteTrashedEvent / NotePurged / UserDeleted

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| public ノートが trash | Event 受信 | PublicationState を private 化、ShareLink revoke |
| ノート purge | Event 受信 | PublicationState / ShareLink 物理削除 |
| user delete | Event 受信 | 該当ユーザー全ノートを非公開化 |
| 同 event 二重配信 | Event 受信 | 冪等（既に private なら no-op） |
