# PR #742 Security + Test レビュー（Round 2）

**PR**: #742  
**計画**: `.issue/573/plan.md`  
**ADR**: `.issue/573/adr.md`（ADR-004/005）  
**日付**: 2026-06-14（2nd Review）

---

## 審査方針

Security + Test（認証・認可・境界・テスト網羅性）の観点で **ゼロベース再審査**。

### 確認項目

- AC-1/2/3 とテスト方針の達成度
- パスワード再検証の強度（検証順序、bypass 不可、例外 path）
- confirmWord の transport-only 境界（型+実装）
- 入力バリデーション（shape/業務ルール）
- 認可（本人のみ、actor 境界）
- 機密情報の扱い（password backend 流入なし、確認語破棄）
- テスト網羅性（3分岐・集計・owner 境界・空集合・action 境界・frontend gating）

---

## Security レビュー

### ✅ AC-1: 検証順序の厳密化

**仕様**: `deleteAccount` が **username を先に判定**、不一致で `BusinessRuleError('confirmation_mismatch')`、その後パスワード再検証、不一致で `AuthenticationError('invalid_credentials')`。

**実装確認**:

- `deleteAccount.ts:43-48` — username 一致チェック（`input.confirmation !== user.username` → `BusinessRuleError`）
- `deleteAccount.ts:50-62` — その**後**に `verifyPasswordForUser` 呼び出し（「検証順序は AC-1」コメント明記）
- テスト `identity.integration.test.ts:2173-2200` — `it("checks username before password (confirmation_mismatch wins)")`が、username 不一致 + password 不正両方で `confirmation_mismatch` が返り、password 検証に到達しないことを assert（✓ 順序保証）

**判定**: ✅ 合格。検証順序は usecase・テスト・コメント一貫。

---

### ✅ AC-2: currentPassword の配線

**仕様**: `DeleteAccountInput` → transport `deleteAccountSchema` → action → usecase。

**実装確認**:

- `schema.ts:35-42` — `deleteAccountSchema.currentPassword: z.string().min(1).max(PASSWORD_MAX)` ✓
- `action.ts:19-25` — `input: { confirmation, currentPassword }` を `deleteAccount` へ渡す ✓
- `deleteAccount.ts:10-16` — `DeleteAccountInput` に `currentPassword: string` 追加 ✓
- テスト `index.test.tsx:207-223` — `"forwards only confirmation + currentPassword + confirmWord to the server fn"` で client が data `{ confirmation, currentPassword, confirmWord }` を送信することを assert ✓

**判定**: ✅ 合格。transport → action → usecase まで配線完全。

---

### ✅ AC-3: confirmWord の transport-only 境界（S-005）

**仕様**: 確認語「DELETE」は frontend/transport で検証、backend は受け取らない。

**実装確認**:

**型レベル（最強保証）**:
- `DeleteAccountInput` に `confirmWord` フィールド**なし**（`currentPassword` まで）→ usecase が confirmWord を受け取れない ✓
- `deleteAccount.ts:10-16` — `DeleteAccountInput` に `confirmation` + `currentPassword` のみ（confirmWord なし）✓

**transport 検証**:
- `schema.ts:41` — `confirmWord: z.literal("DELETE")` で shape を担保 ✓

**action 層での破棄**:
- `action.ts:16-18` — `confirmWord is validated at the transport boundary but deliberately not forwarded — the backend does not participate in the confirm-word check (#573 AC-3)` **コメント明記** ✓
- `action.ts:19-25` — `confirmation` + `currentPassword` のみを usecase に渡し、`confirmWord` は破棄 ✓

**frontend gating**:
- `index.tsx:88-90` — `canSubmit = agree && wordDone && identityDone && !isPending;` で `wordDone = confirmWord === CONFIRM_WORD` を要求 ✓
- `index.tsx:106-108` — `onSubmit` で `if (!canSubmit) return;` により DELETE 以外の値では送信不可 ✓
- テスト `index.test.tsx:162-183` — `"keeps the delete button disabled until all steps are satisfied"` で `typeConfirmWord("delete")` → disabled を assert ✓

**backend isolation**:
- `index.test.tsx:216-222` — server fn へ送るペイロードは `{ confirmation, currentPassword, confirmWord }` を確認（transport で confirmWord 検証）→ action で破棄 → usecase へ到達しない（型で保証） ✓

