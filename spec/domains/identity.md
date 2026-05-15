# Identity

ユーザーの認証・セッション・登録/復旧フローを司る。他ドメインから ID 参照される基盤ドメイン。

## ユビキタス言語

| English | 日本語 | 定義 |
|---|---|---|
| User | ユーザー | このインスタンスに登録されたアカウントの主体 |
| UserId | ユーザーID | User の一意識別子（UUID v7） |
| Username | ユーザー名 | URL に使う一意な英数ハンドル（例 `/<username>`） |
| EmailAddress | メールアドレス | ログイン識別子。一意 |
| PasswordHash | パスワードハッシュ | Argon2id で導出した固定長文字列 |
| Session | セッション | 1 つのログイン状態を表すトークン付き値 |
| EmailVerificationToken | メール確認トークン | サインアップ・メアド変更の確認用トークン |
| PasswordResetToken | パスワード再設定トークン | パスワード再設定の確認用トークン |
| UserStatus | ユーザーステータス | `pending` / `active` / `suspended` / `deleted` |
| Role | ロール | `member` / `admin`（最初に登録したユーザーが admin、以降は admin が昇格可能） |

## エンティティ

### User

- フィールド:
  - `id: UserId` (required)
  - `username: Username` (required, unique)
  - `email: EmailAddress` (required, unique)
  - `displayName: string | null` (optional, 0..50)
  - `bio: string | null` (optional, 0..500)
  - `avatarMediaId: MediaAssetId | null` (optional)
  - `passwordHash: PasswordHash` (required)
  - `status: UserStatus` (required, default `pending`)
  - `role: Role` (required, default `member`)
  - `createdAt: Instant` (required)
  - `updatedAt: Instant` (required)
  - `lastUsernameChangedAt: Instant | null`
- 振る舞い:
  - `activate(now: Instant): User` — `pending` → `active`。前提: `status === 'pending'`。違反時 `BusinessRuleError('user_not_pending')`
  - `suspend(now: Instant): User` — `active` → `suspended`。違反時 `BusinessRuleError('user_not_active')`
  - `reinstate(now: Instant): User` — `suspended` → `active`
  - `markDeleted(now: Instant): User` — 任意状態 → `deleted`。`active` でない場合も可（ただし `deleted` への再遷移は不可）
  - `changeUsername(newUsername: Username, now: Instant): User` — `lastUsernameChangedAt` から 30 日未満なら `BusinessRuleError('username_change_too_soon')`
  - `changeEmail(newEmail: EmailAddress, now: Instant): User` — `email` を差し替え。注: 旧アドレスへの変更通知 / 新アドレスへの確認メールは usecase 層が `EmailSender` を介して発火する責任を負う
  - `changeDisplayName(name: string | null, now: Instant): User`
  - `changeBio(bio: string | null, now: Instant): User`
  - `changeAvatar(mediaId: MediaAssetId | null, now: Instant): User`
  - `rotatePasswordHash(newHash: PasswordHash, now: Instant): User`
  - `promoteToAdmin(now: Instant): User` / `demoteToMember(now: Instant): User`
- 不変条件:
  - `status === 'deleted'` のとき他フィールドは凍結（操作不可）
  - `role === 'admin'` のユーザーが少なくとも 1 人は存在する（最後の admin の demote/delete は拒否）— 集約外チェックなのでユースケース側で `lastAdminCheck` を行う
- ライフサイクル: `pending → active → (suspended ↔ active) → deleted`

### Session

- フィールド:
  - `id: SessionId` (required, UUID v7)
  - `userId: UserId` (required)
  - `tokenHash: string` (required) — トークン平文は発行時のみ返却し、保存はハッシュ
  - `userAgent: string | null`
  - `ipAddress: string | null`
  - `createdAt: Instant`
  - `expiresAt: Instant` (required) — 既定 30 日
  - `revokedAt: Instant | null`
- 注: MVP では `expiresAt` 固定（延長なし）。長期ログイン / remember-me は将来拡張
- 振る舞い:
  - `revoke(now: Instant): Session` — `revokedAt` を設定。再 revoke は no-op
  - `isActive(now: Instant): boolean` — `revokedAt === null && expiresAt > now`
  - `touch(now: Instant): Session` — 最終利用日時を更新（任意。実装裁量）
- 不変条件: `expiresAt > createdAt`

### EmailVerificationToken

- フィールド:
  - `id: TokenId`
  - `userId: UserId`
  - `purpose: 'signup' | 'email_change'`
  - `targetEmail: EmailAddress` — `email_change` 時の新メアド、`signup` 時は登録メアド
  - `tokenHash: string`
  - `createdAt: Instant`
  - `expiresAt: Instant` — 既定 24 時間
  - `consumedAt: Instant | null`
