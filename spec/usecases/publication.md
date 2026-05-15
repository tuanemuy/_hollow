# Publication ユースケース

## ChangePublicationVisibility

### 入力DTO
- `actorUserId: UserId`, `noteId: NoteId`, `nextVisibility: 'private' | 'unlisted' | 'public'`

### 出力DTO
- `state: PublicationStateDTO`

### 処理フロー
1. Note 取得、所有者確認、`status === 'active'`
2. PublicationState 取得（無ければ default private で作成）
3. `public` 化のときは `assertCanPublish`（メディア所有チェックには `Note.mediaRefs` を MediaRepository で照合）
4. UoW: `PublicationService.changeVisibilityAndCascade`
5. Outbox `note.publish_changed` を usecase が発火
6. （副作用: `unlisted/public → private` で ShareLink は revoke 済み）

### エラーケース
- `BusinessRuleError('media_not_owned' | 'note_trashed')`
- `AuthorizationError`

---

## BulkChangePublicationVisibility

### 入力DTO
- `actorUserId: UserId`, `noteIds: NoteId[]`, `nextVisibility: ...`

### 出力DTO
- `successCount: number`, `failures: { noteId; reason }[]`

### 処理フロー
- 各 NoteId で ChangePublicationVisibility を実行、失敗は集計

---

## IssueShareLink

### 入力DTO
- `actorUserId: UserId`, `noteId: NoteId`, `password: string | null`

### 出力DTO
- `shareLinkId: ShareLinkId`, `urlToken: string`（平文、表示用）

### 処理フロー
1. Note 取得、所有者確認、`status === 'active'`
2. PublicationState を取得、`visibility !== 'private'` を要請（`private` は ShareLink 発行不可）
3. `PublicationService.assertLinkQuota`
4. `TokenGenerator.generate(32)` で平文+ハッシュ
5. password があれば PasswordHasher.hash
6. UoW: ShareLink 作成 → save、戻り値の平文トークンは返却のみ

### エラーケース
- `BusinessRuleError('share_link_quota_exceeded' | 'visibility_private')`
- `ValidationError('password_weak')`

---

## RevokeShareLink

### 入力DTO
- `actorUserId: UserId`, `shareLinkId: ShareLinkId`

### 出力DTO
- なし

### 処理フロー
1. ShareLink 取得、所有者確認
2. `link.revoke(now)` → save（既に revoked は no-op）

### エラーケース
- `AuthorizationError`

---

## SetShareLinkPassword

### 入力DTO
- `actorUserId: UserId`, `shareLinkId: ShareLinkId`, `newPassword: string | null`

### 出力DTO
- なし

### 処理フロー
1. ShareLink 取得、所有者確認、`status === 'active'`
2. newPassword があれば PasswordHasher.hash、なければ null
3. `link.setPassword(hash, now)` → save

### エラーケース
- `ValidationError('password_weak')`
- `BusinessRuleError('share_link_revoked')`

---

## ListShareLinks

### 入力DTO
- `actorUserId: UserId`, `noteId: NoteId`

### 出力DTO
- `links: ShareLinkDTO[]`

### 処理フロー
- Note 所有者確認 → `ShareLinkRepository.findByNoteId`

---

## ResolveShareLink（公開閲覧側）

### 入力DTO
- `token: string`, `password: string | null`, `viewerIpHash: string | null`

### 出力DTO
- `noteId: NoteId`, `ownerUsername: string`

### 処理フロー
1. token を hash 化、`ShareLinkRepository.findByTokenHash`
2. `link.isOpen(now)` 確認、`status === 'revoked'` は `BusinessRuleError('share_link_revoked')`
3. lockedUntil > now なら `BusinessRuleError('share_link_locked')`
4. `PublicationService.verifyShareLinkAccess(link, password, hasher, now)`
   - 失敗時 `link.recordFailedAttempt(now, MAX_ATTEMPTS=5, LOCK_DUR=300)` → save、`BusinessRuleError('share_link_password_invalid')`
   - 成功時 `link.resetFailedAttempts(now)` → `link.recordAccess(now)` → save
5. Note を取得して返却

### エラーケース
- `ResourceNotFoundError('share_link')`
- `BusinessRuleError('share_link_revoked' | 'share_link_locked' | 'share_link_password_invalid')`

---

## HandleNoteTrashedEvent / HandleNotePurgedEvent / HandleUserDeletedEvent（イベントハンドラ）

### 概要
他ドメインのイベントを受けて PublicationState を非公開化、ShareLink を一括失効。

### 処理フロー
- `note.deleted` を受信: 対応する PublicationState を private へ、`PublicationService.revokeAllLinks`
- `note.purged` を受信: PublicationState と ShareLink を物理削除
- `user.deleted` を受信: 対象ユーザーの PublicationState を一括 private 化、ShareLink を revoke

### エラーケース
- 個別失敗はリトライ（at-least-once、冪等）
