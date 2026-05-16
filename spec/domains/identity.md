# Identity

ユーザーの identity / profile / authorization を司る基盤ドメイン。サインインに使う認証手段 (パスワード・SSO 等) は **credential** という別概念として `CredentialStore` ポートの裏に分離する。User 集約は「誰か」を表現し、credential は「どう本人と証明するか」を表現する別レイヤー。

セッション・確認トークン (email 確認・パスワード再設定・メアド変更) も plumbing として `SessionService` / `VerificationChallenge` ポートに沈める。これらの永続化方式 (DB 行・JWT・外部サービス等) はアダプタの裁量で、ドメインは意図のみを語る。

## ユビキタス言語

| English | 日本語 | 定義 |
|---|---|---|
| User | ユーザー | このインスタンスに登録されたアカウントの主体。identity / profile / authorization の単位 |
| UserId | ユーザーID | User の一意識別子（UUID v7） |
| Username | ユーザー名 | URL に使う一意な英数ハンドル（例 `/<username>`） |
| EmailAddress | メールアドレス | 連絡用かつ一意な識別子 |
| UserStatus | ユーザーステータス | `pending` / `active` / `suspended` / `deleted` |
| Role | ロール | `member` / `admin`。admin は [Setup Token](../adr/007-admin-setup-token.md) 経由の `AdminSignUp` で登録するか、既存 admin が `PromoteUserToAdmin` で他ユーザーを昇格させて作る。通常の `SignUp` は常に `member` を作る |
| SetupToken | セットアップトークン | 環境変数 `ADMIN_SETUP_TOKEN` で運用者が設定する admin 登録用シークレット。env が設定されている限り何度でも使用可能 |
| Credential | クレデンシャル | サインイン手段の総称。MVP では Password、将来 LinkedProvider (SSO) / Passkey 等を追加可能 |
| RawPassword | 生パスワード | ユーザー入力。検証のみで保存しない |
| PasswordHash | パスワードハッシュ | Argon2id で導出した固定長文字列。`CredentialStore` 内部の値 |
| LinkedProvider | リンク済み外部 ID | OAuth provider の sub と userId の紐付け (将来) |
| SessionToken | セッショントークン | サインイン状態を表す不透明文字列。発行時にクライアントへ返却 |
| VerificationToken | 確認トークン | email 確認・パスワード再設定・メアド変更の単発トークン |
| ChallengePurpose | 確認用途 | `email_verification` / `password_reset` / `email_change` |

## エンティティ

### User (集約ルート)

identity / profile / authorization を表現する。**認証 credential は持たない** — credential の保管・検証は `CredentialStore` ポートの責務。

- フィールド:
  - `id: UserId` (required)
  - `username: Username` (required, unique)
  - `email: EmailAddress` (required, unique)
  - `displayName: string` (required, 1..50。新規作成時に未指定なら `username` で初期化)
  - `bio: string | null` (optional, 0..500)
  - `avatarMediaId: MediaAssetId | null` (optional)
  - `status: UserStatus` (required, default `pending`)
  - `role: Role` (required, default `member`)
  - `createdAt: Instant` (required)
  - `updatedAt: Instant` (required)
  - `lastUsernameChangedAt: Instant | null`
- 振る舞い:
  - `activate(now: Instant): User` — `pending` → `active`。前提: `status === 'pending'`。違反時 `BusinessRuleError('user_not_pending')`
  - `suspend(now: Instant): User` — `active` → `suspended`。違反時 `BusinessRuleError('user_not_active')`
  - `reinstate(now: Instant): User` — `suspended` → `active`。違反時 `BusinessRuleError('user_not_suspended')`
  - `markDeleted(now: Instant): User` — 任意状態 → `deleted`。既に `deleted` なら `BusinessRuleError('already_deleted')`
  - `changeUsername(newUsername: Username, now: Instant): User` — `lastUsernameChangedAt` から 30 日未満なら `BusinessRuleError('username_change_too_soon')`。返り値の User で `lastUsernameChangedAt = now`
  - `changeEmail(newEmail: EmailAddress, now: Instant): User` — `email` を差し替え。注: 旧アドレスへの変更通知 / 新アドレスへの確認メールは usecase 層が `EmailSender` を介して発火する
  - `changeDisplayName(name: string, now: Instant): User` — 空文字は `ValidationError`
  - `changeBio(bio: string | null, now: Instant): User`
  - `changeAvatar(mediaId: MediaAssetId | null, now: Instant): User`
  - `promoteToAdmin(now: Instant): User` / `demoteToMember(now: Instant): User`