- 振る舞い:
  - `consume(now: Instant): EmailVerificationToken` — 既に消費済み or 期限切れなら `BusinessRuleError`
  - `isValid(now: Instant): boolean`

### PasswordResetToken

- フィールド: `id`, `userId`, `tokenHash`, `createdAt`, `expiresAt`（既定 1 時間）, `consumedAt`
- 振る舞い: `consume(now)`, `isValid(now)`（条件は EmailVerificationToken と同様）

## 値オブジェクト

### Username
- `value: string`
- ルール: 3..32 字、`[a-z0-9][a-z0-9-]*[a-z0-9]` の小文字限定、予約語（`admin`, `api`, `auth`, `login`, `signup`, `settings`, `share`, `static`, `assets` 等）を禁止
- 等価性: `value` の完全一致

### EmailAddress
- `value: string`
- ルール: RFC 5322 簡易検証、長さ 254 以内、ローカル/ドメインを小文字正規化
- 等価性: 正規化後 `value` の完全一致

### PasswordHash
- `value: string` (Argon2id 形式)
- 生成は `PasswordHasher` ポート経由
- 等価性: `value` の完全一致（比較は `verify` で行う）

### RawPassword（値オブジェクトとしてはエンティティ外で利用、保存しない）
- ルール: 12..128 字、英字 + 数字 + 記号のいずれか 2 種以上を含む
- 等価性なし（値は保持しない、検証のみ）

## ドメインサービス

### IdentityService
- 責務: User 集約のライフサイクル遷移時の横断ルール（最後の admin 制約等）を担保
- メソッド:
  - `assertNotLastAdmin(targetUserId: UserId, allAdminCount: number): void` — 違反時 `BusinessRuleError('last_admin_protected')`
  - `assertUsernameAvailable(username: Username, repo: UserRepository): Promise<void>` — 違反時 `BusinessRuleError('username_taken')`
  - `assertEmailAvailable(email: EmailAddress, repo: UserRepository): Promise<void>` — 違反時 `BusinessRuleError('email_taken')`

## ポート

### UserRepository
- 目的: User の永続化
- メソッド:
  - `findById(id: UserId): Promise<User | null>`
  - `findByUsername(u: Username): Promise<User | null>`
  - `findByEmail(e: EmailAddress): Promise<User | null>`
  - `save(user: User): Promise<void>` — 新規 / 更新を扱う
  - `countAdmins(): Promise<number>`
  - `listAll(opts: { limit: number; cursor?: UserId }): Promise<User[]>` — 管理者用
- エラーケース:
  - `RepositoryConflictError` — username/email の一意制約違反

### SessionRepository
- メソッド:
  - `findById(id: SessionId): Promise<Session | null>`
  - `findByTokenHash(hash: string): Promise<Session | null>`
  - `save(s: Session): Promise<void>`
  - `revokeAllForUser(userId: UserId, now: Instant): Promise<void>`
- エラーケース: なし（重複保存は no-op）

### EmailVerificationTokenRepository / PasswordResetTokenRepository
- `findByTokenHash(hash): Promise<Token | null>`
- `save(t): Promise<void>`
- `deleteExpired(now): Promise<number>`

### PasswordHasher（ポート）
- メソッド:
  - `hash(raw: RawPassword): Promise<PasswordHash>`
  - `verify(hash: PasswordHash, raw: string): Promise<boolean>`
- エラーケース: `HasherError` — 内部ライブラリ失敗

### TokenGenerator（ポート）
- メソッド:
  - `generate(byteLength: number): { plain: string; hash: string }`
  - `hash(plain: string): string`

### EmailSender（ポート）
- メソッド:
  - `sendVerification(to: EmailAddress, link: URL, locale: string): Promise<void>`
  - `sendPasswordReset(to: EmailAddress, link: URL, locale: string): Promise<void>`
  - `sendEmailChangeNotice(to: EmailAddress, link: URL, locale: string): Promise<void>` — 新アドレス向け
  - `sendEmailChangeWarning(oldEmail: EmailAddress, newEmail: EmailAddress, locale: string): Promise<void>` — 旧アドレス向け通知
- エラーケース: `EmailSendError`

## ユースケース（概要）

- SignUp / VerifyEmail / ResendVerification
- LogIn / LogOut / RevokeSession / RevokeAllOtherSessions
- RequestPasswordReset / ResetPassword
- ChangePassword / RequestEmailChange / VerifyEmailChange
- UpdateProfile / ChangeUsername / DeleteAccount
- PromoteUserToAdmin / DemoteAdmin / SuspendUser / ReinstateUser（admin 用）
