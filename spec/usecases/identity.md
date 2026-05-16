# Identity ユースケース

## SignUp

### 概要
新規ユーザー登録。常に `role=member` / `status='pending'` で User を作成し、パスワード credential を登録、確認メールを送信。admin の登録は [`AdminSignUp`](#adminsignup) を使う（[ADR 007](../adr/007-admin-setup-token.md)）。

### 入力DTO
- `username: string` (required, Username の規約)
- `email: string` (required, EmailAddress 規約)
- `password: string` (required, RawPassword 規約)
- `displayName: string | null` (optional, 1..50。未指定 / null なら `username` で初期化)
- `acceptTerms: true` (required) — リテラル `true` のみ受理。**transport 境界（presentation 層の input validator）で検証する**ため、本ユースケースに到達した時点で `true` であることは型として保証される（[CLAUDE.md](../../CLAUDE.md) の境界検証方針）

### 出力DTO
- `userId: UserId`

### 処理フロー
1. `InstanceSettingsRepository.get()`（[AdminSettings ドメイン](../domains/adminSettings.md) のポート）で `registration.open === true` を確認、違反は `BusinessRuleError('registration_closed')`
2. Username / EmailAddress / RawPassword を値オブジェクト化
3. `IdentityService.assertUsernameAvailable` / `assertEmailAvailable`
4. UoW.run({ userRepo, credentialStore, verificationChallenge, dirRepo }) 内で:
   - User を `status='pending'` `role=member` `displayName = input.displayName ?? username.value` で作成、Clock.now で `createdAt/updatedAt` 設定
   - `userRepo.save(user)`
   - `credentialStore.registerPassword(user.id, rawPassword)`
   - DirectoryService.ensureRoot でルートディレクトリ作成
   - `verificationChallenge.issue(user.id, 'email_verification', ttl: 24h)` → 平文トークン取得
5. UoW commit 後に `EmailSender.sendVerification(email, link, locale)`

### エラーケース
- `BusinessRuleError('registration_closed')`
- `BusinessRuleError('username_taken' | 'email_taken')`
- `ValidationError`（VO 構築失敗）
- `EmailSendError`（後続。User と credential は作成済み）

---

## AdminSignUp

### 概要
Setup Token を提示して admin ユーザーを登録する。通常の `SignUp` と同じく `pending` 状態で User を作成し、確認メール経由で activate するが、`role=admin` で作成し [AdminSettings ドメイン](../domains/adminSettings.md) の `RegistrationPolicy` を無視する（運用者特権、`InstanceSettingsRepository.get()` を呼ばない）。[ADR 007](../adr/007-admin-setup-token.md) 参照。

### 入力DTO
- `username: string` (required, Username 規約)
- `email: string` (required, EmailAddress 規約)
- `password: string` (required, RawPassword 規約)
- `displayName: string | null` (optional, 1..50)
- `setupToken: string` (required)
- `acceptTerms: true` (required) — `SignUp` と同様に transport 境界で検証済みであることをユースケース入力の前提とする

### 出力DTO
- `userId: UserId`

### 処理フロー
1. `setupTokenVerifier.isEnabled()` が false なら `AuthenticationError('setup_token_disabled')` (env 未設定)
2. `setupTokenVerifier.verify(setupToken)` が false なら `AuthenticationError('invalid_setup_token')` (定数時間比較)
3. Username / EmailAddress / RawPassword を値オブジェクト化
4. `IdentityService.assertUsernameAvailable` / `assertEmailAvailable`
5. UoW.run({ userRepo, credentialStore, verificationChallenge, dirRepo }) 内で:
   - User を `status='pending'` **`role=admin`** `displayName = input.displayName ?? username.value` で作成
   - `userRepo.save(user)`
   - `credentialStore.registerPassword(user.id, rawPassword)`
   - DirectoryService.ensureRoot でルートディレクトリ作成
   - `verificationChallenge.issue(user.id, 'email_verification', ttl: 24h)` → 平文トークン取得
6. UoW commit 後に `EmailSender.sendVerification(email, link, locale)`

注: `registration.open === false` の状態でも実行可能。これは「運用者がオープン登録を閉じたあとに後任 admin を seed する」運用を想定しているため。

### エラーケース
- `AuthenticationError('setup_token_disabled')` — env 未設定
- `AuthenticationError('invalid_setup_token')` — トークン不一致（列挙対策で原因区別なし、`setup_token_disabled` とは別扱い）
- `BusinessRuleError('username_taken' | 'email_taken')`
- `ValidationError`
- `EmailSendError`

---

## VerifyEmail

### 概要
サインアップ確認リンクの消費。User を active 化してセッション発行。

### 入力DTO
- `token: string` (required)

### 出力DTO
- `userId: UserId`
- `sessionToken: string`（自動ログイン用）
- `expiresAt: Instant`

### 処理フロー
1. UoW.run({ userRepo, verificationChallenge }) で:
   - `verificationChallenge.consume(token, 'email_verification')`
     - `ChallengeError` を返した場合は対応する `BusinessRuleError` に翻訳 (`token_expired` / `token_consumed` / `token_purpose_mismatch` / `token_not_found`)
   - `userRepo.findById(result.userId)` → 取得失敗時 `ResourceNotFoundError('user')`
   - `user.activate(now)` → `userRepo.save(updated)`
     - `user_not_pending` で失敗した場合は UoW をロールバックし、トークン consume も巻き戻る (リトライ可能)
2. UoW commit 後に `sessionService.issue(user.id, meta)` でセッション発行
   - **`SessionService.issue` 失敗時の方針**: UoW は既に commit 済みのため User は `active` 化されている。ここでは補償ロールバックを行わず、`ExternalServiceError(service: 'session')` を presentation に返す。クライアントは「メール確認は完了しました。ログイン画面からサインインしてください」と表示し、`LogIn` で自動再合流できる（`active` 化済みのため `unverified` を踏まない）。User の状態と発行済みセッションの片寄せを設計上の不変条件にしない（at-least-once + idempotent な再ログインで回復）
3. `{ userId, sessionToken, expiresAt }` を返却

注: トークン consume と User mutation を同一トランザクションに収めることで、後段の失敗（`user_not_pending` 等）でトークンが「消費済みなのに状態は変わらない」状態を防ぐ。`VerificationChallenge` ポートは UoW に参加可能で、`UnitOfWorkContext.verificationChallenge` 経由で操作する。

注: `SessionService.issue` を UoW 外に置く理由は、トークン保管が外部（KV / better-auth 内部 store）にも及び得るためで、`DeleteAccount` で `revokeAllForUser` を commit 後に呼ぶのと同じ理由。`VerifyEmail` の自動ログインは「ベストエフォートの導線」と位置付け、失敗時は明示的に手動ログインへフォールバックさせる。

### エラーケース
- `BusinessRuleError('token_expired' | 'token_consumed' | 'token_purpose_mismatch' | 'token_not_found')`
- `BusinessRuleError('user_not_pending')`（既に active 等の場合）
- `ResourceNotFoundError('user')`
- `ExternalServiceError(service: 'session')` — UoW commit 後の `sessionService.issue` 失敗。User は active 済みのため、ユーザーは手動 LogIn で復帰可能

---

## ResendVerification

### 概要
確認メールの再送。

### 入力DTO
- `email: string`

### 出力DTO
- なし（成否を区別しない、列挙対策）

### 処理フロー
1. `userRepo.findByEmail(email)`。存在しなければ何もせず終了
2. `user.status === 'pending'` のとき `verificationChallenge.issue(user.id, 'email_verification', ttl: 24h)` で新トークン発行
3. `EmailSender.sendVerification`

### エラーケース
- 内部失敗のみ。外部にはエラーを露出しない

---

## LogIn

### 入力DTO
- `email: string`, `password: string`, `userAgent: string | null`, `ipAddress: string | null`

### 出力DTO
- `userId: UserId`, `sessionToken: string`, `expiresAt: Instant`

### 処理フロー
1. `credentialStore.verifyPassword(email, password)` → `UserId | null`
   - null なら `AuthenticationError('invalid_credentials')` (列挙対策で原因区別なし)
2. `userRepo.findById(userId)` で User 取得
3. `user.status` を確認:
   - `pending` → `AuthenticationError('unverified')`
   - `suspended` / `deleted` → `AuthenticationError('account_unavailable')`
   - `active` → 続行
4. `sessionService.issue(user.id, { userAgent, ipAddress })`

### エラーケース
- `AuthenticationError('invalid_credentials' | 'unverified' | 'account_unavailable')`

---

## LogOut

### 入力DTO
- `sessionToken: string`

### 出力DTO
- なし

### 処理フロー
1. `sessionService.revoke(sessionToken)` (冪等)

### エラーケース
- なし

---

## RevokeAllOtherSessions

### 入力DTO
- `actorUserId: UserId`, `currentSessionToken: string`

### 出力DTO
- `revokedCount: number`

### 処理フロー
1. `sessionService.revokeAllForUser(actorUserId, except: currentSessionToken)`

### エラーケース
- なし

---

## RequestPasswordReset

### 入力DTO
- `email: string`

### 出力DTO
- なし（成否非区別）

### 処理フロー
1. `userRepo.findByEmail(email)`
2. 見つかった場合のみ `verificationChallenge.issue(user.id, 'password_reset', ttl: 1h)` → トークン発行
3. 見つかれば `EmailSender.sendPasswordReset(email, link, locale)`
4. 見つからなくても応答は同じ

### エラーケース
- 内部失敗のみ

---

## ResetPassword

### 入力DTO
- `token: string`, `newPassword: string`

### 出力DTO
- `userId: UserId`, `sessionToken: string`, `expiresAt: Instant`

### 処理フロー
1. RawPassword 値オブジェクト構築 (失敗は `ValidationError('password_weak')`)
2. UoW.run({ verificationChallenge, credentialStore }) で:
   - `verificationChallenge.consume(token, 'password_reset')` → `ChallengeError` は対応する `BusinessRuleError` に翻訳
   - `credentialStore.resetPassword(result.userId, newPassword)` (本人確認は challenge 経由で済んでいる)
     - 失敗時は UoW をロールバックし、トークン consume も巻き戻る
3. UoW commit 後:
   - `sessionService.revokeAllForUser(userId)` で全セッション無効化
   - `sessionService.issue(userId, meta)` で新セッション発行
4. `{ userId, sessionToken, expiresAt }` を返却

### エラーケース
- `BusinessRuleError('token_expired' | 'token_consumed' | 'token_not_found' | 'token_purpose_mismatch')`
- `ValidationError('password_weak')`

---

## ChangePassword

### 入力DTO
- `actorUserId: UserId`, `currentPassword: string`, `newPassword: string`, `revokeOtherSessions: boolean`, `currentSessionToken: string`

### 出力DTO
- なし

### 処理フロー
1. RawPassword 値オブジェクト構築 (`ValidationError('password_weak')`)
2. `credentialStore.changePassword(actorUserId, currentPassword, newPassword)`
   - current 不一致は `AuthenticationError('invalid_credentials')`
3. `revokeOtherSessions === true` なら `sessionService.revokeAllForUser(actorUserId, except: currentSessionToken)`

### エラーケース
- `AuthenticationError('invalid_credentials')`
- `ValidationError('password_weak')`

---

## RequestEmailChange

### 入力DTO
- `actorUserId: UserId`, `newEmail: string`, `currentPassword: string`

### 出力DTO
- なし

### 処理フロー
1. `userRepo.findById(actorUserId)` で User 取得
2. EmailAddress 値オブジェクト構築
3. `credentialStore.verifyPasswordForUser(actorUserId, currentPassword)` → false なら `AuthenticationError('invalid_credentials')`
4. `IdentityService.assertEmailAvailable(newEmail, userRepo)`
5. `verificationChallenge.issue(actorUserId, 'email_change', ttl: 24h, payload: { newEmail })`
6. `EmailSender.sendEmailChangeNotice(newEmail, link, locale)` (新アドレス向け確認リンク)
7. `EmailSender.sendEmailChangeWarning(user.email, newEmail, locale)` (旧アドレス向け即時通知)

### エラーケース
- `BusinessRuleError('email_taken')`
- `AuthenticationError('invalid_credentials')`
- `ValidationError`

---

## VerifyEmailChange

### 入力DTO
- `token: string`

### 出力DTO
- `userId: UserId`

### 処理フロー
1. UoW.run({ userRepo, verificationChallenge }) で:
   - `verificationChallenge.consume(token, 'email_change')` → `{ userId, payload: { newEmail } }`
   - `userRepo.findById(userId)` → User 取得
   - 新 EmailAddress を VO 化
   - `IdentityService.assertEmailAvailable(newEmail, userRepo)` (consume と save の間に他者が奪う可能性があるため再チェック)
   - `user.changeEmail(newEmail, now)` → `userRepo.save(updated)`
     - `email_taken` で失敗した場合は UoW をロールバックし、トークン consume も巻き戻る (再リクエストせず同じトークンでリトライ可能)

### エラーケース
- `BusinessRuleError('token_expired' | 'token_consumed' | 'token_not_found' | 'token_purpose_mismatch')`
- `BusinessRuleError('email_taken')`

---

## UpdateProfile

### 入力DTO
- `actorUserId: UserId`, `displayName?: string`, `bio?: string | null`, `avatarMediaId?: MediaAssetId | null`

### 出力DTO
- `user: UserDTO`

### 処理フロー
1. `userRepo.findById(actorUserId)` → User 取得
2. `avatarMediaId` が指定されている場合、`MediaAssetRepository` から取得して `assertOwnedBy(actorUserId)`、Media の `incrementRef`（旧 avatar は `decrementRef`）
3. 指定されたフィールドに対して `user.changeDisplayName` / `changeBio` / `changeAvatar` を順に適用
4. `userRepo.save(updated)`

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
1. `userRepo.findById(actorUserId)` → User 取得
2. Username VO 構築 (`ValidationError`)
3. `user.changeUsername(newUsername, now)` (30 日制限チェック含む。違反は `BusinessRuleError('username_change_too_soon')`)
4. `IdentityService.assertUsernameAvailable(newUsername, userRepo)`
5. `userRepo.save(updated)`

### エラーケース
- `BusinessRuleError('username_change_too_soon' | 'username_taken')`
- `ValidationError`

---

## DeleteAccount

### 概要
論理削除。User を `deleted` 状態に遷移させ、credential / session / 公開コンテンツを連鎖クリーンアップする。削除済み username/email は永久にロック (再使用不可)。

### 入力DTO
- `actorUserId: UserId`, `confirmation: string`（username と一致するよう要求）

### 出力DTO
- なし

### 処理フロー
1. `userRepo.findById(actorUserId)` → User 取得
2. `confirmation === user.username.value` を検証。違反は `BusinessRuleError('confirmation_mismatch')`
3. `user.role === 'admin'` の場合、`userRepo.countAdmins()` の戻り値で `IdentityService.assertNotLastAdmin(actorUserId, count)`
4. UoW.run({ userRepo, credentialStore, pubRepo, exportRepo }) で:
   - `user.markDeleted(now)` → `userRepo.save(updated)` (既に deleted なら `BusinessRuleError('already_deleted')`)
   - `credentialStore.purgeAll(actorUserId)` で password / linked provider を全削除 (論理削除では FK CASCADE は発火しないため UoW 内で明示的に呼ぶ)
   - PublicationStateRepository で全公開ノートを非公開化
   - 進行中の ExportJob を cancel
   - Outbox `user.deleted` を発火 (payload: { userId, deletedAt })
5. UoW commit 後:
   - `sessionService.revokeAllForUser(actorUserId)` で全セッション無効化 (SessionService は UoW 非参加 — トークン保管は外部にもあり得るため後段で呼ぶ)

### エラーケース
- `BusinessRuleError('already_deleted' | 'confirmation_mismatch' | 'last_admin_protected')`

---

## PromoteUserToAdmin / DemoteAdmin

### 入力DTO
- `actorAdminId: UserId`, `targetUserId: UserId`

### 出力DTO
- なし

### 処理フロー
1. `userRepo.findById(actorAdminId)` で actor の `role === 'admin'` を確認。違反は `AuthorizationError`
2. `userRepo.findById(targetUserId)` で target 取得。不在は `ResourceNotFoundError`
3. promote: `target.promoteToAdmin(now)` → `userRepo.save(updated)`
4. demote: `userRepo.countAdmins()` → `IdentityService.assertNotLastAdmin(targetUserId, count)` → `target.demoteToMember(now)` → `userRepo.save(updated)`

### エラーケース
- `AuthorizationError`
- `ResourceNotFoundError`
- `BusinessRuleError('last_admin_protected')`

---

## SuspendUser / ReinstateUser

### 入力DTO
- `actorAdminId: UserId`, `targetUserId: UserId`

### 出力DTO
- なし

### 処理フロー
1. actor の admin 確認 (違反 `AuthorizationError`)
2. target 取得
3. suspend: `target.suspend(now)` → `userRepo.save(updated)` → `sessionService.revokeAllForUser(targetUserId)`
4. reinstate: `target.reinstate(now)` → `userRepo.save(updated)`

### エラーケース
- `AuthorizationError`
- `BusinessRuleError('user_not_active' | 'user_not_suspended')`
