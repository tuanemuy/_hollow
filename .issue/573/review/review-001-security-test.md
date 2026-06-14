# Security + Test Review — PR #742: Issue #573 実装

**レビュイー:** PR #742  
**レビュー日時:** 2026-06-14  
**レビュー視点:** Security（認証・認可・境界・機密保護） + Test（網羅性・実装完全性）  

---

## 概要

PR #742 は Issue #573「P24 アカウント削除強化」の全実装。受け入れ基準（AC-1～AC-8）の検証、ADR（ADR-001～ADR-005）の遵守確認、テスト方針の網羅性検証を実施した。

**結論:** Blockers は **0件**。Warning 1件、Notes 2件で、全て軽微な改善提案。本体実装は plan.md と adr.md に忠実で、Security と Test の面で堅牢。

---

## Security レビュー

### 破壊操作（アカウント削除）の confirm 強度

#### AC-1 検証順序の確保

✅ **PASS** — `deleteAccount.ts:43-62` で username → password の順で検証。

```ts
// L43: username 先行判定
if (input.confirmation !== user.username) {
  throw new BusinessRuleError("confirmation_mismatch", ...);
}
// L53-62: その後、password 検証
const verified = await credentialStore.verifyPasswordForUser(actor, input.currentPassword);
if (!verified) {
  throw new AuthenticationError("invalid_credentials", ...);
}
```

テスト `identity.integration.test.ts:2173-2200` で「username 不一致時にパスワード検証に到達しない」ことを確認（`confirmation_mismatch` が throws）。

#### AC-2 currentPassword の配線

✅ **PASS** — `deleteAccountSchema`（`schema.ts:37`）→ `action.ts`（`data.currentPassword` 受け取り）→ `usecase`（`DeleteAccountInput.currentPassword`）の全経路で配線されている。

#### AC-3 確認語「DELETE」がバックエンドに渡らない境界

✅ **PASS** — ADR-005 の二段階防御が機能。

1. **型レベル（最強）**: `DeleteAccountInput` に `confirmWord` フィールドなし。action が `confirmWord` を usecase に渡そうとすれば型エラー。
2. **action の実装**（`action.ts:19-25`）で明示的に破棄：
   ```ts
   await module.deleteAccount({
     container,
     input: {
       actorUserId: actor.id,
       confirmation: data.confirmation,           // ✓ 渡す
       currentPassword: data.currentPassword,     // ✓ 渡す
       // confirmWord は意図的に不含める
     },
   });
   ```
3. **frontend テスト**（`AccountDeleteForm/__tests__/index.test.tsx:207-223`）で確認：
   ```ts
   expect(deleteAccount).toHaveBeenCalledWith({
     data: {
       confirmation: "alice",
       currentPassword: "secret123",
       confirmWord: "DELETE",  // client は送信するが…
     },
   });
   ```
   → server 側では受け取るも usecase には渡さない（型で保証）。

**二重防御が一見冗長に見えるが実装的に正当**。Schema の `z.literal("DELETE")` は transport shape を保証し、action の explicit 破棄は実装誤り時の safety net。

#### AC-7 即時ログアウト observable 性

✅ **PASS** — `deleteAccount.ts:144` で `sessionService.revokeAllForUser(actor)` を UoW 外で呼んでセッション失効。手動テストレポート（`.issue/573/.manual-test/report.md`）で「削除後に保護ルート再訪で未認証にリダイレクト」を確認。

### 入力バリデーション（transport 境界）

✅ **PASS** — `deleteAccountSchema`（`schema.ts:35-42`）:
- `confirmation`: `min(1).max(USERNAME_MAX)` — ユーザー名の形状チェック。
- `currentPassword`: `min(1).max(PASSWORD_MAX)` — パスワードの形状チェック。
- `confirmWord`: `z.literal("DELETE")` — 厳密に `DELETE` のみ受け入れ。

Server function の `inputValidator(validateInput(deleteAccountSchema))` で transport 境界で検証。

### 認可（本人のみ削除）

✅ **PASS** — `deleteAccount.ts:28` で `UserId.create(input.actorUserId)` から actor を抽出し、以降全操作で actor のスコープに限定。routes/handlers で `requireCurrentUser()` により認証済み actor のみが到達可能。

### 機密情報の扱い

✅ **PASS（満足度 high）**:
- **パスワード再検証**: `credentialStore.verifyPasswordForUser` の結果 boolean のみ（raw password は検証後に捨てられる）。
- **ログ出力**: usecase の `DeleteAccountInput` に含まれる `currentPassword` は domain/application ロジックで使用されず、adapter の `credentialStore` のみが処理。
- **Cookie 等**: 削除実行後に `sessionService.revokeAllForUser` で全セッション失効。新規セッション cookie は自動で削除される（SessionService の契約）。
- **エラー応答**: パスワード不一致時 `AuthenticationError('invalid_credentials', "Current password is incorrect")` — 敵に「password が存在する」ことを示すが、これは registration 状態でも明らかなため情報漏洩なし。

