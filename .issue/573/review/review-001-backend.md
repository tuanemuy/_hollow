# レビュー結果 — PR #742 / Issue #573 / バックエンド（Domain + Use Case）

**レビュアー:** Claude Code  
**対象:** Domain + Use Case 層（`deleteAccount` 強化・`summarizeAccountDeletion` 新規・ポート追加）  
**レビュー日:** 2026-06-14

---

## 総評

**Blockers: 0 / Warnings: 0 / Notes: 1**

バックエンド実装は計画・受け入れ基準・アーキテクチャ原則に完全に適合しています。パスワード再検証の検証順序は厳密、集計 usecase は read-only の正しい形、ポート定義のJSDocは虚偽表示禁止の根拠を型レベルで残し、アダプター SQL は実カスケードと一致しています。

---

## 詳細レビュー

### Domain + Use Case

#### deleteAccount — パスワード再検証の実装

**✓ 合格:**
- `DeleteAccountInput` に `currentPassword` を追加 ✓
- **検証順序**（AC-1 に一致）: username 先行判定 → password 後置 ✓
  - username 不一致時 → `BusinessRuleError('confirmation_mismatch')`
  - password 不一致時 → `AuthenticationError('invalid_credentials')`
  - コードコメント「confirmed after the username check」で意図を記録 ✓
- UoW 内で `credentialStore.verifyPasswordForUser(actor, currentPassword)` 呼び出し ✓
- 既存カスケード（`User.markDeleted()` + `credentialStore.purgeAll()` + 公開ノート private 化 + export job キャンセル + `collectEvents`）は変更なし、副作用 intact ✓
- `requestEmailChange` 準拠の sensitive-operation 再認証パターン ✓

**テスト:**
- 「パスワード不一致で `AuthenticationError('invalid_credentials')`」テストケース追加 ✓
- 「username 先行判定: confirmation_mismatch が invalid_credentials に優先」テストケース追加 ✓
- 既存の「成功時カスケード」テストを password パラメータに対応 ✓

---

#### summarizeAccountDeletion — read-only 集計 usecase

**✓ 合格:**
- `listNotesByOwner` と同型の構造: `unitOfWorkProvider.run()` 内でリポジトリを read、`collectEvents` 不使用 ✓
- `Promise.all` で 4 つの集計を並行実行（リポジトリは読み取り専用なので並行安全） ✓
- 各集計の母集団が実カスケードと一致:
  - `noteCount` = `countByOwner(actor, { status: 'active' })` — active のみ（ユーザーが「失う」範囲） ✓
  - `mediaCount` / `mediaTotalBytes` = `aggregateByOwner()` — attached のみ（pending/orphan/deleting は purge ライフサイクル過渡） ✓
  - `publicNoteCount` = `countPublicByOwner()` — active 公開ノート（410 化対象） ✓
  - `activeShareLinkCount` = `countActiveByOwner()` — **全ノート** の active リンク（trashed 含む） ✓
- JSDoc が虚偽表示禁止の根拠を記録（`AccountDeletionImpactDTO` + ADR-003 への参照） ✓

**テスト:**
- 実 D1 integration：複合シナリオ（active/trashed ノート + 公開ノート + media 複数状態 + share link active/revoked）✓
- zero-content ユーザーの全ゼロ返却 ✓

---

### Domain Layer — ポート定義

#### ShareLinkRepository.countActiveByOwner()

**✓ 合格:**
- シグネチャ: `countActiveByOwner(ownerId: UserId): Promise<number>` ✓
- JSDoc が **重要な設計決定を明記**:
  - 「JOIN on ownership alone — `notes.status` is intentionally not filtered」→ trashed リンク包含 ✓
  - 「matches the account-delete cascade」→ 実カスケード `handleUserDeletedEvent` の revocation set と一致 ✓
  - 「read-only projection (no OCC token)」→ ドメイン層の契約を守る ✓
  - ADR-001 への参照 ✓
- 配置: `TransactionalRepository` 非拡張、既存 `countByNoteId` と同じ読み取り専用 count 群に並列 ✓

#### MediaAssetRepository.aggregateByOwner()

**✓ 合格:**
- シグネチャ: `aggregateByOwner(ownerId): Promise<{ count: number; totalBytes: number }>` ✓
- JSDoc が **集計母集団を明記**:
  - 「Only `attached` is counted」 ✓
  - 「`pending` / `orphan` / `deleting` are purge-lifecycle transients」→ 実状を正確に表現 ✓
  - 「Returns `{ count: 0, totalBytes: 0 }` when... no attached assets」→ 境界ケース明示 ✓
  - 「Computed in a single aggregate query (no row enumeration) for O(1) reads」→ 性能特性記録 ✓
  - ADR-002 への参照 ✓
- 配置: 既存 `findByOwner` と区別、O(1) 集計の専用メソッド ✓

---

### Application Layer — DTO

#### AccountDeletionImpactDTO

**✓ 合格:**
- 型定義が Readonly 完全 ✓
- **各フィールドの JSDoc が虚偽表示禁止を守る**:
  - `noteCount`: 「become inaccessible (login is revoked and public access is stopped), but the rows are not physically purged — do not present this as 'immediately erased'」 ✓
  - `mediaCount` / `mediaTotalBytes`: 「Like `noteCount`, these blobs are not immediately purged on deletion」 ✓
  - `publicNoteCount`: 「can diverge slightly from the cascade... during the trash → outbox-relay lag window」 → 実カスケードとの微小ズレを明示し、表現の「softening」を正当化 ✓
  - `activeShareLinkCount`: 「Matches the cascade's revocation set exactly」 ✓
