# Identity ユースケース

## SignUp

### 概要
新規ユーザー登録。`pending` 状態で User を作成し、確認メールを送信。

### 入力DTO
- `username: string` (required, Username の規約)
- `email: string` (required, EmailAddress 規約)
- `password: string` (required, RawPassword 規約)
- `displayName: string | null` (optional, 0..50)
- `acceptTerms: true` (required)

### 出力DTO
- `userId: UserId`

### 処理フロー
1. AdminSettingsRepository.get() で `registration.open === true` を確認、違反は `BusinessRuleError('registration_closed')`
2. Username / EmailAddress / RawPassword を値オブジェクト化
3. `IdentityService.assertUsernameAvailable`、`assertEmailAvailable`
4. PasswordHasher.hash でハッシュ生成
5. UoW.run({ userRepo, tokenRepo, dirRepo }) 内で:
   - User を `status='pending'` `role=member` で作成、Clock.now で `createdAt/updatedAt` 設定
   - 初ユーザーなら `role=admin`
   - DirectoryService.ensureRoot でルートディレクトリ作成
   - EmailVerificationToken（`purpose='signup'`、TTL 24h）を作成、TokenGenerator で平文+ハッシュ
6. UoW commit 後に EmailSender.sendVerification

### エラーケース
- `BusinessRuleError('registration_closed')`
- `BusinessRuleError('username_taken' | 'email_taken')`
- `ValidationError`（VO 構築失敗）
- `EmailSendError`（後続。User は作成済み）

---

## VerifyEmail

### 概要
サインアップ確認リンクの消費。

### 入力DTO
- `token: string` (required)

### 出力DTO
- `userId: UserId`
- `sessionToken: string`（自動ログイン用）

### 処理フロー
1. TokenGenerator.hash で平文 → hash 化
2. EmailVerificationTokenRepository.findByTokenHash
3. `token.isValid(now)` 確認、`purpose === 'signup'` 確認
4. UoW.run で:
   - `token.consume(now)`
   - User をロードして `activate(now)`
   - Session を発行
5. 平文セッショントークンを返却

### エラーケース
- `BusinessRuleError('token_expired' | 'token_consumed' | 'token_purpose_mismatch')`
- `ResourceNotFoundError('user')`

---

## ResendVerification

### 概要
確認メールの再送。

### 入力DTO
- `email: string`

### 出力DTO
- なし（成否を区別しない）

### 処理フロー
1. UserRepository.findByEmail。存在しなければ何もせず終了（列挙対策）
2. `status === 'pending'` のとき、新しい EmailVerificationToken を発行・保存
3. EmailSender.sendVerification

### エラーケース
- 内部失敗のみ。外部にはエラーを露出しない

---

## LogIn

### 入力DTO
- `email: string`, `password: string`, `userAgent: string | null`, `ipAddress: string | null`

### 出力DTO
- `userId: UserId`, `sessionToken: string`, `expiresAt: Instant`

### 処理フロー
1. UserRepository.findByEmail
2. `status === 'active'` 確認。`pending` は `unverified` エラー、`suspended/deleted` は汎用エラー
3. PasswordHasher.verify
4. Session を発行・保存

### エラーケース
- `AuthenticationError('invalid_credentials')`（user 非存在 or 認証失敗）
- `AuthenticationError('unverified')`
- `AuthenticationError('account_unavailable')`

---

## LogOut

### 入力DTO
- `sessionToken: string`

### 出力DTO
- なし

### 処理フロー
1. token を hash 化、SessionRepository.findByTokenHash
2. 見つかれば `revoke(now)`

### エラーケース
- 存在しなくても成功（冪等）

---

## RevokeAllOtherSessions

### 入力DTO
- `actorUserId: UserId`, `currentSessionId: SessionId`

### 出力DTO
- `revokedCount: number`

### 処理フロー
1. SessionRepository.revokeAllForUser を呼び、currentSession のみ生かす特別処理（実装はリポジトリ側で）

### エラーケース
- なし

---

## RequestPasswordReset

### 入力DTO
- `email: string`

### 出力DTO
- なし（成否非区別）

### 処理フロー
1. findByEmail。存在すれば PasswordResetToken（TTL 1h）発行
2. 存在しなくても応答は同じ
3. EmailSender.sendPasswordReset

### エラーケース
- 内部失敗のみ

---

## ResetPassword

### 入力DTO
- `token: string`, `newPassword: string`

### 出力DTO
- `userId: UserId`, `sessionToken: string`

### 処理フロー
1. token を hash 化して findByTokenHash
2. `isValid(now)` 確認
3. UoW.run で `consume`、PasswordHasher.hash で新ハッシュ生成、`User.rotatePasswordHash`、Session を発行
4. 既存全 Session を revokeAllForUser