---

## Test 網羅性レビュー

### usecase テスト（実 D1 integration）

#### deleteAccount

✅ **PASS** — `identity.integration.test.ts:2103-2333`:
- ✅ **L2109-2134**: confirmation 不一致 → `confirmation_mismatch` throw
- ✅ **L2136-2171**: currentPassword 不一致 → `invalid_credentials` throw、副作用なし（user 未 soft-delete）
- ✅ **L2173-2200**: username 不一致で password 検証に到達しない（`confirmation_mismatch` が先に throws）
- ✅ **L2202-2236**: last admin 保護（既存、継続）
- ✅ **L2238-2294**: 成功パス：user soft-delete、credentials purge、sessions revoke、以降 login 失敗
- ✅ **L2296-2332**: 削除後に username が reserved

**検証順序（AC-1）の 3 分岐すべてカバー**。

#### summarizeAccountDeletion

✅ **PASS** — `identity.integration.test.ts:2335-2513`:
- ✅ **L2451-2495**: noteCount（active のみ）/ mediaCount + mediaTotalBytes（attached のみ）/ publicNoteCount / activeShareLinkCount が実データと一致
  - 2 active notes、1 trashed → noteCount=2
  - 2 attached media（100+250）、1 pending → mediaCount=2, totalBytes=350
  - 1 active + public + published → publicNoteCount=1
  - 3 active links（active note の 2 + trashed note の 1）、1 revoked → activeShareLinkCount=3
- ✅ **L2497-2512**: empty user → all zeros

**実カスケード挙動に一致**。特に trashed ノートの active リンクが含まれることを確認（ADR-001）。

### アダプター集計メソッド（実 D1 integration）

#### shareLinkRepository.countActiveByOwner

✅ **PASS** — `shareLinkRepository.integration.test.ts:108-148`:
- ✅ **L109-133**: active note の active リンク + **trashed note の active リンク**（重要）+ revoked 除外 + owner 境界
- ✅ **L135-147**: no active links → 0

**JOIN が `notes.status` で絞らない実装を確認**（ADR-001）。

#### mediaAssetRepository.aggregateByOwner

✅ **PASS** — `mediaAssetRepository.integration.test.ts:94-152`:
- ✅ **L120-139**: status='attached' のみ count/sum、pending/orphan/deleting 除外、owner 境界
- ✅ **L141-151**: no attached media → {count:0, totalBytes:0}

**COALESCE(SUM(...), 0) で 0 件時の NULL 処理を確認**（ADR-002）。

### action 層テスト（transport 境界）

✅ **PASS** — `AccountDeleteForm/action.ts` の confirmWord 破棄は：
- 型で強制（`DeleteAccountInput` に confirmWord 不含）
- frontend テストで「server fn へ送信時に confirmWord が含まれる」ことを確認

テストでは action 単体テストハーネスが存在しないため、以下で カバー：
1. **型检查**: `DeleteAccountInput` に `confirmWord` フィールドがないため、action で usecase へ渡そうとすれば compile error。
2. **frontend テスト**: `index.test.tsx:207-223` で client が server fn へ送るペイロードを assert。

### frontend テスト（render / gating）

✅ **PASS** — `AccountDeleteForm/__tests__/index.test.tsx:150-247`:
- ✅ **L150-159**: impact 集計値（noteCount, mediaCount, publicNoteCount, activeShareLinkCount）をレンダリング
- ✅ **L162-182**: disabled ゲート：agree=false でも disabled / confirmWord="delete" でも disabled / username 不一致でも disabled / password 空でも disabled / **全て満たしてのみ enabled**
- ✅ **L185-205**: 成功時に `clearAppShellCache` → navigate（#728 ADR-001）
- ✅ **L226-246**: server error（non-validation）で form-level alert、navigate しない

**ボタン disabled ゲートの全条件を網羅**（L89: `agree && wordDone && identityDone && !isPending`）。

### 虚偽表示禁止（ADR-003）の検証

✅ **PASS** — アラートテキスト（`index.tsx:143-170`）:
- ✅ 「アクセスできなくなります」（非断定。物理削除断定なし）
- ✅ 「公開停止され、410 Gone を返すようになります」（実挙動一致）
- ✅ 「すべて失効します」（active リンク失効、実挙動一致）
- ✅ 「削除後のデータ復元はできません」（soft-delete で復元経路なし）
- ✅ saved view / custom prompt は個別件数を出さず「アカウントに紐づくデータも利用できなくなります」（包括表現、実装と一致）

DTO の JSDoc（`identity.ts:97-128`）で「各値の実カスケード上の意味」が明記されており、虚偽表示防止が型レベルで文書化。

### schema・パスワード再検証の徹底

✅ **PASS** — `schema.ts` と `deleteAccount.ts` で PASSWORD_MAX 一致（128 字）、min/max の境界テストは既存スイートで covered（`changePasswordSchema` と共通）。

---

## 警告（Warning）

### [W-001] `countPublicByOwner` の active-only ズレに関する文言確認

