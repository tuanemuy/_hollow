# Identity テストケース

各ユースケースのテストケースを 1 ドキュメント内のセクションで定義する（実装層は usecase 単位の test ファイルで対応）。

## SignUp

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| registration.open === true、空 DB | 正規 input で SignUp | User が pending で作成され、確認メール送信、ルートディレクトリ作成 | |
| registration.open === false | SignUp 実行 | `BusinessRuleError('registration_closed')` | |
| 既存 username あり | 同 username で SignUp | `BusinessRuleError('username_taken')` | |
| 既存 email あり | 同 email で SignUp | `BusinessRuleError('email_taken')` | |
| username 規約違反（記号 / 予約語） | SignUp | `ValidationError` | |
| password が 11 字 | SignUp | `ValidationError('password_weak')` | |
| 初ユーザー登録 | SignUp | role が admin になる | |
| 2 人目以降登録 | SignUp | role が member になる | |
| EmailSender 失敗 | SignUp | User は作成済み、`EmailSendError` を返す | |

## VerifyEmail

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 有効な signup token | VerifyEmail | User が active に、Session 発行 | |
| 期限切れ token | VerifyEmail | `BusinessRuleError('token_expired')` | |
| consumed 済み token | VerifyEmail | `BusinessRuleError('token_consumed')` | |
| email_change 用 token を渡す | VerifyEmail | `BusinessRuleError('token_purpose_mismatch')` | |
| 存在しない token | VerifyEmail | `ResourceNotFoundError('user')` | |

## ResendVerification

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| pending User | ResendVerification | 新 token 発行、メール送信 |
| active User | ResendVerification | no-op、メール送信なし |
| 未登録 email | ResendVerification | 反応は同じ（成否非区別） |

## LogIn

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| active User、正しい password | LogIn | Session 発行 |
| 不正 password | LogIn | `AuthenticationError('invalid_credentials')` |
| 存在しない email | LogIn | `AuthenticationError('invalid_credentials')` |
| pending User | LogIn | `AuthenticationError('unverified')` |
| suspended User | LogIn | `AuthenticationError('account_unavailable')` |
| deleted User | LogIn | `AuthenticationError('account_unavailable')` |

## LogOut

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| 有効な session token | LogOut | session が revoked になる |
| 不正 / 期限切れ token | LogOut | 成功（冪等） |

## RevokeAllOtherSessions

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| 5 セッション保有、現在 1 つ | RevokeAllOtherSessions(current) | 4 つが revoked、current は残る |

## RequestPasswordReset

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| 登録済み email | RequestPasswordReset | PasswordResetToken 発行、メール送信 |
| 未登録 email | RequestPasswordReset | 成否非区別、メール送信なし |
| 連続実行 | RequestPasswordReset | レート制限 |

## ResetPassword

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| 有効 token | ResetPassword | password が更新、全 session が revoke、新 session 発行 |
| 期限切れ token | ResetPassword | `BusinessRuleError('token_expired')` |
| 使用済み token | ResetPassword | `BusinessRuleError('token_consumed')` |
| 弱い password | ResetPassword | `ValidationError('password_weak')` |

## ChangePassword

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| 正しい current password | ChangePassword | password 更新 |
| 不正 current password | ChangePassword | `AuthenticationError` |
| 弱い new password | ChangePassword | `ValidationError` |
| revokeOtherSessions=true | ChangePassword | 他 session が revoke |

## RequestEmailChange

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| 正常 | RequestEmailChange | 新トークン発行、新旧両方にメール |
| 新 email が既存 | RequestEmailChange | `BusinessRuleError('email_taken')` |
| current password 不正 | RequestEmailChange | `AuthenticationError` |
| 連続実行 | RequestEmailChange | `RateLimitError` |

## VerifyEmailChange

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| 有効 token | VerifyEmailChange | email 差し替え |
| token の targetEmail が他人に奪われた | VerifyEmailChange | `BusinessRuleError('email_taken')` |
| 期限切れ | VerifyEmailChange | `BusinessRuleError('token_expired')` |

## UpdateProfile

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| 正常 displayName 変更 | UpdateProfile | 反映 |
| bio 上限超過 | UpdateProfile | `ValidationError` |
| 他人の media を avatar 指定 | UpdateProfile | `BusinessRuleError('media_not_owned')` |
| avatar を null に | UpdateProfile | 旧 avatar の refCount-- |

## ChangeUsername

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| 30 日以上前に変更 | ChangeUsername | 反映 |
| 30 日未満に変更済み | ChangeUsername | `BusinessRuleError('username_change_too_soon')` |
| 既存 username と衝突 | ChangeUsername | `BusinessRuleError('username_taken')` |

## DeleteAccount

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| 確認語一致 | DeleteAccount | User が deleted、全 session revoke、user.deleted イベント発火 |
| 確認語不一致 | DeleteAccount | `BusinessRuleError('confirmation_mismatch')` |
| 唯一の admin | DeleteAccount | `BusinessRuleError('last_admin_protected')` |

## PromoteUserToAdmin / DemoteAdmin

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| admin が member を promote | Promote | role=admin |
| member が member を promote | Promote | `AuthorizationError` |
| 唯一の admin を demote | Demote | `BusinessRuleError('last_admin_protected')` |
| 別の admin がいる admin を demote | Demote | role=member |

## SuspendUser / ReinstateUser

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| active を suspend | Suspend | status=suspended、session 全 revoke |
| suspended を reinstate | Reinstate | status=active |
| pending を suspend | Suspend | `BusinessRuleError('user_not_active')` |