**判定**: ✅ 合格。型（DeleteAccountInput に confirmWord なし）+ transport（schema.literal）+ action（明示的破棄）+ frontend（disabled gating）の四段の多層防御。backend が確認語に一切関与しない不変条件をコンパイル時に強制。

---

### ✅ AC-4/AC-5: 削除影響の実データ集計 & 虚偽表示禁止

**仕様**:
- 削除影響を実カスケード挙動に厳密一致させて集計
- 虚偽表示禁止（#543）: purge されないデータは「失われる」と断定しない

**実装確認**:

**DTO の厳密性**:
- `dto/identity.ts:96-129` — `AccountDeletionImpactDTO` の全フィールドに「実カスケードでの意味」を JSDoc で明記：
  - `noteCount` — soft-delete 後 purge worker 待ち（「失われる」断定なし）
  - `mediaCount` / `mediaTotalBytes` — attached のみ（pending/orphan/deleting 除外）、purge されない
  - `publicNoteCount` — 410 Gone 化対象（実挙動一致）
  - `activeShareLinkCount` — 失効する（実カスケード一致）
  ✓ 各値の「実装根拠」が型に刻まれている（虚偽表示防止の基盤）

**集計ロジックの正確性**:

1. **noteCount**: `summarizeAccountDeletion.ts:34` — `noteRepository.countByOwner(actor, { status: "active" })` **active のみ** → 所有者が「失う」と感じる範囲 ✓
   - テスト `identity.integration.test.ts:2451-2495` — 2 active + 1 trashed → `noteCount: 2` ✓

2. **mediaCount / mediaTotalBytes**: `summarizeAccountDeletion.ts:35` — `mediaAssetRepository.aggregateByOwner(actor)` → SQL `WHERE ownerId = ? AND status = 'attached'`
   - `mediaAssetRepository.ts:153-178` — `COALESCE(SUM(byteSize), 0)` で NULL を 0 に変換（空集合安全）✓
   - テスト `mediaAssetRepository.integration.test.ts:120-139` — 2 attached (100+250) + pending/orphan/deleting 除外 + 他 owner 除外 → `{ count: 2, totalBytes: 350 }` ✓
   - テスト `identity.integration.test.ts:2473-2491` — media aggregate 結果が DTO に正しく転送 ✓

3. **publicNoteCount**: `summarizeAccountDeletion.ts:36` — `publicationStateRepository.countPublicByOwner(actor)` — **active-only INNER JOIN**（実カスケード「全ノート private 化」との微小ズレあり）
   - JSDoc で「softens this to an approximation」と断定を緩める ✓
   - ADR-003 で「公開中のノート 約 N 件」表現に吸収 ✓
   - テスト `identity.integration.test.ts:2457-2461` — active public + published = 1 → `publicNoteCount: 1` ✓

4. **activeShareLinkCount**: `summarizeAccountDeletion.ts:37` — `shareLinkRepository.countActiveByOwner(actor)` → SQL `notes.ownerId = ?` で JOIN、`notes.status` で絞らない、`revokedAt IS NULL` count
   - `shareLinkRepository.ts:215-231` — JOIN 条件 `notes.ownerId = ?` **のみ**（status 不問）→ **trashed note の active link も失効対象** ✓
   - JSDoc で「trashed notes included」明記 ✓
   - テスト `shareLinkRepository.integration.test.ts:108-133` — active note 2個 + trashed note 1個 の active link 合計 3 個、revoked 除外、other owner 除外 → 3 を assert ✓
   - テスト `identity.integration.test.ts:2478-2493` — share link aggregate 結果（2個）が DTO に正しく転送 ✓

**表現方針の実装**:
- `index.tsx:144-173` — 影響リスト（alert-error）:
  - L146: 「のノート…にアクセスできなくなります」（即時削除を断定せず） ✓ ADR-003 準拠
  - L153: 「にアクセスできなくなります」（purge 断定なし） ✓
  - L156: 「公開中のノート 約 N 件」（「約」で active-only JOIN のズレ吸収） ✓ ADR-003
  - L158: 「410 Gone を返すようになります」（実挙動一致、断定OK） ✓
  - L163: 「はすべて失効します」（実挙動一致、断定OK） ✓
  - L166: 「進行中のエクスポートジョブはキャンセルされます」（実挙動一致） ✓
  - L166: 「カスタムプロンプトなどアカウントに紐づくデータ」（saved view/prompt は集計なし、包括表現） ✓ S-001
  - L169: 「削除後のデータ復元はできません」（soft-delete 後復元路なし、一致） ✓