### エラーケース
- `BusinessRuleError('token_expired' | 'token_consumed')`
- `ValidationError('password_weak')`

---

## ChangePassword

### 入力DTO
- `actorUserId: UserId`, `currentPassword: string`, `newPassword: string`, `revokeOtherSessions: boolean`

### 出力DTO
- なし

### 処理フロー
1. User 取得、PasswordHasher.verify
2. `rotatePasswordHash` → save
3. `revokeOtherSessions === true` なら SessionRepository.revokeAllForUser（current 以外）

### エラーケース
- `AuthenticationError('invalid_credentials')`（current 不一致）
- `ValidationError('password_weak')`

---

## RequestEmailChange

### 入力DTO
- `actorUserId: UserId`, `newEmail: string`, `currentPassword: string`

### 出力DTO
- なし

### 処理フロー
1. User を `actorUserId` で取得
2. PasswordHasher.verify で本人確認
3. `assertEmailAvailable`
4. EmailVerificationToken（`purpose='email_change'`、`targetEmail = newEmail`）発行
5. EmailSender.sendEmailChangeNotice（新アドレス向け）+ sendEmailChangeWarning（旧アドレス向け、即時通知）

### エラーケース
- `BusinessRuleError('email_taken')`
- `AuthenticationError('invalid_credentials')`
- レート制限超過 `RateLimitError`

---

## VerifyEmailChange

### 入力DTO
- `token: string`

### 出力DTO
- `userId: UserId`

### 処理フロー
1. token hash 化、findByTokenHash、`isValid` + `purpose === 'email_change'`
2. UoW: `consume`、`User.changeEmail(token.targetEmail, now)`、save

### エラーケース
- `BusinessRuleError('token_expired' | 'token_consumed')`
- `BusinessRuleError('email_taken')`（差し替え時点で奪われていた場合）

---

## UpdateProfile

### 入力DTO
- `actorUserId: UserId`, `displayName?: string | null`, `bio?: string | null`, `avatarMediaId?: MediaAssetId | null`

### 出力DTO
- `user: UserDTO`

### 処理フロー
1. User 取得
2. avatarMediaId が指定されている場合、MediaAssetRepository から取得して `assertOwnedBy(actorUserId)`、Media の `incrementRef`（旧 avatar は decrementRef）
3. `changeDisplayName` / `changeBio` / `changeAvatar` を順に適用、save

### エラーケース
- `ValidationError`
- `BusinessRuleError('media_not_owned')`

---

## ChangeUsername

### 入力DTO
- `actorUserId: UserId`, `newUsername: string`

### 出力DTO
- `user: UserDTO`

### 処理フロー
1. User 取得、`changeUsername(newUsername, now)`（30 日制限）
2. `assertUsernameAvailable`
3. save

### エラーケース
- `BusinessRuleError('username_change_too_soon' | 'username_taken')`
- `ValidationError`

---

## DeleteAccount

### 入力DTO
- `actorUserId: UserId`, `confirmation: string`（ユーザー名と一致するよう要求）

### 出力DTO
- なし

### 処理フロー
1. User 取得、`confirmation === user.username` を検証
2. admin の場合は `UserRepository.countAdmins()` の戻り値で `IdentityService.assertNotLastAdmin(targetUserId, count)` を呼ぶ
3. UoW: `User.markDeleted(now)`、SessionRepository.revokeAllForUser、PublicationStateRepository で全公開ノートを非公開化（Outbox `user.deleted` を発火し各ドメインで連鎖クリーンアップ）
4. 進行中の ExportJob を cancel

### エラーケース
- `BusinessRuleError('confirmation_mismatch' | 'last_admin_protected')`

---

## PromoteUserToAdmin / DemoteAdmin

### 入力DTO
- `actorAdminId: UserId`, `targetUserId: UserId`

### 処理フロー
1. actor が admin か確認、ResourceNotFoundError があれば不可
2. promote: `promoteToAdmin(now)` / demote: `UserRepository.countAdmins()` → `IdentityService.assertNotLastAdmin(targetUserId, count)` → `demoteToMember(now)`

### エラーケース
- `AuthorizationError`
- `BusinessRuleError('last_admin_protected')`

---

## SuspendUser / ReinstateUser

### 入力DTO
- `actorAdminId: UserId`, `targetUserId: UserId`

### 処理フロー
- suspend: `suspend(now)`、SessionRepository.revokeAllForUser
- reinstate: `reinstate(now)`

### エラーケース
- `AuthorizationError`
- `BusinessRuleError('user_not_active' | 'user_not_suspended')`