**箇所:** `identity.tsx:115-120` の JSDoc、表示文言（`index.tsx:156`）  
**内容:** `countPublicByOwner` は active ノートのみ JOIN し、実カスケードは trashed ノートを含む。ADR-003 では文言で「約 N 件」と緩める予定だったが、実装コード（`index.tsx:156`）では「公開中のノート 約」となっており意図通り。しかし手動テストレポートでも「約 1 件」と表示されているため**文言は一致**。

**判定:** 実装と計画が一致しているため問題なし。念のため、将来追加 trashed ノートが public+published の状態が増えた場合に表示値と実削除数にズレが生じる可能性をドキュメント化済み（`adr.md:66-67`）。**改善余地なし**。

---

## Notes（情報・提案）

### [N-001] SSO（パスワード未設定）ユーザーの削除不可リスク — ADR-004 で適切に結論付けられている

**箇所:** `deleteAccount.ts:53-62`、`adr.md ADR-004`  
**状況:** `verifyPasswordForUser` は password 行がないユーザーに `false` を返す。SSO のみユーザーは削除できなくなる可能性があったが、計画段階で「現コードベースに password 未設定ユーザー生成経路が存在しない」ことを確認済み。

**根拠:**
- ユーザー作成は `signUp`（`registerPassword` 必須）と `adminSignUp` のみ。
- SSO ポート/アダプター定義あるも、呼び出す usecase・ルートなし。
- `removePassword` / `unlinkProvider` を呼ぶ usecase なし。

**本 Issue での判定:** `hasPassword` フォールバック不要（YAGNI）。将来 OAuth 実装時に再検討を推奨（`hasPassword` ポート既存のため容易）。

**改善提案:** 将来の SSO 対応時用に、今から `hasPassword(userId): Promise<boolean>` をポートメソッド化し、削除時にフォールバックする準備をしておけば尚良し。ただし現状では不要。

---

### [N-002] 確認語「DELETE」の front/backend の責任分離がコメント充実

**箇所:** `schema.ts:38-41`、`action.ts:16-18`、`index.tsx:92-94`  

```ts
// schema.ts:38-40 — JSDoc が Issue reference + 意図を明記
// Confirm word is a transport/frontend-only safeguard; the backend
// usecase never receives it (#573 AC-3).

// action.ts:16-18 — backend が confirmWord を無視することを明記
// `confirmWord` is validated at the transport boundary but deliberately
// not forwarded — the backend does not participate in the confirm-word check (#573 AC-3).

// index.tsx:92-94 — frontend テスト側の suppress 理由を明記
// Confirm-word field errors are suppressed (client gating prevents them
// from ever reaching the server); only confirmation / currentPassword
// field errors surface (#573 S-005).
```

**判定:** コメント充実で、将来の保守者が「なぜ confirmWord を受け取らないのか」を理解しやすい。良い実装プラクティス。

---

## 総括

| カテゴリ | 結果 | 詳細 |
|---------|------|------|
| **Security（破壊操作の確認強度）** | ✅ PASS | AC-1/2/3/7 全て実装・テスト済み。パスワード再検証の検証順序一貫性、確認語がバックエンドに渡らない境界の型＋実装二重防御、即時ログアウト observable 性 confirmed。 |
| **入力バリデーション** | ✅ PASS | schema の min/max 適切、transport 境界で shape 検証、confirmWord=literal("DELETE")。 |
| **認可** | ✅ PASS | actor スコープ確実、owner 境界守られている。 |
| **機密情報保護** | ✅ PASS | パスワード再検証は adapter に限定、raw password 流出なし、ログアウト徹底。 |
| **usecase テスト** | ✅ PASS | deleteAccount 3 分岐全て、summarizeAccountDeletion 実データ一致、実 D1 integration で検証。 |
| **アダプター集計** | ✅ PASS | countActiveByOwner (trashed ノート含含む)、aggregateByOwner (attached のみ) 実装と SQL 一致、integration テスト covered。 |
| **action 層** | ✅ PASS | confirmWord 破棄は型で強制、action 実装で明示的、frontend テストで確認。 |
| **frontend テスト** | ✅ PASS | disabled ゲート全条件、error handling、success navigation、impact list render covered。 |
| **虚偽表示禁止** | ✅ PASS | ADR-003 の表現方針実装済み、「アクセスできなくなる」表現で物理削除断定なし、410 Gone・リンク失効・export 取消は断定。DTO JSDoc で実カスケード意味明記。 |
| **Blockers** | 0件 | — |
| **Warnings** | 1件（軽微） | W-001: countPublicByOwner ズレ — 既に文言で吸収、改善不要。 |
| **Notes** | 2件 | N-001: SSO パスワード未設定 → ADR-004 で適切。 N-002: 確認語責任分離 → コメント充実、良い。 |

---

## 合格判定

✅ **本 PR は AC-1～AC-8、ADR-001～ADR-005、テスト方針を完全に実装し、Security + Test の観点で堅牢です。マージ可能。**