**判定**: ✅ 合格。集計値が実カスケード挙動に厳密一致し、表現が虚偽表示禁止原則に準拠。DTO JSDoc で型レベルで根拠を記録。

---

### ✅ AC-6: 多段確認 UI（モック準拠）

**仕様**: 影響リスト + confirm-steps（同意/DELETE/ユーザー名+パスワード）の多段確認。

**実装確認**:

- `index.tsx:137-173` — alert-error（影響リスト） ✓
- `index.tsx:175-283` — CONFIRM_STEPS（3 ステップ）:
  - Step 1: `STEP_CHECKBOX_ROW` で同意 checkbox ✓
  - Step 2: confirm-word input（DELETE のみ） ✓
  - Step 3: username + password input ✓
- テスト `index.test.tsx:150-159` — 「renders the aggregated impact counts and emphasizes 取り消せません」✓

**判定**: ✅ 合格。モック CSS をトークン由来ユーティリティに写像（styles.ts に alert/step/checkbox-row 等追加）。

---

### ✅ AC-7: disabled ゲート & ログアウト observable

**仕様**: 全ステップ満たすまで disabled。成功で即時ログアウト（保護ルート再訪で未認証にリダイレクト）。

**実装確認**:

**disabled ゲート**:
- `index.tsx:88-90` — `canSubmit = agree && wordDone && identityDone && !isPending` ✓
- `index.tsx:296` — `disabled={!canSubmit}` ✓
- テスト `index.test.tsx:162-183` — 4 段階で disabled 状態を検証（同意のみ・confirmWord のみ・username のみ・password のみ → disabled）✓

**ログアウト流**:
- `index.tsx:110-125` — server fn 成功後：
  - `clearAppShellCache(router)` → ユーザーキャッシュ破棄
  - `router.navigate({ to: "/", search: HOME_SEARCH })` → ホームへ遷移
  - テスト `index.test.tsx:185-205` — `clearCache` が `navigate` より先に呼ばれることを assert ✓
- アカウント削除時 `deleteAccount.ts:144` — `sessionService.revokeAllForUser(actor)` で **全セッション失効** → 保護ルート再訪で未認証にリダイレクト ✓

**判定**: ✅ 合格。disabled ゲートと session 失効で observable なログアウト。

---

### ✅ AC-8: サーバーコンポーネント + 集計の stream

**仕様**: Page.tsx（server）で async server component 内で集計 usecase を呼び、`<Suspense>` + `<SectionErrorBoundary>` で囲む（P22 準拠）。

**実装確認**:

- `Page.tsx:73-100` — async server component `AccountDeleteSection`:
  - L90-92: `getContainer()` + 動的 import で `summarizeAccountDeletion` 呼び出し ✓
  - L95: `input: { actorUserId: user.id }` で本人スコープ（actor 認可）✓
  - L99: `<AccountDeleteForm user={user} impact={impact} />` へ props 渡し ✓
- `Page.tsx:72-87` — shell:
  - L78: `<SectionErrorBoundary section="アカウント削除">` で集計エラーを隔離 ✓
  - L79-81: `<Suspense fallback={<FormSkeleton/>}>` で stream ✓
  - L82: `<AccountDeleteSection/>` 呼び出し ✓

**判定**: ✅ 合格。loader は auth のみ、集計は Page.tsx server component で stream。P22 基準準拠。

---

### ✅ パスワード再検証のバイパス不可

**確認**:

1. **client 先行検証で確実性なし** — `index.tsx:88-90` は UI gating のみ（表現層）
2. **transport 検証** — `schema.ts:37` で shape 検証（存在チェック）
3. **usecase 内の検証** — `deleteAccount.ts:53-62` で **必ず** `credentialStore.verifyPasswordForUser` を呼び出す（例外路がない）✓
   - username 不一致時は ① に到達しない
   - username 一致時は **必ず** ② を通る（強制）
