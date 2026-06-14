# Frontend Review — Issue #573: P24 アカウント削除強化（Round 3）

**対象PR:** #742  
**レビュー日:** 2026-06-14  
**レビュアー:** Claude Code（Frontend 専門家）  
**Round:** 3（最終確認）

---

## 実施内容

Round 2 で指摘された `BTN_DESTRUCTIVE` の hardcoded hex 問題は、ワーキングツリーの未コミット状態による偽陽性であることを確認。最新の PR diff で `bg-error-hover` / `bg-error-pressed` トークンを使用していることを検証した上で、ゼロベースで以下を確認：

1. **トークン規律**: tokens.css / index.css @theme inline / spec/design/tokens.md での一貫性
2. **Frontend AC 照合**: AC-3/5/6/7 を コンポーネント実装と照らし合わせ
3. **多段確認 UI**: モック P24 準拠状況
4. **虚偽表示禁止**: ADR-003 文言方針の遵守
5. **エラー処理・a11y・Suspense+SectionErrorBoundary**: CLAUDE.md 規約との整合

---

## トークン確認（BTN_DESTRUCTIVE）

### 修正内容（コミット済み）

**`app/components/identity/styles.ts` L262-263:**
```typescript
export const BTN_DESTRUCTIVE =
  "inline-flex items-center gap-1.5 self-start h-11 px-6 rounded-pill bg-error text-white text-sm font-medium whitespace-nowrap transition-colors motion-reduce:transition-none hover:not-disabled:bg-error-hover active:not-disabled:bg-error-pressed disabled:bg-surface disabled:text-ink-tertiary disabled:cursor-not-allowed";
```
✅ `bg-error-hover` / `bg-error-pressed` トークン使用（hardcoded hex なし）

### トークン定義確認

**`app/styles/tokens.css` L28-29:**
```css
--color-error-hover: #b03535;
--color-error-pressed: #9a2e2e;
```

**`app/styles/index.css` L31-32（@theme inline）:**
```css
--color-error-hover: var(--color-error-hover);
--color-error-pressed: var(--color-error-pressed);
```

**`spec/design/tokens.md`:**
| Error hover | `--color-error-hover` | `#b03535` |
| Error pressed | `--color-error-pressed` | `#9a2e2e` |

✅ **3 箇所一貫性**: トークン定義 → @theme 実装 → 仕様書ドキュメント

---

## Frontend AC 照合

### AC-3: 確認語「DELETE」入力の frontend/transport 検証

**transport 境界（`app/components/identity/schema.ts` L35-42）:**
```typescript
export const deleteAccountSchema = z.object({
  confirmation: z.string().min(1).max(USERNAME_MAX),
  currentPassword: z.string().min(1).max(PASSWORD_MAX),
  confirmWord: z.literal("DELETE"),
});
```
✅ `z.literal("DELETE")` で shape 保証

**client-side gating（`app/components/identity/AccountDeleteForm/index.tsx` L88-90）:**
```typescript
const wordDone = confirmWord === CONFIRM_WORD;  // "DELETE" with ===
const identityDone = username === user.username && password.length > 0;
const canSubmit = agree && wordDone && identityDone && !isPending;
```
✅ 厳密な `===` で client 送信前に確認語をゲート。大文字小文字・前後空白でも弾かれる（テスト検証済み）

**action 層で破棄（`app/components/identity/AccountDeleteForm/action.ts` L18-26）:**
```typescript
// `confirmWord` is validated at the transport boundary but deliberately
// not forwarded — the backend does not participate in the confirm-word
// check (#573 AC-3). Only `confirmation` + `currentPassword` cross.
await module.deleteAccount({
  container,
  input: {
    actorUserId: actor.id,
    confirmation: data.confirmation,
    currentPassword: data.currentPassword,
  },
});
```
✅ `confirmWord` を backend に渡さない（backend usecase は `confirmation` + `currentPassword` のみ受け取り）

---

### AC-5: 虚偽表示禁止（実カスケード一致）

**表現方針の遵守（`app/components/identity/AccountDeleteForm/index.tsx` L143-171）:**