- 不変条件:
  - `status === 'deleted'` のとき他フィールドは凍結（操作不可）
  - `role === 'admin'` のユーザーが少なくとも 1 人は存在する（最後の admin の demote/delete は拒否）— 集約外チェックなのでユースケース側で `IdentityService.assertNotLastAdmin` を呼ぶ
  - `status !== 'deleted'` のユーザーは少なくとも 1 つの credential を持つ — 集約外チェックなのでユースケース側で `CredentialPolicyService.assertHasAtLeastOne` を呼ぶ (主に credential 削除系のフローで)
- ライフサイクル: `pending → active → (suspended ↔ active) → deleted`

## 値オブジェクト

### Username
- `value: string`
- ルール: 3..32 字、`[a-z0-9][a-z0-9-]*[a-z0-9]` の小文字限定、予約語（`admin`, `api`, `auth`, `login`, `signup`, `settings`, `share`, `static`, `assets` 等）を禁止
- 等価性: `value` の完全一致

### EmailAddress
- `value: string`
- ルール: RFC 5322 簡易検証、長さ 254 以内、ローカル/ドメインを小文字正規化
- 等価性: 正規化後 `value` の完全一致

### RawPassword
- ルール: 12..128 字、英字 + 数字 + 記号のいずれか 2 種以上を含む
- 等価性なし（値は保持しない、構築時の検証のみ）
- 用途: usecase が `CredentialStore.registerPassword / changePassword / resetPassword` に渡す前の検証ゲート

### PasswordHash
- `value: string` (Argon2id 形式)
- `CredentialStore` 内部で扱う型。ドメインからは生成・検証ロジックを直接触らない (アダプタ実装の責務)

### CredentialSummary
- `kind: 'password' | 'oauth'`
- `providerId?: string` (kind が `oauth` のとき)
- `providerAccountId?: string` (同上)
- `createdAt: Instant`
- 用途: `CredentialStore.listCredentials` の戻り値、`CredentialPolicyService` の判断材料

## ドメインサービス

### IdentityService
- 責務: User 集約のライフサイクル遷移時の横断ルール
- メソッド:
  - `assertNotLastAdmin(targetUserId: UserId, adminCount: number): void` — 違反時 `BusinessRuleError('last_admin_protected')`
    - 注: `adminCount` は `UserRepository.countAdmins()` の値で、`suspended` admin も含む。これにより「最後の admin が `suspended` のみ」のとき他 admin が demote / delete されると、運用上 admin 機能を実行できるユーザーが 0 人になり得る。MVP では admin の self-suspend / admin の suspend ユースケースが存在しない（`SuspendUser` / `ReinstateUser` は対象 user を区別しないが、シナリオ上 admin を suspend することは想定外）ため実害は発生しない。SSO 導入後や admin 自身を suspend する運用導線が追加された際は、`countActiveAdmins` を別途追加するか `SuspendUser` 側で「最後の active admin 保護」を行う前提
  - `assertUsernameAvailable(username: Username, repo: UserRepository): Promise<void>` — 違反時 `BusinessRuleError('username_taken')`
  - `assertEmailAvailable(email: EmailAddress, repo: UserRepository): Promise<void>` — 違反時 `BusinessRuleError('email_taken')`

### CredentialPolicyService
- 責務: credential の最低保持数や不変条件を担保する横断ルール
- メソッド:
  - `assertHasAtLeastOne(userId: UserId, store: CredentialStore): Promise<void>` — 違反時 `BusinessRuleError('no_credential_remaining')`
  - `assertCanRemovePassword(userId: UserId, store: CredentialStore): Promise<void>` — password を除いた credential が 0 なら `BusinessRuleError('cannot_remove_last_credential')`
  - `assertCanUnlinkProvider(userId: UserId, providerId: string, store: CredentialStore): Promise<void>` — 指定 provider を除いた credential が 0 なら同上
- 注: **MVP の usecase からは呼び出されない**。MVP では password 削除 / provider unlink のユースケースが存在しないため、本サービスは現時点で dead code 相当。SSO / Passkey が導入されて「最後の credential を消そうとする操作」が usecase レベルで発生したときに `RemoveProvider` / `RemovePassword` ユースケースから呼ばれる前提。スコープを将来に残す目的で先行定義している

## ポート

### UserRepository
- 目的: User 集約の永続化
- メソッド:
  - `findById(id: UserId): Promise<User | null>`
  - `findByUsername(u: Username): Promise<User | null>`
  - `findByEmail(e: EmailAddress): Promise<User | null>`
  - `save(user: User): Promise<void>` — 新規 / 更新を扱う
  - `countAdmins(): Promise<number>` — `status !== 'deleted'` の admin のみカウント（`suspended` admin もカウント対象に含む）
  - `listAll(opts: { limit: number; cursor?: UserId }): Promise<User[]>` — 管理者用
