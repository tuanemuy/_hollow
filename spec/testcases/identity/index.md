# Identity テストケース

各ユースケースのテストケースを 1 ドキュメント内のセクションで定義する（実装層は usecase 単位の test ファイルで対応）。

## SignUp

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| registration.open === true、空 DB | 正規 input で SignUp | User が pending / role=member で作成、password credential 登録、確認メール送信、ルートディレクトリ作成 | |
| registration.open === false | SignUp 実行 | `BusinessRuleError('registration_closed')` | |
| 既存 username あり | 同 username で SignUp | `BusinessRuleError('username_taken')` | |
| 既存 email あり | 同 email で SignUp | `BusinessRuleError('email_taken')` | |
| username 規約違反（記号 / 予約語） | SignUp | `ValidationError` | |
| password が 11 字 | SignUp | `ValidationError('password_weak')` | |
| password が 12 字だが種別 1 種のみ | SignUp | `ValidationError('password_weak')` | |
| 空 DB で SignUp（旧「初ユーザー特例」廃止確認） | SignUp | role が **member** になる（admin にはならない） | |
| 2 人目以降登録 | SignUp | role が member になる | |
| EmailSender 失敗 | SignUp | User と credential は作成済み、`EmailSendError` を返す | |

## AdminSignUp

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| env `ADMIN_SETUP_TOKEN` 設定済み、トークン一致 | AdminSignUp | User が pending / **role=admin** で作成、password credential 登録、確認メール送信、ルートディレクトリ作成 | |
| env 未設定 | AdminSignUp | `AuthenticationError('setup_token_disabled')` | |
| env 設定済み、トークン不一致 | AdminSignUp | `AuthenticationError('invalid_setup_token')` | |
| env 設定済み、空文字 setupToken | AdminSignUp | `AuthenticationError('invalid_setup_token')` | |
| `registration.open === false` でも env 一致 | AdminSignUp | 成功（運用者特権で `registration_closed` は適用されない） | |
| 既存 username と衝突 | AdminSignUp | `BusinessRuleError('username_taken')` | |
| 既存 email と衝突 | AdminSignUp | `BusinessRuleError('email_taken')` | |
| 弱い password | AdminSignUp | `ValidationError('password_weak')` | |
| 同じ token で 2 回連続実行（別 username/email） | AdminSignUp | 両方成功し、admin が 2 人作られる（env が消えるまで何度でも可） | |
| token 一致だが VO 構築失敗（username 規約違反） | AdminSignUp | `ValidationError`（token 検証は通過済みでも VO エラーは返す） | |
| 確認リンク経由で activate | VerifyEmail | `role=admin` のまま active になる。`status === 'active' && role === 'admin'` を要求する usecase 群（`PromoteUserToAdmin` / `DemoteAdmin` / `SuspendUser` / `ReinstateUser` および AdminSettings ドメインの `UpdateLLMConfig` / `ToggleRegistrationPolicy` 等）が成功する | |
| activate 前（pending）の admin User で admin 操作実行 | PromoteUserToAdmin 等 | `AuthenticationError('unverified')` または認可ガードで `AuthorizationError`（LogIn を通過していないため、そもそも session が存在しない） | |

## VerifyEmail

| 前提条件 | 操作 | 期待結果 | 実装ステータス |
|---|---|---|---|
| 有効な email_verification token | VerifyEmail | User が active に、新セッション発行 | |
| 期限切れ token | VerifyEmail | `BusinessRuleError('token_expired')` | |
| consumed 済み token | VerifyEmail | `BusinessRuleError('token_consumed')` | |
| password_reset 用 token を渡す | VerifyEmail | `BusinessRuleError('token_purpose_mismatch')` | |
| 存在しない token | VerifyEmail | `BusinessRuleError('token_not_found')` | |
| 既に active な User の token | VerifyEmail | `BusinessRuleError('user_not_pending')` | |
| token consume 成功後に `userRepo.findById` が null（消えた / 未保存） | VerifyEmail | `ResourceNotFoundError('user')`（UoW ロールバックされ token は再利用可能） | |
| UoW commit 後の `sessionService.issue` が失敗 | VerifyEmail | `ExternalServiceError(service: 'session')`、User は active 化済みのため手動 LogIn で復帰可能 | |