| リスト項目 | 表現 | ADR-003 準拠 |
|-----------|------|-----------|
| ノート | 「**アクセスできなくなります**」（強調なし）| ✅ 非断定（soft-delete + アクセス不能化） |
| メディア | 「**アクセスできなくなります**」（強調なし）| ✅ 非断定（attached のみ集計、purge されない） |
| 公開 URL | 「公開停止され、公開 URL は **410 Gone** を返すようになります」| ✅ 断定的（実カスケード一致） |
| 公開件数 | 「公開中のノート **約** N 件」| ✅ 「約」で active-only のズレを吸収（ADR-001） |
| リンク | 「失効します」| ✅ 断定的（全ノートの active リンク revoke） |
| export | 「キャンセルされます」| ✅ 断定的（実カスケード一致） |
| saved view/prompt | 「利用できなくなります」（個別件数なし）| ✅ 包括表現（S-001）|
| 復元 | 「できません」| ✅ 復元経路なし（実挙動一致） |

**DTO JSDoc（`app/core/application/dto/identity.ts`）:**
各フィールドに「実カスケードでの意味」を明記（型レベルで虚偽表示禁止の根拠を留保）

✅ **AC-5 完全準拠**

---

### AC-6: 多段確認 UI のモック準拠

**構造確認:**

| モック | 実装 | 状態 |
|-------|------|------|
| `alert-error`（影響リスト） | `<div className={ALERT} ${ALERT_ERROR}>` + `<ul>${ALERT_LIST}` | ✅ |
| `confirm-steps`（3 ステップ） | `<div className={CONFIRM_STEPS}>` | ✅ |
| `step-num` | `<span className={STEP_NUM} data-done={...}>{1,2,3}</span>` | ✅ |
| Step 1: 同意 checkbox | `<input type="checkbox">` + `STEP_CHECKBOX_ROW` | ✅ |
| Step 2: DELETE input | `<input type="text">` + placeholder + `FIELD_INPUT` | ✅ |
| Step 3: username + password | 2 input（`confirmation` + `currentPassword`） | ✅ |
| `danger-action`（ボタン + 注釈） | `<div className={DANGER_ACTION}>` + `BTN_DESTRUCTIVE` + `DANGER_NOTE` | ✅ |

✅ **モック構造完全一致**

---

### AC-7: ボタン有効化ゲート + 即時ログアウト + 遷移

**有効化ゲート（L88-90）:**
```typescript
const canSubmit = agree && wordDone && identityDone && !isPending;
```
✅ 同意 && DELETE === "DELETE" && username === user.username && password.length > 0 を全て満たすまで disabled

**実行時処理（L106-126）:**
1. ✅ `canSubmit` 確認後に `deleteAccount` server fn 呼び出し
2. ✅ 成功後 `clearAppShellCache(router)` で stale `_app` キャッシュを破棄（#728 ADR-001）
3. ✅ `/` に navigate（未認証ランディング）
4. ✅ パスワード不一致時は `AuthenticationError` → `formError` 表示・画面遷移なし

**即時ログアウト observability（manual test TC-006 検証済み）:**
- 削除後 `/` に遷移
- 保護ルート再訪で未認証リダイレクト
- `sessionService.revokeAllForUser` が効く

✅ **AC-7 完全準拠**

---

## 多段確認 UI の詳細確認

### 有効化ゲートの厳密性

**edge case テスト結果（manual test TC-004 PASS）:**
- ❌ `Delete` → disabled（大文字小文字判定厳密）
- ❌ ` DELETE ` → disabled（前後空白で弾く）
- ❌ password 空欄 → disabled
- ✅ 全項目正確に入力 → enabled

### error handling と a11y

**field error 表示（L247-250, L273-276）:**
```typescript
<p className={FIELD_ERROR} role="alert">
  {usernameError[0]}
</p>
```
✅ validation 境界 error のみ表示（`confirmation` / `currentPassword`）
✅ `confirmWord` error は client gating で到達しないため UI で無視（S-005）

**form-level error（L285-289）:**
```typescript
{formError !== null ? (
  <p className={`${FIELD_ERROR} mt-6`} role="alert">
    {formError}
  </p>
) : null}
```
✅ password 不一致（AuthenticationError）等は form-level に表示・画面遷移なし

