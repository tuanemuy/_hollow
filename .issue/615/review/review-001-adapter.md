# レビュー: Issue #615 — Adapter / Infrastructure 観点

**PR:** 775 / **対象ブランチ:** issue/615/mobile-admin-nav-links
**実装計画:** `.issue/615/plan.md` / **設計判断:** `.issue/615/adr.md`  
**レビュー日:** 2026-06-25 / **レビュアー:** Claude Code (Adapter/Infrastructure specialist)

---

## Executive Summary

**全体評価:** ✅ **Blockers: 0 / Warnings: 2 / Notes: 4**

Adapter / Infrastructure 層の実装は堅牢。`recordActivity` の ISO 8601 文字列スロットル、`mapDbError` ラッピング、best-effort 握り潰し、UoW 外配置、ポート越しログが完璧に実装されている。個別の指摘は軽微（スロットル幅注釈と、`eq(sessions.token, token)` の追加確認）。設計判断の一貫性も優秀。

---

## Blockers

なし。

---

## Warnings

### W-001: `recordActivity` の WHERE スロットル述語に `eq(sessions.token, token)` が含まれることの確認
**場所:** `app/core/adapters/d1/repositories/sessionService.ts` L189-192  
**理由:** スロットル WHERE は `lt(sessions.updatedAt, cutoff)` のみで、`token` の一意性判定を `eq(sessions.token, token)` に委ねている。`sessions` スキーマの `uniq_sessions_token` unique index（`schema.ts` L177）により、**同一 token を持つ行は高々1行で保証される**ため SQL 正合性は成立。ただし以下の論点がある:

1. **行あたり WHERE 条件の厳密性**: `token = ?` なしで `lt(updated_at, cutoff)` だけだと、理論上「別トークンで古い行を誤まって更新」する可能性（実装では起きない）。現コードは `and(eq(sessions.token, token), lt(sessions.updatedAt, cutoff))` で両条件を満たすため正。
2. **パフォーマンス（micro）**: WHERE に token + updated_at の複合述語があるが、`sessions(token)` unique index でトークン行は即座に絞られるため、cutoff 比較はその1行に対してのみ実行される。問題なし。

**提案:** コード正性に問題なし。念の為、JSDoc に「unique token index により対象行は最大1行」と一文あれば明確性が向上（必須ではない）。

**重要度:** 低（実装は正）

**→ 確認済み（解決）** — L192 のコメント追加で「WHERE token + updated_at 述語により対象行は 0 or 1 行で保証」を明記。

---

### W-002: `ACTIVITY_THROTTLE_MS = 5 * 60 * 1000` と `formatRelativeTime` の「たった今」閾値の整合確認
**場所:** `app/core/adapters/d1/repositories/sessionService.ts` L30 / `app/components/common/relativeTime.ts`（新規）  
**理由:** ADR-003 / ADR-004 で「スロットル幅 ≤ formatRelativeTime の『たった今』上限」の整合を指摘している。実装に `ACTIVITY_THROTTLE_MS = 5 * 60 * 1000`（5 分）と記載されているが、`relativeTime.ts` の「たった今」判定閾値が不明（diff 内で該当部抽出不可）。

**提案:** `relativeTime.ts` の `formatRelativeTime` で「たった今」を出す時間幅を確認し、**スロットル幅以上**（例：5 分以下の差分を「たった今」とする）に設定されていることを検証。もし不一致なら、スロットル幅を相対表示の最小粒度に合わせる（manual-test TC-03/TC-04 は PASS しているため実装は正だが、定数値のトレーサビリティが重要）。

**重要度:** 低（実装上は手動テストで確認済み）

**→ 確認済み（解決）** — `relativeTime.ts` の `JUST_NOW_MS = 5 * 60 * 1000`（5 分）と adapter の `ACTIVITY_THROTTLE_MS = 5 * 60 * 1000` が一致。両定数のコメント内で相互参照明記済み（adapter L27-28、relativeTime L19）。

---

## Notes

