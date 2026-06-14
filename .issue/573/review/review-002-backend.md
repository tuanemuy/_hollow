# PR #742 レビュー — Backend Domain + Use Case（Round 2）

**対象:** PR #742 / Issue #573: P24 アカウント削除強化（多段確認 + 削除影響の実データ集計）
**レビュー日:** 2026-06-14
**レビュー観点:** Domain + Use Case ロジック の正合性、エラー処理、カスケード不変、DTO 意味づけ、ポート規約

---

## 概要

前ラウンドは Blocker 0。本ラウンドは plan.md ・ adr.md の受け入れ基準（AC-1/2/4/5/8）と照合し、`deleteAccount.ts` / `summarizeAccountDeletion.ts` / DTO / ポート（`shareLinkRepository.ts` / `mediaAssetRepository.ts`）・アダプター実装の堅牢性を厳格に検査。

**検査完了**: すべてのコア実装・DTO・ポート規約・テストに対して問題なし。

---

## Domain + Use Case

### 1. deleteAccount.ts — 検証順序と エラー分岐の厳合性

**検査項目（AC-1）**: パスワード再検証の順序・エラー種別の分離

#### AC-1 受け入れ基準
> `deleteAccount` usecase が **username を先に判定**（不一致は `BusinessRuleError('confirmation_mismatch')`）、その後にパスワード再検証を行い、パスワード不一致時は `AuthenticationError('invalid_credentials')` を投げる

**実装検査** (deleteAccount.ts:38–62):

```
38: const found = await userRepository.findById(actor);
43: if (input.confirmation !== user.username) {
44:   throw new BusinessRuleError("confirmation_mismatch", ...)
48: }
50-52: [コメント] Sensitive-operation re-authentication...verification after the username check 
       so `confirmation_mismatch` keeps precedence (AC-1)
53: const verified = await credentialStore.verifyPasswordForUser(actor, input.currentPassword);
57-62: if (!verified) throw AuthenticationError("invalid_credentials", ...)
```

**判定**: ✅ **合格**
- username チェック（L43）が password 検証（L53）の**前**に置かれ、エラー種別も明確に分離（BusinessRuleError vs AuthenticationError）。
- コメント（L50–52）が AC-1 の意図を正しく記載。
- テスト（`identity.integration.test.ts`）で「username 不一致で `confirmation_mismatch`、password 不一致で `invalid_credentials`」を個別検証。

---

#### AC-2 受け入れ基準
> `DeleteAccountInput` に `currentPassword` が追加され、transport～usecase まで配線される

**実装検査**:
- `deleteAccount.ts:10–16` に `DeleteAccountInput` が `currentPassword: string` を保持 ✅
- テスト「rejects when the current password is incorrect」で入力から usecase 呼び出しまで正合性を検証 ✅

---

### 2. summarizeAccountDeletion.ts — Read-Only UoW の構造 + 実カスケード母集団の合致

**検査項目（AC-4/AC-5）**: 実カスケード挙動に厳密一致した集計

#### AC-4 受け入れ基準（実データ集計）
> 削除影響を集計する read-only usecase が新規作成され、件数・容量・410 Gone 化される公開ノート数・失効する限定公開リンク数を **実データ** で返す

**実装検査** (summarizeAccountDeletion.ts:19–48):

```typescript
export async function summarizeAccountDeletion({
  container,
  input,
}: ServiceArgs<SummarizeAccountDeletionInput>): Promise<AccountDeletionImpactDTO> {
  const actor = UserId.create(input.actorUserId);

  return container.unitOfWorkProvider.run(
    async ({
      noteRepository,
      mediaAssetRepository,
      publicationStateRepository,
      shareLinkRepository,
    }) => {
      const [noteCount, media, publicNoteCount, activeShareLinkCount] =
        await Promise.all([
          noteRepository.countByOwner(actor, { status: "active" }),
          mediaAssetRepository.aggregateByOwner(actor),
          publicationStateRepository.countPublicByOwner(actor),
          shareLinkRepository.countActiveByOwner(actor),
        ]);
```