4. **false でエラー** — `verifyPasswordForUser` の失敗（false）で `AuthenticationError('invalid_credentials')` throw ✓
   - テスト `identity.integration.test.ts:2136-2171` — false 時 no side effects を assert ✓

**判定**: ✅ 合格。usecase 内で例外 path なく、password 検証を強制。

---

### ✅ 入力バリデーション

**確認**:

**transport 境界（shape）**:
- `schema.ts:35-42` — `confirmation` / `currentPassword` / `confirmWord` 全て型定義 ✓
- `action.ts:9` — `validateInput(deleteAccountSchema)` で shape 検証 ✓

**usecase 境界（業務ルール）**:
- `deleteAccount.ts:43-48` — confirmation != username → `BusinessRuleError` ✓
- `deleteAccount.ts:53-62` — password 不正 → `AuthenticationError` ✓
- `deleteAccount.ts:64-66` — 最後のadmin 保護 → `IdentityService.assertNotLastAdmin` ✓

**frontend gating**:
- `index.tsx:88-90` — すべてのステップを client-side で先行判定（UX向上） ✓
- テスト `index.test.tsx:162-183` — disabled gate 検証 ✓

**判定**: ✅ 合格。境界ごとに明確に分離（shape → usecase → frontend）。

---

### ✅ 認可（本人のみ）

**確認**:

**route loader**:
- `account-delete.tsx:10` — `requireCurrentUser()` で認証確認 ✓

**usecase**:
- `deleteAccount.ts:28` — `actor = UserId.create(input.actorUserId)` で actor を明示的に受け取る
- `deleteAccount.ts:38-42` — `userRepository.findById(actor)` で actor 所有者のデータのみ読む ✓
- 削除対象は `found.entity`（actor 自身）のみ ✓

**summarizeAccountDeletion**:
- `summarizeAccountDeletion.ts:23` — `actor = UserId.create(input.actorUserId)` で actor 明示
- `summarizeAccountDeletion.ts:34-37` — 全リポジトリ読み出しが `actor` スコープ（noteRepository.countByOwner(actor) など） ✓
- 他ユーザーのデータにアクセス不可（リポジトリの owner フィルタ） ✓

**テスト**:
- `shareLinkRepository.integration.test.ts:108-133` —「excludes revoked links and other owners」で owner 境界を assert ✓
- `mediaAssetRepository.integration.test.ts:120-139` — 「excluding other owners」で owner 境界を assert ✓

**判定**: ✅ 合格。actor を explicit に受け取り、リポジトリレベルで owner フィルタ。本人のみ削除可能。

---

### ✅ 機密情報の扱い

**確認**:

**password**:
- transport で形状チェック（最小・最大長）のみ ✓
- `action.ts:19-25` — usecase へ `currentPassword` を渡す ✓
- `deleteAccount.ts:53-62` — `credentialStore.verifyPasswordForUser(actor, input.currentPassword)` で検証（plain text）✓
- usecase 完了後、password は database に保存されない（verification のみ、mutation なし）✓

**confirmWord**:
- `action.ts:16-18` — backend に渡さない（破棄） ✓
- log/error response に出ない（usecase に到達しない） ✓

**判定**: ✅ 合格。password は verification のみ（mutation なし）、confirmWord は backend 非参加。

---

## Test レビュー

### ✅ テスト網羅性

#### 1. **usecase（deleteAccount）の 3 分岐**

- ✅ `identity.integration.test.ts:2113-2134` — confirmation mismatch → `BusinessRuleError('confirmation_mismatch')`
- ✅ `identity.integration.test.ts:2136-2171` — password incorrect → `AuthenticationError('invalid_credentials')`（副作用なし）
- ✅ `identity.integration.test.ts:2238-2294` — 成功 → user soft-deleted、credentials purged、sessions revoked
- ✅ `identity.integration.test.ts:2202-2236` — only-admin 保護
- ✅ `identity.integration.test.ts:2173-2200` — username-first（confirmation_mismatch wins）

#### 2. **usecase（summarizeAccountDeletion）の集計**