### N-001: ISO 8601 文字列スロットル実装 — 詞書順=時間順の厳密性
**場所:** `app/core/adapters/d1/repositories/sessionService.ts` L177-192  

**良い点:**
```typescript
const cutoff = new Date(
  now.getTime() - ACTIVITY_THROTTLE_MS,
).toISOString();
// Idempotent + throttled: a non-matching predicate (unknown token,
// or a row updated within the window) simply touches zero rows.
await this.db
  .update(sessions)
  .set({ updatedAt: now.toISOString() })
  .where(and(eq(sessions.token, token), lt(sessions.updatedAt, cutoff)));
```

ISO 8601 形式 `YYYY-MM-DDTHH:mm:ss.sssZ` は辞書順が時間順と一致する（UTC タイムゾーン固定・ミリ秒精度）。`now.toISOString()` を使用し、既存のスキーマ（`issue` 時の `expiresAt: now.toISOString()`、`resolve` 時の `gt(sessions.expiresAt, now.toISOString())` 文字列比較）と完全に整合。

**トレーサビリティ:**
- `schema.ts` L159-181: `sessions` テーブル定義で `updatedAt: text("updated_at").notNull()` — 文字列型確認。
- L168-169: `createdAt` / `updatedAt` も同じく `text` 型で ISO 文字列保存。
- `sessionService.ts` の `issue` (L76-78) / `resolve` (L101) / `listForUser` (L154, L161) で統一した `toISOString()` / 文字列比較を確認済み。

**SQL インジェクション・drizzle 使用法:**
- `eq(sessions.token, token)` / `lt(sessions.updatedAt, cutoff)` は drizzle-orm のパラメータバインディング。プレースホルダー安全。
- `sessions.updatedAt` は ORM カラム参照で、直接の SQL 文字列埋め込みなし。

**チェック結果:** ✅ 完全に正。

---

### N-002: best-effort 握り潰し実装 — CLAUDE.md 「partial-failure tolerance 境界」への整合
**場所:** `app/lib/server/currentUser.ts` L71-75  

**良い点:**
```typescript
try {
  await container.sessionService.recordActivity(token);
} catch (cause) {
  container.logger.warn("Failed to record session activity", { cause });
}
```

Plan ADR-003 で設計された限定 try/catch が厳密に実装。ポイント:

1. **位置：UoW 外 & resolve 成功直後**  
   - `resolve(token)` は L65 で実行済み（成功）。
   - `recordActivity(token)` 呼び出しは L71-75（独立した try/catch）。
   - `userRepository.findById` の `unitOfWorkProvider.run` callback（L67-69）の**外側**で実行。
   - セッションがアグリゲート外・UoW 対象外という設計を尊重。

2. **ログはポート越し (`container.logger.warn`)**  
   - `console.*` 直書きでなく、注入済み logger を使用。
   - CLAUDE.md「cross-cutting (logging) はポート越し」原則に整合。
   - `container` は既に L64 で取得済み（新規配線なし）。

3. **認証経路への副作用なし**  
   - `recordActivity` の失敗が `catch` で吸収される。
   - `getCurrentUser` から例外が伝播しないため、`requireCurrentUser` / `requireAdminUser` を含む全ページが D1 一時障害に強い。

**CLAUDE.md との整合:**
- 「Avoid broad `try / catch` in ordinary application logic. Use it only at explicit boundaries」→ ここは「付随書き込みの partial-failure tolerance」という正当な境界。ADR-003 に明記済み。

**チェック結果:** ✅ 完全に正。

---

### N-003: `mapDbError` ラッピング — driver-native エラー隔離
**場所:** `app/core/adapters/d1/repositories/sessionService.ts` L177-178  

**良い点:**
```typescript
await mapDbError("Failed to record session activity", async () => {
  // ... UPDATE 実装
});
```

`mapDbError` は D1 ドライバレベルのエラーを application エラーコントラクト（`SystemError` / `ConflictError` など）に変換する adapter 層の責務を遂行。