- 注: find 系は `deleted_at` に関わらず行を返す (集約の `status === 'deleted'` で表現)。呼び出し側が status で弾く責務を持つ。username/email の永久ロック (削除済みでも再使用不可) は `assertUsernameAvailable` / `assertEmailAvailable` が deleted 行も衝突として検出することで担保
- エラーケース:
  - `RepositoryConflictError` — username/email の一意制約違反

### CredentialStore
- 目的: ユーザーの認証手段 (password / SSO 等) の保管・検証を抽象化する。**ドメインは内部実装 (ハッシュアルゴリズム・トークン保管方式) を知らない**
- パスワード credential:
  - `registerPassword(userId: UserId, raw: RawPassword): Promise<void>` — 新規登録 (重複登録は `BusinessRuleError('password_already_set')`)
  - `verifyPassword(email: EmailAddress, raw: string): Promise<UserId | null>` — サインイン入口。一致すれば userId、不一致 / 未登録 / user 不在は null (列挙対策で区別なし)。**`deleted_at IS NOT NULL` のユーザーも null を返す** (列挙対策の徹底と、LogIn ユースケースで status チェックに到達する前に弾く二重防御。正常パスでは `DeleteAccount` の UoW 内で `CredentialStore.purgeAll` が走り `accounts` 行が消えるので自然に null になるが、`purgeAll` 失敗時のフェイルセーフとして `deleted_at` でも弾く)
  - `verifyPasswordForUser(userId: UserId, raw: string): Promise<boolean>` — 再認証用 (RequestEmailChange 等の sensitive 操作の本人確認)。`deleted_at IS NOT NULL` のユーザーは常に false を返す
  - `changePassword(userId: UserId, currentRaw: string, newRaw: RawPassword): Promise<void>` — current 検証含む。違反時 `AuthenticationError('invalid_credentials')`
  - `resetPassword(userId: UserId, newRaw: RawPassword): Promise<void>` — current 検証なし (呼び出し元が VerificationChallenge で本人確認済み)
  - `removePassword(userId: UserId): Promise<void>`
  - `hasPassword(userId: UserId): Promise<boolean>`
- 外部 ID credential (将来 SSO 用、MVP では未実装でもインターフェースは定義):
  - `linkProvider(userId: UserId, providerId: string, providerAccountId: string): Promise<void>`
  - `unlinkProvider(userId: UserId, providerId: string): Promise<void>`
  - `resolveProvider(providerId: string, providerAccountId: string): Promise<UserId | null>`
- 横断:
  - `listCredentials(userId: UserId): Promise<CredentialSummary[]>`
  - `purgeAll(userId: UserId): Promise<void>` — 指定ユーザーの全 credential (password / linked provider) を物理削除する。`DeleteAccount` 専用フック。冪等 (既に存在しなくても成功)。UoW 参加可能で、`User.markDeleted` と同一トランザクション内で呼ぶ
- エラーケース:
  - `AuthenticationError('invalid_credentials')` — changePassword の current 不一致
  - `BusinessRuleError('password_already_set')` — registerPassword 重複
  - `BusinessRuleError('provider_already_linked')` — linkProvider 重複

### SessionService
- 目的: サインインセッションの発行・解決・無効化を抽象化する。Session 自体は集約ではなく plumbing
- メソッド:
  - `issue(userId: UserId, meta: { userAgent: string | null; ipAddress: string | null }): Promise<{ token: string; expiresAt: Instant }>`
  - `resolve(token: string): Promise<{ userId: UserId; expiresAt: Instant } | null>` — 期限切れ・revoke 済みは null
  - `revoke(token: string): Promise<void>` — 冪等
  - `revokeAllForUser(userId: UserId, except?: string): Promise<number>` — `except` は除外するトークン (現セッション保護用)。戻り値は revoke した件数
- 注: トークン形式 (不透明 ID / JWT / etc) や保管先はアダプタ実装の裁量。ドメインは「token は不透明文字列」とだけ知る

### VerificationChallenge
- 目的: 単発トークン (email 確認・パスワード再設定・メアド変更) の発行と消費を抽象化する。3 種のトークンを `purpose` で識別する 1 ポートに統合
- メソッド:
  - `issue(userId: UserId, purpose: ChallengePurpose, ttl: Duration, payload?: Record<string, string>): Promise<{ plainToken: string }>` — `payload` は purpose 固有のメタ (例: `email_change` 時の `newEmail`)。**同一 `(userId, purpose)` の未消費トークンが既に存在する場合、アダプタはそれらを無効化 (削除 or 期限切れ扱い) してから新トークンを発行する**。これは `ResendVerification` / `RequestPasswordReset` / `RequestEmailChange` の再実行で旧リンクが残り続けないようにするため
  - `consume(token: string, expectedPurpose: ChallengePurpose): Promise<{ userId: UserId; payload: Record<string, string> } | ChallengeError>` — 期限切れ・consume 済み・purpose 不一致はそれぞれ違う `ChallengeError` を返す