- ✅ `identity.integration.test.ts:2451-2495` — 実データ集計（noteCount: 2 active+0 trashed、mediaCount: 2 attached、mediaTotalBytes: 350、publicNoteCount: 1、activeShareLinkCount: 2）
- ✅ `identity.integration.test.ts:2497-2512` — 空集合（user with no content → all zeros）

#### 3. **adapter（shareLinkRepository.countActiveByOwner）の owner 境界**

- ✅ `shareLinkRepository.integration.test.ts:108-133` — active/trashed ノート横断、revoked 除外、other owner 除外 → 3 count
- ✅ `shareLinkRepository.integration.test.ts:135-148` — revoked-only → 0 count

#### 4. **adapter（mediaAssetRepository.aggregateByOwner）の owner 境界**

- ✅ `mediaAssetRepository.integration.test.ts:120-139` — attached only（pending/orphan/deleting 除外）、other owner 除外、SUM 正確性（100+250=350）
- ✅ `mediaAssetRepository.integration.test.ts:141-151` — attached-zero → { count: 0, totalBytes: 0 }（COALESCE 安全）

#### 5. **action 層の confirmWord 破棄**

- ✅ `index.test.tsx:207-223` — server fn へ `{ confirmation, currentPassword, confirmWord }` を送信、usecase は `confirmation` + `currentPassword` のみ受け取る（型で保証）

#### 6. **frontend gating**

- ✅ `index.test.tsx:150-159` — impact counts 表示、取り消せません強調
- ✅ `index.test.tsx:162-183` — disabled gate（4 ステップ段階）
- ✅ `index.test.tsx:185-205` — success: clearCache → navigate 順序
- ✅ `index.test.tsx:207-223` — server fn ペイロード検証（transport + confirmWord）
- ✅ `index.test.tsx:226-246` — server error → form-level alert, no navigate

#### 7. **認可（actor 境界）**

- ✅ route loader で `requireCurrentUser()` → 認証確認
- ✅ usecase で `actor = UserId.create(input.actorUserId)` → explicit scope
- ✅ adapter テストで owner フィルタ assert（shareLink / media）

#### 8. **input validation**

- ✅ `deleteAccountSchema` 定義（type shape）
- ✅ `validateInput(deleteAccountSchema)` 呼び出し
- ✅ business rule error（confirmation_mismatch）テスト
- ✅ authentication error（invalid_credentials）テスト

**判定**: ✅ 合格。主要 3 分岐・集計・owner 境界・空集合・action 破棄・frontend gating・認可が全て網羅。

---

### ✅ テスト手法（実 D1 integration）

**確認**:

- `identity.integration.test.ts` — `setupTestContainer()` で実 D1 repository + UoW（フェイク repo なし）✓
- `shareLinkRepository.integration.test.ts` — 実 D1 seed + count 検証 ✓
- `mediaAssetRepository.integration.test.ts` — 実 D1 seed + aggregate 検証 ✓
- テスト方針「フェイク repo は存在しない、実 D1 で検証」に準拠 ✓

**判定**: ✅ 合格。本リポジトリのポリシー（application層は実 D1 integration）に準拠。

---

## Architecture / Design 確認

### ✅ ADR-001: 失効リンク owner-scoped 集計

- **決定**: `countActiveByOwner` ポート + 集計 SQL（**notes.status 不問の JOIN**）
- **実装**: `shareLinkRepository.ts:215-231` — `innerJoin(notes, eq(shareLinks.noteId, notes.id)) ... where(and(eq(notes.ownerId, ownerId), isNull(shareLinks.revokedAt)))`
- **テスト**: trashed note の active link も含むこと確認 ✓
- **判定**: ✅ 決定どおり実装。

### ✅ ADR-002: メディア容量集計

- **決定**: `aggregateByOwner` で `COUNT(*) / SUM(byteSize) WHERE ownerId = ? AND status = 'attached'`
- **実装**: `mediaAssetRepository.ts:160-171` — `COALESCE(SUM(byteSize), 0)` で NULL 安全、status='attached' で lifecycle 過渡状態除外
- **テスト**: attached-only, COALESCE(0), owner 境界確認 ✓
- **判定**: ✅ 決定どおり実装。

### ✅ ADR-003: 表現方針（虚偽表示禁止）