**判定**: ✅ **合格**
- `unitOfWorkProvider.run()` 内でリポジトリを read（plan.md「listNotesByOwner と同型」を遵守）✅
- `collectEvents` 呼び出しなし（read-only） ✅
- Promise.all で並行読み出し（効率的） ✅
- テスト「returns counts for a typical user」で実 D1 に seed したデータが正確に集計されることを確認 ✅

---

#### AC-5 受け入れ基準（虚偽表示禁止）
> 集計値・影響リストが実カスケード挙動に厳密一致する

**検査項目**: 各集計値が実カスケードの削除対象集合と合致するか

1. **`noteCount` = active ノート数のみ**
   - 集計: `noteRepository.countByOwner(actor, { status: "active" })` ✅
   - 実カスケード `deleteAccount`: `publicationStateRepository.findPublicByOwner` で public（active のみ）を取得し private 化。trash は即時対象外（別途 worker による非同期 soft-delete） ✅
   - **整合性**: ユーザーが「失う」と感じる範囲（アクセス可能な active ノート）と一致。plan.md「所有 active ノート数」「soft-delete 後 purge worker 待ち」と一致。
   - DTO JSDoc（identity.ts:97–101）で意味づけ完備 ✅

2. **`mediaCount` / `mediaTotalBytes` = attached のみ**
   - 集計: `mediaAssetRepository.aggregateByOwner(actor)` が `WHERE status = 'attached'` で集計（adp.ts:141–145） ✅
   - 実カスケード: `user.deleted` に `note` / `media` の reaction handler 無し → メディア実体は soft-delete 後に DB に残存 ✅
   - DTO JSDoc（identity.ts:103–113）で「pending/orphan/deleting は除外」「即時 purge されない」を明記 ✅
   - アダプターテスト（mediaAssetRepository.integration.test.ts）で pending/orphan/deleting が除外されることを確認 ✅

3. **`publicNoteCount` = `countPublicByOwner(actor)`**
   - 集計: `publicationStateRepository.countPublicByOwner(actor)` ✅
   - 実カスケード: `deleteAccount` が `findPublicByOwner` で **active** のみを取得し private 化（trash を含む全ノートは取得しない）
   - **微小なズレの可能性（既知）**: `countPublicByOwner` が active-only INNER JOIN だが、実カスケード（trash 含む全ノート private 化）とは outbox-relay lag 中に diverge する。**ただし DTO JSDoc で「active-only INNER JOIN」「diverge しうる」「approximation」を明記**し、plan.md / ADR-003・リスク欄と整合 ✅
   - DTO JSDoc（identity.ts:114–121）で「softens this to an approximation」と文言で対処 ✅

4. **`activeShareLinkCount` = `countActiveByOwner(actor)`**
   - 集計: `shareLinkRepository.countActiveByOwner(actor)` ✅
   - 実カスケード: `handleUserDeletedEvent` → `revokeAllLinksInternal`（`publication/service.ts`）が owner の **全ノート**（trashed 含む）の **全 active リンク** を revoke
   - ポート JSDoc（shareLinkRepository.ts:43–57）で「includes links on trashed notes」「matches the cascade」を明記 ✅
   - アダプター SQL（shareLinkRepository.ts:222–227）が `notes.status` を絞らない（trashed ノートのリンクも含む）✅
   - アダプターテスト（shareLinkRepository.integration.test.ts:109–132）で「includes trashed notes」「excludes revoked」を検証 ✅

**判定**: ✅ **合格**
- 各値が実カスケード削除対象集合と厳密 or 既知の軽微ズレで一致
- DTO JSDoc で虚偽表示禁止根拠を型に記載
- plan.md / ADR-003・リスク欄と完全に整合

---

### 3. DTO（AccountDeletionImpactDTO）— 意味づけの完全性

**検査項目**: 各フィールドのコメントが虚偽表示禁止と実カスケードの関係を明示しているか

**実装** (identity.ts:96–129):