## ResendVerification

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| pending User | ResendVerification | 新 token 発行、メール送信 |
| pending User、既存 email_verification token 保有 | ResendVerification | 旧 token は無効化（`consume` で `ChallengeError('not_found' or 'consumed')`）、新 token 発行 |
| active User | ResendVerification | no-op、メール送信なし |
| 未登録 email | ResendVerification | 反応は同じ（成否非区別） |

## LogIn

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| active User、正しい password | LogIn | セッション発行 |
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
| 5 セッション保有、現在 1 つ | RevokeAllOtherSessions(currentSessionToken) | 4 つが revoked、current は残る、`revokedCount=4` |

## RequestPasswordReset

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| 登録済み email | RequestPasswordReset | password_reset challenge 発行、メール送信 |
| 既存 password_reset token 保有 | RequestPasswordReset | 旧 token 無効化、新 token 発行 |
| 未登録 email | RequestPasswordReset | 成否非区別、メール送信なし |
| 連続実行 | RequestPasswordReset | レート制限 (presentation 層担保) |

## ResetPassword

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| 有効 token | ResetPassword | password が更新、全 session が revoke、新 session 発行 |
| 期限切れ token | ResetPassword | `BusinessRuleError('token_expired')` |
| 使用済み token | ResetPassword | `BusinessRuleError('token_consumed')` |
| email_verification 用 token | ResetPassword | `BusinessRuleError('token_purpose_mismatch')` |
| 弱い password | ResetPassword | `ValidationError('password_weak')` |

## ChangePassword

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| 正しい current password | ChangePassword | password 更新 |
| 不正 current password | ChangePassword | `AuthenticationError('invalid_credentials')` |
| 弱い new password | ChangePassword | `ValidationError('password_weak')` |
| revokeOtherSessions=true | ChangePassword | 他 session が revoke、current は残る |

## RequestEmailChange

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| 正常 | RequestEmailChange | email_change challenge 発行 (payload に newEmail)、新旧両方にメール |
| 既存 email_change token 保有 | RequestEmailChange | 旧 token 無効化、新 token 発行 |
| 新 email が既存 | RequestEmailChange | `BusinessRuleError('email_taken')` |
| current password 不正 | RequestEmailChange | `AuthenticationError('invalid_credentials')` |
| 連続実行 | RequestEmailChange | レート制限 |

## VerifyEmailChange

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| 有効 token | VerifyEmailChange | email が payload.newEmail に差し替え |
| token の newEmail が他人に奪われた | VerifyEmailChange | `BusinessRuleError('email_taken')` |
| 期限切れ | VerifyEmailChange | `BusinessRuleError('token_expired')` |

## UpdateProfile

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| 正常 displayName 変更 | UpdateProfile | displayName 反映 |
| bio 上限超過 (501 字) | UpdateProfile | `ValidationError` |
| 他人の media を avatar 指定 | UpdateProfile | `BusinessRuleError('media_not_owned')` |
| avatar を null に | UpdateProfile | 旧 avatar の refCount-- |

## ChangeUsername

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| 30 日以上前に変更 | ChangeUsername | 反映、lastUsernameChangedAt 更新 |
| 30 日未満に変更済み | ChangeUsername | `BusinessRuleError('username_change_too_soon')` |
| 既存 username と衝突 | ChangeUsername | `BusinessRuleError('username_taken')` |
| username 規約違反 | ChangeUsername | `ValidationError` |

## DeleteAccount

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| 確認語一致 | DeleteAccount | User が deleted、`credentialStore.purgeAll` で accounts 行削除、全 session revoke、user.deleted イベント発火 |
| 確認語不一致 | DeleteAccount | `BusinessRuleError('confirmation_mismatch')` |
| 唯一の admin | DeleteAccount | `BusinessRuleError('last_admin_protected')` |
| 既に削除済み | DeleteAccount | `BusinessRuleError('already_deleted')` |
| 削除後ログイン試行 | LogIn | `AuthenticationError('invalid_credentials')` (verifyPassword が deleted を null 返却) |
| 削除後の username 再使用試行 | 別アカウントで SignUp | `BusinessRuleError('username_taken')` (永久ロック) |

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
| active を reinstate | Reinstate | `BusinessRuleError('user_not_suspended')` |