**a11y 実装:**
- ✅ `role="alert"` で error message を screen reader に通知
- ✅ `aria-describedby={helpId}` で password input に help text 関連付け
- ✅ `aria-invalid` で validation state を表現
- ✅ `aria-hidden="true"` で icon を screen reader から除外

---

## Suspense + SectionErrorBoundary（AC-8 準拠）

**`app/components/identity/AccountDeleteForm/Page.tsx`:**

```typescript
export function AccountDeletePage({ user }: Props) {
  return (
    <main>
      <h1 className="sr-only">アカウント削除</h1>
      <SectionErrorBoundary section="アカウント削除">
        <Suspense fallback={<FormSkeleton ariaLabel="..." />}>
          <AccountDeleteSection user={user} />
        </Suspense>
      </SectionErrorBoundary>
    </main>
  );
}

async function AccountDeleteSection({ user }: Props) {
  const { getContainer } = await import("@/core/application/di/containerStore");
  const container = await getContainer();
  const { summarizeAccountDeletion } = await import(
    "@/core/application/identity/summarizeAccountDeletion"
  );
  const impact = await summarizeAccountDeletion({
    container,
    input: { actorUserId: user.id },
  });
  return <AccountDeleteForm user={user} impact={impact} />;
}
```

✅ **P22 `SecurityForm/Page.tsx` 準拠:**
- route loader は auth + RSC 描画のみ（集計 usecase は Page.tsx で呼ぶ）
- `<SectionErrorBoundary>` で聚計エラーを section に隔離
- `<Suspense>` で集計 usecase の latency を stream
- async server component で `getContainer()` → `summarizeAccountDeletion()` 呼び出し

---

## トークン規律（handwritten CSS・任意値チェック）

### styles.ts

**新規追加ユーティリティの検査:**
```typescript
export const ALERT_LIST = "mt-1 pl-[1.2em] flex flex-col gap-1 list-disc";
export const CONFIRM_STEPS = "flex flex-col gap-[22px]";
export const STEP = "grid grid-cols-[28px_1fr] gap-3.5 items-start";
export const STEP_NUM = "w-6 h-6 mt-0.5 rounded-full bg-surface text-ink-secondary text-xs font-medium inline-flex items-center justify-center data-[done]:bg-success data-[done]:text-white";
export const STEP_LABEL = "block text-sm font-medium text-ink mb-1.5";
export const STEP_HELP = "text-xs text-ink-tertiary mt-1.5 [&_code]:font-mono [&_code]:bg-surface [&_code]:px-1.5 [&_code]:py-px [&_code]:rounded-xs [&_code]:text-ink";
export const STEP_CHECKBOX_ROW = "flex items-start gap-2.5 cursor-pointer select-none text-[13px] text-ink leading-normal [&_input]:w-4 [&_input]:h-4 [&_input]:mt-0.5 [&_input]:accent-accent [&_input]:cursor-pointer [&_input]:shrink-0 [&_strong]:font-medium";
export const DANGER_ACTION = "mt-10 pt-6 border-t border-hairline flex flex-col gap-2.5";
export const BTN_DESTRUCTIVE = "inline-flex items-center gap-1.5 self-start h-11 px-6 rounded-pill bg-error text-white text-sm font-medium whitespace-nowrap transition-colors motion-reduce:transition-none hover:not-disabled:bg-error-hover active:not-disabled:bg-error-pressed disabled:bg-surface disabled:text-ink-tertiary disabled:cursor-not-allowed";
export const DANGER_NOTE = "text-xs text-ink-tertiary";
export const STEP_LABEL_SPACED = `${STEP_LABEL} mt-4`;
```

**任意値の検査:**
- ✅ `[1.2em]` は `pl-[1.2em]`（モック `.alert-list` の `margin-left: var(--space-4) + 0.2em` 相当、設計で許容）
- ✅ `[22px]` は `gap-[22px]`（モック `.confirm-steps gap: 22px` 指定、設計で許容）
- ✅ `[28px]` は `grid-cols-[28px_1fr]`（モック `.step` column width、設計で許容）
- ✅ `[13px]` は `text-[13px]`（モック `.checkbox-row` font-size）
- ✅ 他は全て token 由来 utility（`bg-error`, `text-white`, `gap-1.5`, `h-11`, `px-6`, `rounded-pill` 等）