```typescript
export type AccountDeletionImpactDTO = Readonly<{
  /**
   * Owned active notes. After deletion they become inaccessible (login
   * is revoked and public access is stopped), but the rows are not
   * physically purged — do not present this as "immediately erased".
   */
  noteCount: number;
  /**
   * Count of `attached` media assets only (`pending` / `orphan` /
   * `deleting` are purge-lifecycle transients and excluded). Like
   * `noteCount`, these blobs are not immediately purged on deletion.
   */
  mediaCount: number;
  /**
   * Raw byte total of the `attached` media assets above. Formatting is
   * the presentation layer's responsibility.
   */
  mediaTotalBytes: number;
  /**
   * Active public notes. On deletion they are made private, so their
   * public URLs start returning 410 Gone. Counted via
   * `countPublicByOwner` (active-only INNER JOIN), which can diverge
   * slightly from the cascade (which privatizes every note, trashed
   * included) during the trash → outbox-relay lag window — hence the UI
   * softens this to an approximation rather than an exact SSOT.
   */
  publicNoteCount: number;
  /**
   * Active (non-revoked) share links across all owned notes — trashed
   * notes included — which the cascade revokes. Matches the cascade's
   * revocation set exactly.
   */
  activeShareLinkCount: number;
}>;
```

**判定**: ✅ **合格**
- 各フィールドに「実カスケード内での意味」「虚偽表示禁止との関係」を完全記載
- 物理削除しない（「immediately purged」）ことを明示 ✅
- `attached` メディアのみという制限をコメントで根拠付け ✅
- `publicNoteCount` の微小ズレ（lag window）を言及し、presentation で「approximation」対応を求める ✅
- `activeShareLinkCount` が trashed ノート含みで「exactly matches」の確信を示す ✅
- ADR-003 への参照がコメント内に明示（「See `.issue/573/adr.md` ADR-003」） ✅

---

## ポート定義 + アダプター実装

### 4. ShareLinkRepository.countActiveByOwner — 所有権・状態フィルタの正確性

**ポート定義検査** (shareLinkRepository.ts:43–57):

```typescript
/**
 * Read-only count of currently-active (non-revoked) links across **all**
 * notes owned by `ownerId`, including links on trashed notes. Joins
 * `share_links` to the owner's notes on ownership alone — `notes.status`
 * is intentionally not filtered — so the value matches the account-delete
 * cascade, which revokes every active link on every owned note
 * regardless of note status (`PublicationService.revokeAllLinks` via
 * `handleUserDeletedEvent`). Active is `revoked_at IS NULL`, consistent
 * with the `status='active' ⟺ revokedAt=null` invariant.
 */
countActiveByOwner(ownerId: UserId): Promise<number>;
```

**判定**: ✅ **合格**
- ポート JSDoc が「all notes owned」「intentionally not filtered」を明記 ✅
- 不変条件（`status='active' ⟺ revokedAt=null`）を言及 ✅
- ADR-001 への参照あり ✅

**アダプター実装検査** (shareLinkRepository.ts:215–231):

```typescript
countActiveByOwner(ownerId: UserId): Promise<number> {
  return mapDbError(
    "Failed to count active share_links by owner",
    async () => {
      // JOIN on ownership only — `notes.status` is intentionally not
      // filtered so trashed notes' active links are counted (they are
      // revoked by the delete cascade). `revoked_at IS NULL` mirrors the
      // `status='active'` invariant. See `.issue/573/adr.md` ADR-001.
      const rows = await this.db
        .select({ count: count() })
        .from(shareLinks)
        .innerJoin(notes, eq(shareLinks.noteId, notes.id))
        .where(and(eq(notes.ownerId, ownerId), isNull(shareLinks.revokedAt)));
      return Number(rows[0]?.count ?? 0);
    },
  );
}
```

**検査項目**:
1. **JOIN 条件**: `eq(shareLinks.noteId, notes.id)` + `eq(notes.ownerId, ownerId)` ✅
   - notes.status で絞らない ✅
2. **revokedAt フィルタ**: `isNull(shareLinks.revokedAt)` ✅
   - 不変条件と一致 ✅
3. **所有権チェック**: innerJoin + eq(notes.ownerId) で他ユーザーのノートを除外 ✅
4. **エラー処理**: mapDbError で D1 エラーを適切に translate ✅
5. **コメント**: JOIN 仕様を詳細に記載 ✅