- **決定**: 公開停止・リンク失効・export キャンセル → 断定OK / ノート・メディア本体 → 「失われる」断定なし / saved view/prompt → 包括表現
- **実装**: `index.tsx:144-173` で各表現が方針準拠 ✓
- **DTO JSDoc**: 各値の「実カスケードでの意味」明記（虚偽表示防止の根拠） ✓
- **判定**: ✅ 決定どおり実装。虚偽表示禁止（#543）原則を貫く。

### ✅ ADR-004: SSO パスワード未設定ユーザー

- **決定**: 現コードベースでは password 未設定ユーザー生成路が無いため、本 Issue では `hasPassword` フォールバック不実装（YAGNI）
- **確認**: signUp / adminSignUp のみで、`registerPassword` 必須 ✓
- **リスク**: 将来 SSO 追加時に再検討（ポートは既存） ✓
- **判定**: ✅ 決定妥当。スコープ最小化を優先。

### ✅ ADR-005: confirmWord の backend 非参加（S-005）

- **決定**: 型レベル（DeleteAccountInput に confirmWord なし）+ transport shape + action 破棄 + frontend gating で境界を担保
- **実装**: 全て確認済み ✓
- **判定**: ✅ 決定どおり実装。型による不変条件が最強。

---

## Blockers

**なし**。

---

## Warnings

**なし**。

---

## Notes

### Note-001: `countPublicByOwner` の active-only ズレ

実カスケード（全ノート private 化）vs 集計（active-only JOIN）の微小ズレあり。
- **対応**: ADR-003 で「約 N 件」表現で吸収。
- **根拠**: DTO JSDoc で「approximation」と明記。
- **影響**: UI 表示の信頼性には影響なし（定性的「削除影響」の提示目的）。

### Note-002: formatBytes の inline 実装

client component `AccountDeleteForm` 内に byte formatter を inline に持つ（共有路なし）。
- **理由**: YAGNI（一箇所のみ使用）。
- **別例**: admin metrics に同型実装あり（JSDoc「mirrors the admin metrics helper」で根拠記録）。
- **影響**: maintenance neutral（ス코프内）。

### Note-003: 集計と削除実行の race

集計値表示後、削除実行までの間にデータ増減しうる（スナップショット性）。
- **許容**: 破壊操作の確認用途（厳密一致不要）。
- **対策**: 削除実行時に改めて業務ルール検証（AC-1/2）を実施。

### Note-004: frontend field errors 無視（S-005）

`confirmWord` の validation error は schema では定義されるが、client gating により到達しない。
- **実装**: `index.tsx:92-100` で「confirm-word field errors are suppressed」コメント明記。
- **保証**: UI は `confirmation` / `currentPassword` のみ表示（confirmWord の fieldErrors を無視）。

---

## 結論

**Blockers: 0 / Warnings: 0 / Notes: 4**

PR #742 は **Security + Test 基準を満たしている**。

### 達成度:

- ✅ AC-1: 検証順序（username → password）の厳密化
- ✅ AC-2: currentPassword の完全配線（transport → action → usecase）
- ✅ AC-3: confirmWord の transport-only 境界（型+schema+action+frontend gating）
- ✅ AC-4/5: 削除影響の実カスケード一致 + 虚偽表示禁止
- ✅ AC-6/7/8: 多段確認 UI・disabled ゲート・server component stream
- ✅ パスワード再検証の bypass 不可性
- ✅ 認可（本人のみ、actor 境界）
- ✅ 入力バリデーション（shape + business rule）
- ✅ 機密情報の扱い（password verification のみ、log 出力なし）
- ✅ テスト網羅性（3分岐・集計・owner 境界・空集合・action 層・frontend gating）
- ✅ ADR-001/002/003/004/005 の決定の実装準拠

### 品質指標:

| 項目 | 状態 |
|------|------|
| Validation boundary | ✅ transport + usecase + frontend |
| Authorization | ✅ actor scope explicit |
| Secrets handling | ✅ password verify-only, confirmWord backend-free |
| Error handling | ✅ structured, no leakage |
| Test coverage | ✅ integration + unit + spec coverage |
| Architecture | ✅ ADR 決定準拠 |
| Type safety | ✅ DeleteAccountInput がconfirmWord を受け付けない |

**Recommendation**: Approve（PR #742 は Product ready）。

---