- `ChallengeError`: `'not_found' | 'expired' | 'consumed' | 'purpose_mismatch'`
- 注: トークン形式・保管先・consume の実装 (削除 vs フラグ) はアダプタ裁量
- 注 (`issue` での無効化後の旧トークン consume 戻り値): アダプタが「無効化＝行削除」で実装した場合は旧トークンの consume は `not_found` を返し、「無効化＝`consumed_at` フラグ立て」で実装した場合は `consumed` を返す。**呼び出し側はこの 2 つを区別しない設計** とする (テストケースも `'not_found' or 'consumed'` のどちらでも合格と書く)。発行側の責務は「旧トークンが以後使えない」ことの担保であり、戻り値ばらつきは契約として許容する
- 注: 本ポートは `UnitOfWorkContext.verificationChallenge` 経由で UoW に参加可能。`consume` の後段で User mutation が失敗した場合にトークン消費を巻き戻すため、`VerifyEmail` / `ResetPassword` / `VerifyEmailChange` ユースケースは consume を UoW.run の内側で実行する。`issue` も同様に UoW 参加可能 (`SignUp` で User 作成と確認トークン発行を同一トランザクション内で行う)

### EmailSender
- 目的: 認証フロー関連のメール送信
- メソッド:
  - `sendVerification(to: EmailAddress, link: URL, locale: string): Promise<void>`
  - `sendPasswordReset(to: EmailAddress, link: URL, locale: string): Promise<void>`
  - `sendEmailChangeNotice(to: EmailAddress, link: URL, locale: string): Promise<void>` — 新アドレス向け
  - `sendEmailChangeWarning(oldEmail: EmailAddress, newEmail: EmailAddress, locale: string): Promise<void>` — 旧アドレス向け通知
- エラーケース: `EmailSendError`

### SetupTokenVerifier
- 目的: 環境変数 `ADMIN_SETUP_TOKEN` に設定された Setup Token と照合し、`AdminSignUp` の認可ゲートに使う。**ドメインは保管先（env / Secrets Manager 等）を知らない**
- メソッド:
  - `isEnabled(): boolean` — env が設定されているかを返す（未設定なら `/setup` を 404 にする判断材料）
  - `verify(rawToken: string): boolean` — 定数時間比較で一致判定。env 未設定時は常に false
- 注: 実装は Cloudflare Workers の Secret binding を読み出すアダプタ。値はメモリ常駐でよく、永続化不要
- エラーケース: なし（boolean 返却のみ）

### OAuthProtocol (将来、SSO 導入時に追加)
- 目的: OAuth 認可フローのプロトコル動作を抽象化
- メソッド:
  - `beginAuthorization(providerId: string, returnUri: URL): { redirectUrl: URL; state: string }`
  - `completeAuthorization(providerId: string, callbackParams: Record<string, string>): Promise<{ providerAccountId: string; email: EmailAddress; displayName?: string; emailVerified: boolean }>`
- 注: MVP では未実装。SSO 導入時に追加し、`CredentialStore.linkProvider` / `resolveProvider` と組み合わせる
- 注 (`emailVerified` フィールド): provider によって挙動が異なる:
  - Google: ID トークンに `email_verified` を含むのでそのまま転写可能
  - GitHub: 通常の OAuth レスポンスには含まれず、`GET /user/emails` の別 API 取得が必要
  - その他: provider 側が verified flag を返さない場合は false 固定にする (アダプタ実装裁量)
  - SSO 導入時にこのフラグで判定: `true` ならユーザーを自動 `active` 化、`false` なら `pending` 状態で起こして確認メールを送る (既存の `VerificationChallenge('email_verification')` フローに合流)

## ユースケース（概要）

- SignUp（常に `role=member`） / AdminSignUp（Setup Token 経由、`role=admin`） / VerifyEmail / ResendVerification
- LogIn / LogOut / RevokeSession / RevokeAllOtherSessions
- RequestPasswordReset / ResetPassword
- ChangePassword / RequestEmailChange / VerifyEmailChange
- UpdateProfile / ChangeUsername / DeleteAccount
- PromoteUserToAdmin / DemoteAdmin / SuspendUser / ReinstateUser（admin 用）
- (将来) SignInWithProvider / SignUpWithProvider / LinkProvider / UnlinkProvider