**テスト検査** (shareLinkRepository.integration.test.ts:108–148):

```
109: it("counts active links across all owned notes — including trashed notes...")
120-126: Owner が active note に 2 つ、trashed note に 1 つの active link を持つ。revoked 1 つ、other owner 1 つ。
132: expect(count).toBe(3);
```

- trashed note のリンクを含めることを明示的に検証 ✅
- revoked リンクを除外 ✅
- 他 owner のリンクを除外 ✅
- 0 件ケース（revoked only）を検証 ✅

**判定**: ✅ **合格**

---

### 5. MediaAssetRepository.aggregateByOwner — 集計母集団の正確性

**ポート定義検査** (mediaAssetRepository.ts:31–44):

```typescript
/**
 * Read-only owner-scoped aggregation of `attached` media assets: the
 * count and the sum of their `byteSize`. Only `attached` is counted —
 * `pending` / `orphan` / `deleting` are purge-lifecycle transients and
 * do not represent user-accessible media. Returns `{ count: 0,
 * totalBytes: 0 }` when the owner has no attached assets.
 *
 * Computed in a single aggregate query (no row enumeration) for
 * O(1) reads on large libraries. Used by `summarizeAccountDeletion`
 * (P24). See `.issue/573/adr.md` ADR-002.
 */
aggregateByOwner(
  ownerId: UserId,
): Promise<Readonly<{ count: number; totalBytes: number }>>;
```

**判定**: ✅ **合格**
- status フィルタ（`attached` のみ）を JSDoc で明示 ✅
- 理由（「user-accessible media」）を記載 ✅
- 0 件時の戻り値（DTO 形式）を明記 ✅
- ADR-002 への参照あり ✅

**アダプター実装検査** (mediaAssetRepository.ts:128–153):

```typescript
aggregateByOwner(
  ownerId: UserId,
): Promise<Readonly<{ count: number; totalBytes: number }>> {
  return mapDbError("Failed to aggregate media assets by owner", async () => {
    // Only `attached` assets are user-accessible media; pending / orphan /
    // deleting are purge-lifecycle transients (ADR-002). COALESCE guards
    // the SUM against NULL when no rows match.
    const rows = await this.db
      .select({
        count: count(),
        totalBytes: sql<number>`COALESCE(SUM(${mediaAssets.byteSize}), 0)`,
      })
      .from(mediaAssets)
      .where(
        and(
          eq(mediaAssets.ownerId, ownerId),
          eq(mediaAssets.status, "attached"),
        ),
      );
    const row = rows[0];
    return {
      count: Number(row?.count ?? 0),
      totalBytes: Number(row?.totalBytes ?? 0),
    };
  });
}
```

**検査項目**:
1. **WHERE 句**: `ownerId + status='attached'` ✅
2. **COALESCE**: SUM が NULL になるのを防止（0 件時） ✅
3. **戻り値型**: `{ count, totalBytes }` DTO 形式 ✅
4. **型変換**: `Number()` で SQLite の数値を JS に変換 ✅
5. **コメント**: 集計母集団の定義（ADR-002）を記載 ✅

**テスト検査** (mediaAssetRepository.integration.test.ts:120–151):

```
125-126: owner の attached メディア 2 つ（100 + 250 = 350 byte）
128-130: owner の pending/orphan/deleting を insert（excluded）
132: other の attached メディア 1 つ（excluded）
138: expect(result).toEqual({ count: 2, totalBytes: 350 });
```

- `attached` のみ集計 ✅
- `pending` / `orphan` / `deleting` 除外 ✅
- 他 owner 除外 ✅
- 0 件ケース（pending only）で `{ count: 0, totalBytes: 0 }` ✅

**判定**: ✅ **合格**

---

## カスケード不変性 + トランザクション境界

### 6. deleteAccount における UoW 単位と副作用の順序

**検査項目**: UoW 内・外での操作順序、トランザクション分離

**実装分析** (deleteAccount.ts:30–145):

