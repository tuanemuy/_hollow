# Publication

ノートの公開ステータスと限定公開リンクを管理する。Note を ID で参照。

## ユビキタス言語

| English | 日本語 | 定義 |
|---|---|---|
| PublicationVisibility | 公開可視性 | `private` / `unlisted` / `public` |
| PublicationState | 公開状態 | 1 ノートにつき 1 つの可視性記録（集約ルート） |
| ShareLink | 共有リンク | 限定公開ノートの閲覧用トークン |
| ShareLinkPassword | リンクパスワード | 任意のリンクパスワード（ハッシュ保存） |
| ShareLinkStatus | リンクステータス | `active` / `revoked` |

## エンティティ

### PublicationState（集約ルート）

- フィールド:
  - `noteId: NoteId` — 集約 ID も兼ねる
  - `ownerId: UserId`
  - `visibility: PublicationVisibility`（default `private`）
  - `publishedAt: Instant | null` — `public` への遷移時刻
  - `updatedAt: Instant`
- 振る舞い:
  - `changeVisibility(next: PublicationVisibility, now: Instant): PublicationState`
    - `private → unlisted` / `private → public`: ok。`public` 化時は `publishedAt = now`
    - `public → private`: `publishedAt = null`
    - `unlisted → private`: state 自体は遷移するだけ。ShareLink の一括失効は `PublicationService.changeVisibilityAndCascade` が連動責任を持つ
  - `assertCanPublish(note: Note, ownedMediaIds: Set<MediaAssetId>): void` — 本文中のメディアがすべて自分のものか確認、違反は `BusinessRuleError('media_not_owned')`
- 不変条件:
  - `visibility === 'private'` のとき `publishedAt === null`

### ShareLink

- フィールド:
  - `id: ShareLinkId`
  - `noteId: NoteId`
  - `ownerId: UserId`
  - `tokenHash: string`
  - `passwordHash: PasswordHash | null` — 任意
  - `status: ShareLinkStatus`（default `active`）
  - `createdAt: Instant`
  - `revokedAt: Instant | null`
  - `lastAccessedAt: Instant | null`
  - `failedAttempts: number` — 連続パスワード失敗カウンタ
  - `lockedUntil: Instant | null` — 失敗多発時の一時ロック
- 振る舞い:
  - `revoke(now: Instant): ShareLink`
  - `setPassword(hash: PasswordHash | null, now: Instant): ShareLink`
  - `recordAccess(now: Instant): ShareLink` — `lastAccessedAt` 更新
  - `recordFailedAttempt(now: Instant, maxAttempts: number, lockDurationSec: number): ShareLink` — `failedAttempts++`、超過時 `lockedUntil` 設定
  - `resetFailedAttempts(now: Instant): ShareLink` — 認証成功時に呼ぶ
  - `isOpen(now: Instant): boolean` — `status === 'active' && (lockedUntil === null || lockedUntil <= now)`
- 不変条件:
  - `status === 'revoked'` のとき以降の変更は不可（再有効化なし）
  - `failedAttempts >= 0`

## 値オブジェクト

### PublicationVisibility（列挙）
- `'private' | 'unlisted' | 'public'`

### ShareLinkPassword（プレーン）
- 等価性なし、ハッシュ化のみ。RawPassword と同じ強度要件で 8..128 字

## ドメインサービス

### PublicationService
- 責務: 可視性変更時の波及（リンク失効、検索インデックス連携イベント）と発行制限
- メソッド:
  - `changeVisibilityAndCascade(state: PublicationState, next: PublicationVisibility, now: Instant, repos: { pubRepo: PublicationStateRepository; linkRepo: ShareLinkRepository }): Promise<PublicationState>` — `state.changeVisibility` を呼び、必要に応じて該当ノートの全 ShareLink を `revoke` する。`note.publish_changed` イベントは呼び出し元 usecase が UoW 経由で発火する責任を負う（このサービスは発火しない）
  - `revokeAllLinks(noteId: NoteId, now: Instant, repo: ShareLinkRepository): Promise<void>`
  - `assertLinkQuota(noteId: NoteId, max: number, repo: ShareLinkRepository): Promise<void>` — 既定 10 リンク。違反は `BusinessRuleError('share_link_quota_exceeded')`
  - `verifyShareLinkAccess(link: ShareLink, password: string | null, hasher: PasswordHasher, now: Instant): Promise<{ ok: boolean; updatedLink: ShareLink }>`

## ポート

### PublicationStateRepository
- `findByNoteId(noteId: NoteId): Promise<PublicationState | null>`
- `save(state: PublicationState): Promise<void>`
- `findPublicByOwner(ownerId: UserId, opts: ListOpts): Promise<NoteId[]>`
- `findAllPublic(opts: ListOpts): Promise<{ ownerId: UserId; noteId: NoteId }[]>`

### ShareLinkRepository
- `findById(id: ShareLinkId): Promise<ShareLink | null>`
- `findByTokenHash(hash: string): Promise<ShareLink | null>`
- `findByNoteId(noteId: NoteId): Promise<ShareLink[]>`
- `save(link: ShareLink): Promise<void>`
- `countByNoteId(noteId: NoteId, includeRevoked: boolean): Promise<number>`

## ユースケース（概要）

- ChangePublicationVisibility / BulkChangePublicationVisibility
- IssueShareLink / RevokeShareLink / SetShareLinkPassword / ListShareLinks
- ResolveShareLink（公開閲覧側で利用）