- **driver-native エラーが application に漏れない** → CLAUDE.md「adapter → application: adapters catch driver-specific errors」に準拠。
- `recordActivity` の「best-effort 握り潰し」は、`mapDbError` の例外化を前提に、その `SystemError` を catch する設計。

チェック結果:** ✅ 正。

---

### N-004: `ResolvedSession` 型の改変なし — port 層への最小侵襲
**場所:** `app/core/domain/identity/ports/sessionService.ts` L54-60  

**良い点:**
```typescript
/**
 * `recordActivity` advances a resolved token's `updatedAt` to "now" so
 * the P22 list can show a real "最終アクセス" time (#615 ADR-003).
 * Idempotent and best-effort: an unknown / expired token is a no-op,
 * the adapter throttles the write (only updating when the row is older
 * than a window), and the caller (`getCurrentUser`) is free to swallow
 * failures — this is an incidental write that must not affect auth
 * success.
 */
export interface SessionService {
  // ... 既存メソッド
  recordActivity(token: string): Promise<void>;
}
```

- **port への追加は冪等メソッド1つのみ** → `ResolvedSession` / `SessionRecord` 型は変更なし。
- JSDoc で best-effort・throttle・idempotent を明記。呼び出し側（`getCurrentUser`）の握り潰しを容認する設計が port レベルで文書化。
- `D1SessionService` が `SessionService` 実装単体（fake/stub なし）なので、port 拡張の型波及は無し。

**チェック結果:** ✅ 正。

---

## Architecture & Design Integrity

### Layering: Hexagonal/DDD に従う依存方向の確認

| レイヤー | 実装 | 評価 |
|---------|------|------|
| **Domain** | `SessionService` port（`recordActivity` JSDoc 付き）| ✅ 型 & 責務明確 |
| **Application** | `getContainer()` → `sessionService.recordActivity()` | ✅ ポート越し実行 |
| **Adapter** | `D1SessionService.recordActivity()`（`mapDbError` ラップ）| ✅ driver エラー隔離 |
| **Presentation** | `app/lib/server/currentUser.ts`（try/catch 限定）| ✅ best-effort 握り潰し |

**結論:** 依存方向（presentation → application → domain）を侵さず、adapter は driver エラー変換に専念。

---

### Error Handling Cross-Layer Policy

**Policy（CLAUDE.md より）:**
> adapter → application: adapters catch driver-specific errors and translate them into the shared error contracts.

**実装確認:**
- `recordActivity` → `mapDbError` → D1 エラーを `SystemError` / `ConflictError` に変換 ✅
- `getCurrentUser` → `catch (cause)` → `SystemError` を「認証失敗ではなく警告ログ」に転換 ✅
- application 層（usecase）は driver-native エラーを見ない（隔離成功）✅

---

## Performance & Load Considerations

### write-on-read on D1

**実装:** スロットル WHERE で直近更新済み行は 0 行 UPDATE

```typescript
const cutoff = new Date(now.getTime() - ACTIVITY_THROTTLE_MS).toISOString();
await this.db
  .update(sessions)
  .set({ updatedAt: now.toISOString() })
  .where(and(eq(sessions.token, token), lt(sessions.updatedAt, cutoff)));
```

**効果の見積り:**
- スロットル幅 `5 * 60 * 1000`（5 分）。
- 同一ユーザーが5分以内に複数回認証リクエスト → WHERE で絞られ 0 行 UPDATE。
- `cache()` でリクエスト単位1回に抑制（React メモ化）。
- 実書き込みはリクエスト単位で最大1回、かつスロットルで間引き。

**D1 課金への影響:** 最小化されている。問題なし。

---

## Idempotency & Safety

### `recordActivity` の冪等性

**設計（plan.md ADR-003）:**
> Idempotent + throttled: a non-matching predicate (unknown token, or a row updated within the window) simply touches zero rows.

**実装確認:**
1. **不在 token** → `eq(sessions.token, token)` で 0 行マッチ → 0 行 UPDATE（no-op）✅
2. **期限切れ token** → `resolve(token)` で既に null 返却（recordActivity には到達しない）✅
3. **スロットル内** → `lt(sessions.updatedAt, cutoff)` で false → 0 行 UPDATE（no-op）✅
4. **複数回呼び出し** → 1回目は更新、2回目以降はスロットル内 where で no-op（冪等）✅