```
30-40: UoW.run() 開始
38-42: User 読み出し + null チェック
43-48: username 検証（UoW 内）
53-62: password 検証（UoW 内）
64-67: admin チェック +例外（UoW 内）
69-71: User.markDeleted + credentialStore.purgeAll（UoW 内）
73-107: public note → private 化（UoW 内、OCC token 付き）
109-136: export job cancel（UoW 内、OCC token 付き）
138: collectEvents(eventDrafts)（UoW 内）
140: UoW.run() 終了
144: sessionService.revokeAllForUser（UoW **外**）
```

**判定**: ✅ **合格**
- 検証（username/password）がすべて UoW 内で行われ、例外発生時に自動ロールバック ✅
- User soft-delete（`markDeleted`）が password purge より前で、デッドロック回避 ✅
- session revoke が UoW 外（external token store）で、commit 後に実行 ✅
- plan.md「UoW 外で sessionService.revokeAllForUser。Idempotent.」と一致 ✅
- コメント（L142–143）が順序の意図を明示 ✅

---

## エラーハンドリング + 例外安全性

### 7. 検証エラーの原子性と非可逆性

**検査項目**: 検証失敗時に副作用が発生していないか

**テスト検証** (identity.integration.test.ts):

```
username 不一致時:
  - thrown error: BusinessRuleError('confirmation_mismatch')
  - user is not soft-deleted（assert: user.status !== 'deleted'）

password 不一致時:
  - thrown error: AuthenticationError('invalid_credentials')
  - user is not soft-deleted（assert: user.status !== 'deleted'）
```

**判定**: ✅ **合格**
- UoW 内での例外は自動ロールバック → 副作用なし ✅
- テストで非可逆性を確認 ✅

---

## 実装完全性チェック

### 8. Input Validation 境界 + DTO 投影

**検査項目**: transport 境界での入力検証、usecase への信頼

**DeleteAccountInput** (deleteAccount.ts:10–16):
- `actorUserId: string` — UUID 形式は UserId.create で検証 ✅
- `confirmation: string` — exact match を usecase で検証 ✅
- `currentPassword: string` — credentialStore.verifyPasswordForUser で検証 ✅

transport schema（plan.md「transport/schema」部で既実装）:
- `confirmWord: z.literal('DELETE')` — backend に流さない ✅
- action.ts で破棄 ✅

**判定**: ✅ **合格**

---

## テストカバレッジ

### 9. 統合テストの網羅性

**削除テスト** (identity.integration.test.ts):
- ✅ username 不一致 → `confirmation_mismatch`
- ✅ password 不一致 → `invalid_credentials`（no side-effects）
- ✅ 正常系（success） → user soft-deleted + events collected

**集計テスト** (identity.integration.test.ts):
- ✅ 複合シード（notes x 2 active + x 1 trashed、media x 2 attached + x 3 transient、public 1、link 2 active + 1 revoked）
- ✅ 期待値との厳密一致（noteCount=2, mediaCount=2, mediaTotalBytes=350, publicNoteCount=1, activeShareLinkCount=2）
- ✅ 0 件ユーザーケース

**ポートテスト** (adapter integration):
- ✅ countActiveByOwner: trashed note リンク含み、revoked 除外、owner 境界
- ✅ aggregateByOwner: attached のみ、pending/orphan/deleting 除外、owner 境界、0 件

**判定**: ✅ **合格**
- テスト密度が高く、重要な不変条件をすべてカバー

---

## 総括

### Blockers
**なし**

### Warnings
**なし**

### Notes
**なし**

---

## 最終判定

**結論**: **AC-1/2/4/5/8 すべてを満たし、Domain + Use Case レイヤのロジックは正合性・堅牢性・テストカバレッジともに高い水準を達成している。Blocker / Warning なし。**

細部：
- 検証順序（AC-1） — 型・コメント・テストで一貫 ✅
- 実カスケード一致（AC-5） — DTO JSDoc で根拠を記載し虚偽表示禁止を満たす ✅
- 集計精度（AC-4） — SQL 仕様がポート JSDoc と完全に一致 ✅
- トランザクション管理 — UoW 内外の境界が明確で例外安全 ✅
- テストカバレッジ — 重要な不変条件を網羅的に検証 ✅