**color hardcode 検査:**
- ✅ `BTN_DESTRUCTIVE` で hex / rgb / hsl なし（`bg-error` + `bg-error-hover` + `bg-error-pressed` token）
- ✅ その他 utility も token 由来
- ✅ avatar gradient（`from-[#c9d3df] to-[#8e99a8]`）は新規 AccountDelete コードの外

✅ **CLAUDE.md 規約完全準拠**（任意値はモック SSOT の寸法・色には使わず、必要な箇所のみ）

### index.tsx（コンポーネント）

**色・スタイル hardcode 検査:**
```typescript
// 対象: index.tsx
// - className は全て styles.ts から import した constant
// - inline style なし
// - color・背景色のリテラル値なし
```
✅ **inline style なし、全て utility class**

---

## DTO と usecase の整合

### AccountDeletionImpactDTO（`app/core/application/dto/identity.ts`）

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

✅ 各フィールドの JSDoc に「実カスケードでの意味」明記（虚偽表示禁止の型レベル根拠）

### summarizeAccountDeletion usecase（`app/core/application/identity/summarizeAccountDeletion.ts`）

```typescript
export async function summarizeAccountDeletion({
  container,
  input,
}: ServiceArgs<SummarizeAccountDeletionInput>): Promise<AccountDeletionImpactDTO> {
  // ...
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
      return { noteCount, mediaCount: media.count, mediaTotalBytes: media.totalBytes, publicNoteCount, activeShareLinkCount };
    },
  );
}
```

✅ `listNotesByOwner` 同型（UoW 内で repo read、`collectEvents` なし）

---

## 最終統合確認

### manual test (2026-06-14)

6 件中 6 件 PASS:
- TC-001: 影響リスト実データ表示 ✅
- TC-002: 多段確認 UI 構成 ✅
- TC-003: 削除ボタン有効化ゲート ✅
- TC-004: 確認語の大文字小文字・空白判定 ✅
- TC-005: パスワード再検証・誤パスワード処理 ✅
- TC-006: 削除成功 → ログアウト → 遷移 ✅

起票した Issue: なし

---

## Blockers

なし

---

## Warnings

なし

---

## Notes

1. **BTN_DESTRUCTIVE トークン化（Round 2 偽陽性の解決）**: ワーキングツリーの未コミット状態による偽陽性であることを確認。現在の PR は `bg-error-hover` / `bg-error-pressed` を正しく使用し、tokens.css / index.css @theme inline / spec/design/tokens.md の 3 箇所で一貫性を保っている。

2. **任意値（arbitrary values）の許容箇所**: `gap-[22px]` / `pl-[1.2em]` / `grid-cols-[28px_1fr]` / `text-[13px]` は全てモック P24 の寸法・配置指定に由来。CLAUDE.md に「utility-first only + 任意値は設計で許容」と明記されており、conformance 問題なし。

3. **s-005 （confirmWord 破棄の担保）**: 型レベル（`DeleteAccountInput` に `confirmWord` フィールドなし）+ action.ts 明示的な破棄 + frontend render test での shape 検証で三段構えで保証。action-test ハーネス未実装は ADR-005 で受け入れ済み。

4. **表現方針（ADR-003）の UI 反映**: 「アクセスできなくなります」「約 N 件」「失効します」等の文言が実カスケード（soft-delete + public 化 + リンク revoke）に厳密一致。manual test TC-001 で虚偽表示禁止を検証済み。

5. **bytesFormatter の presentation 層配置**: 生のバイト数は DTO で保持し、整形は component 内（`formatBytes`）で実施。CLAUDE.md ガイドに準拠。

---

## 結論

✅ **Frontend レビュー合格**

- **AC-3/5/6/7** 完全準拠
- **トークン規律** CLAUDE.md 規約遵守
- **a11y・error handling** 既存パターン踏襲
- **Suspense+SectionErrorBoundary** P22 準拠
- **manual test** 全 6 件 PASS、Issue 起票なし

次フェーズに進行可能。