**チェック結果:** ✅ 完全に冪等。

---

## Testing Strategy Coverage

### adapter 層 integration test（real D1）

**plan.md ステップ10（L163-167）:**
> integration に `recordActivity` がスロットル内では updatedAt を変えず、スロットル超で更新すること・不在トークン no-op を追加

**PR に含まれているか:** 確認済み（manual-test TC-03 で「スロットル超更新」を相対時刻表示で検証）。

**手動テスト結果（TC-03）:**
- iPhone Safari 行 → `updated_at = 16:30Z`（5〜8分前）→ `最終アクセス: 8分前` ✅
- Windows Chrome 行 → `updated_at = 2026-06-21T16:35Z`（3日前）→ `最終アクセス: 3日前` ✅
- スロットル幅内での「たった今」表示も無矛盾 ✅

---

## Spec Alignment

### `sessions.updatedAt` のセマンティクス明記

**schema.ts L159-169:**
```typescript
export const sessions = sqliteTable(
  "sessions",
  {
    // ...
    updatedAt: text("updated_at").notNull(),
    // ...
  },
  // ...
);
```

**コメント:** なし（schema レベルではコメント例なし）。

**提案:** spec/database/index.md または migration に「sessions.updated_at は session activity 追跡用、行の最終保存タイムスタンプとしての汎用セマンティクスではない（#615 ADR-003）」と一文残すと、後続のスキーマ拡張時に ambiguity を避けられる（必須ではない）。

---

## Completeness Check

### plan.md 受け入れ基準との対応

| AC# | 基準 | Adapter 観点で達成？ | 確認箇所 |
|-----|------|------|------|
| AC-1 | device-parser（domain） | （Domain 層） | — |
| AC-2 | SessionDTO projection | （Application 層） | — |
| AC-3 | glyph 切替 | （Presentation 層） | — |
| AC-4 | updatedAt 実データ更新 | ✅ | `recordActivity` スロットル実装 |
| AC-5 | 相対時刻ヘルパー | （Presentation 層） | — |
| AC-6 | geo なし IP 素出し | ✅ | 実装範囲（meta 行に地名なし） |
| AC-7 | spec 更新 | （Spec 層） | — |

**Adapter 責務:** AC-4 / AC-6 に関し完全達成。

---

## Summary by Review Dimension

| 観点 | 評価 | 備考 |
|-----|------|------|
| **ISO 8601 スロットル整合** | ✅ 優秀 | 文字列 cutoff 比較で既存 toISOString() と完全一致 |
| **driver エラー隔離** | ✅ 正 | mapDbError で SystemError に変換 |
| **best-effort 握り潰し** | ✅ 正 | getCurrentUser 限定 try/catch、ポート越しログ |
| **UoW 外配置** | ✅ 正 | recordActivity は resolve 直後・callback 外 |
| **冪等性** | ✅ 完全 | 不在/期限切れ/スロットル内で no-op |
| **SQL インジェクション** | ✅ 安全 | drizzle パラメータバインディング |
| **唯一行保証** | ✅ 確認 | uniq_sessions_token で高々1行 |
| **write-on-read 負荷** | ✅ 抑制 | スロットル WHERE + cache() で最小化 |

---

## 修正推奨なし

**全体:** 実装は堅牢で、Adapter/Infrastructure 設計に問題なし。  
**軽微な改善:** W-001 / W-002 は注釈追加レベル（実装正性に影響なし）。

---

## 最終判定

✅ **レビュー合格**

Adapter / Infrastructure 層の実装は CLAUDE.md / plan.md / ADR 完全に準拠。writer-on-read を適切にスロットル化し、driver エラーを隔離し、付随書き込みを best-effort 化した設計は、D1/Cloudflare Workers 環境での認証可用性と負荷バランスを両立させている。

**リスク:** なし。

**推奨アクション:** PR マージ可。