- 最上位 JSDoc: `#543 虚偽表示禁止` + ADR-003 への参照 ✓

---

### Adapters — D1 SQL 実装

#### shareLinkRepository.countActiveByOwner()

**✓ 合格:**
- SQL 構造: `SELECT COUNT(*) FROM shareLinks INNER JOIN notes ... WHERE notes.ownerId = ? AND revoked_at IS NULL` ✓
- **重要: JOIN 条件が `notes.ownerId` のみ** で `notes.status` を **フィルタしない** → trashed ノートのリンク包含 ✓
- `revoked_at IS NULL` が `status='active'` 不変条件と一致 ✓
- コード内コメント: 「status is intentionally not filtered so trashed notes' active links are counted」 ✓
- エラーハンドリング: `mapDbError` で driver error を共有契約に translate ✓

#### mediaAssetRepository.aggregateByOwner()

**✓ 合格:**
- SQL 構造: `SELECT COUNT(*), COALESCE(SUM(byteSize), 0) WHERE ownerId = ? AND status = 'attached'` ✓
- **集計母集団が明確**: `status = 'attached'` のみ（pending/orphan/deleting 除外） ✓
- `COALESCE(..., 0)` で NULL ガード（0 件時） ✓
- Number 変換で型安全性維持 ✓
- コード内コメント: 「Only `attached` assets are user-accessible media」 ✓
- エラーハンドリング: `mapDbError` で translate ✓

**テスト（integration）:**
- mediaAssetRepository: attached vs non-attached の明確な分離、他オーナーの除外 ✓
- shareLinkRepository: active vs revoked の分離、trashed ノートのリンク包含、他オーナー除外 ✓

---

### Transport / Action Boundary

#### deleteAccountSchema

**✓ 合格:**
- `confirmation` （既存）+ `currentPassword` （新規）+ `confirmWord` （新規）✓
- `confirmWord: z.literal('DELETE')` で transport 形状を保証 ✓
- コメント: 「Confirm word is a transport/frontend-only safeguard; the backend usecase never receives it (#573 AC-3)」 ✓

#### deleteAccountFn (action.ts)

**✓ 合格:**
- `confirmWord` を **明示的に破棄**: usecase へ渡るのは `confirmation` + `currentPassword` のみ ✓
- コメント: 「confirmWord is validated at the transport boundary but deliberately not forwarded — the backend does not participate in the confirm-word check (#573 AC-3)」 ✓
- 型レベルでの境界保証: `DeleteAccountInput` に `confirmWord` フィールドなし → backend が確認語に関与しないことを compile-time に強制 ✓

---

### テスト方針の遵守

**✓ 合格:**

- **application テスト**: 実 D1 integration（`setupTestContainer` + seed）で検証、フェイク repo なし ✓
- **deleteAccount**: 
  - username 先行判定（AC-1） ✓
  - password 不一致時 AuthenticationError ✓
  - 副作用なし（user.deleted なし）✓
- **summarizeAccountDeletion**:
  - 複合 content シナリオで各カウントが実データ一致 ✓
  - zero-content boundary ✓
- **アダプター**: owner-scoped count の join 仕様、status フィルタ、other-owner 除外 ✓
- **action 境界（ADR-005）**: 型で confirmWord 破棄を強制、frontend render テストで送信ペイロード assert 予定 ✓

---

## Notes

### [N-001] `countPublicByOwner` の active-only ズレの表現

**箇所:** `AccountDeletionImpactDTO.publicNoteCount` JSDoc

**内容:** JSDoc に「`countPublicByOwner` (active-only INNER JOIN) can diverge slightly from the cascade (which privatizes every note, trashed included)」と記載されており、実カスケード（全ノート private 化）と集計手段（active-only）の微小なズレを正確に記述しています。これにより frontend の「文言を softening する」根拠が型レベルで保証されています。

**判定:** 虚偽表示禁止の原則（#543）と ADR-003 の方針（断定を緩める）が一貫性を持って実装されたもので、問題ありません。最終表現は frontend レビューで検証すればよい。

---

## 結論

**レビュー結果: ✅ 承認**

- **パスワード再検証**: 検証順序（username → password）は AC-1 を厳密に実装、AC・テスト・コードで一本化 ✓
- **集計 usecase**: read-only + UoW パターン（`listNotesByOwner` 準拠）、母集団が実カスケードと一致 ✓
- **ポート・アダプター**: JSDoc に虚偽表示禁止の根拠を残す、SQL は実カスケード挙動と厳密一致 ✓
- **テスト**: 実 D1 integration で複合シナリオ + boundary ケースを網羅 ✓
- **Action 境界**: `confirmWord` 破棄を型・実装・コメントで多層保証 ✓

Domain + Use Case 層は計画を完全に実装し、虚偽表示禁止・依存方向・UoW 契約、既存カスケード の全てを遵守しています。

ドメインロジックがユースケース層に漏れておらず、型安全性も最大限に活用されています。Blocker / Warning なし。
