# レビュー: Issue #615 — Adapter / Infrastructure 観点（Round 2・再レビュー）

**PR:** 775 / **対象ブランチ:** issue/615/mobile-admin-nav-links  
**実装計画:** `.issue/615/plan.md` / **設計判断:** `.issue/615/adr.md`  
**レビュー日:** 2026-06-25 / **レビュアー:** Claude Code (Adapter/Infrastructure specialist)  
**レビュー段階:** Round 2（再レビュー）

---

## Executive Summary

**全体評価:** ✅ **Blockers: 0 / Warnings: 0 / Notes: 1**

Round 1 で指摘した W-001・W-002 を含む全 warning は確認・対応完了。再レビューで新たな Blocker/Warning は検出されず。ISO 8601 文字列スロットル、best-effort 握り潰し、UoW 外配置、ポート越しログ、冪等性が完璧に実装されている。

---

## Round 1 Findings の確認と対応状況

### W-001: `recordActivity` の WHERE スロットル述語に `eq(sessions.token, token)` 含有の確認

**状態:** ✅ **解決済み**

**確認:**
```typescript
// sessionService.ts L187-193
// WHERE token + updated_at predicate ensures at most one row matches
// (unique index on token guarantees high-cardinality, and cutoff
// throttles the window). The row is 0–1, never >1.
await this.db
  .update(sessions)
  .set({ updatedAt: now.toISOString() })
  .where(and(eq(sessions.token, token), lt(sessions.updatedAt, cutoff)));
```

- `and(eq(sessions.token, token), lt(sessions.updatedAt, cutoff))` で両述語を満たす行が対象。
- schema.ts L177: `uniqueIndex("uniq_sessions_token")` により同一 token の行は高々 1 行に保証。
- コメント L188-189: 「WHERE token + updated_at 述語により対象行は 0 or 1 行で保証」と明記済み。
- **正性:** ✅ 完全に正。

---

### W-002: `ACTIVITY_THROTTLE_MS` と `formatRelativeTime` の「たった今」閾値の整合確認

**状態:** ✅ **解決済み**

**確認:**
```typescript
// sessionService.ts L30
const ACTIVITY_THROTTLE_MS = 5 * 60 * 1000;

// relativeTime.ts L18
const JUST_NOW_MS = 5 * 60 * 1000;

// relativeTime.ts L6-10 (JSDoc)
// Buckets: "たった今" (within {@link JUST_NOW_MS}) → "N 分前" → "N 時間前"
// → "N 日前", and past {@link ABSOLUTE_THRESHOLD_DAYS} it falls back to an
// absolute `ja-JP` date. The "たった今" window is kept ≥ the session
// activity throttle (`ACTIVITY_THROTTLE_MS`, #615 ADR-003 / ADR-004) so a
// just-active session does not read as "N 分前".
```

- 両定数が 5 分で一致。
- relativeTime.ts の JSDoc で「ACTIVITY_THROTTLE_MS との整合」を明記。
- sessionService.ts L27-28 でも相互参照コメント記載済み。
- manual-test TC-03/TC-04 で全粒度（たった今/分/時間/日）確認済み。
- **正性:** ✅ 完全に整合。

---

## Round 2 での新規検査項目

### ISO 8601 文字列スロットルの実装正性（再確認）

**チェック項目:**
1. ✅ `cutoff = new Date(now.getTime() - ACTIVITY_THROTTLE_MS).toISOString()` で時間差計算。
2. ✅ `lt(sessions.updatedAt, cutoff)` で文字列辞書順比較。
3. ✅ ISO 8601 形式（`YYYY-MM-DDTHH:mm:ss.sssZ`）は辞書順 = 時間順が保証。
4. ✅ 既存の `issue` / `resolve` / `listForUser` でも同じ `toISOString()` 使用で一貫。
5. ✅ schema.ts L169: `updatedAt: text("updated_at").notNull()` で文字列型確認。

**結論:** ✅ ISO 8601 スロットル完璧。

---

### best-effort 握り潰しの実装（再確認）

**チェック項目:**
```typescript
// currentUser.ts L71-75
try {
  await container.sessionService.recordActivity(token);
} catch (cause) {
  container.logger.warn("Failed to record session activity", { cause });
}
```

1. ✅ `recordActivity` 呼び出しのみを限定 try/catch で囲む。
2. ✅ 失敗は logger.warn で記録（console 直書きでなくポート越し）。
3. ✅ 例外が伝播せず、認証経路（全ページ）が D1 障害に強い。
4. ✅ `resolve` は L65 で成功済み（認証は完結）。
5. ✅ UoW callback（L67-69）の**外側**で実行（セッション ∉ アグリゲート）。
6. ✅ `container.logger` は既存注入済み（新規配線なし）。
7. ✅ CLAUDE.md「partial-failure tolerance 境界」に準拠。

**結論:** ✅ best-effort 握り潰し完璧。

---

### Port 層への最小侵襲（再確認）

**チェック項目:**
```typescript
// sessionService.ts L54-70
export interface SessionService {
  issue(userId: UserId, meta: SessionMeta): Promise<IssuedSession>;
  resolve(token: string): Promise<ResolvedSession | null>;
  revoke(token: string): Promise<void>;
  revokeAllForUser(userId: UserId, except?: string): Promise<number>;
  listForUser(userId: UserId): Promise<readonly SessionRecord[]>;
  revokeByIdForUser(userId: UserId, sessionId: string): Promise<void>;
  recordActivity(token: string): Promise<void>;
}
```

1. ✅ `recordActivity(token: string): Promise<void>` のみ追加（1 メソッド）。
2. ✅ 既存型（`ResolvedSession`, `SessionRecord` など）は変更なし。
3. ✅ JSDoc L54-60 で best-effort・throttle・idempotent を明記。
4. ✅ D1SessionService が実装単体（fake/stub なし）なので型波及なし。

**結論:** ✅ Port 層への侵襲最小。

---

### mapDbError ラッピング（再確認）

**チェック項目:**
```typescript
// sessionService.ts L177-178
await mapDbError("Failed to record session activity", async () => {
  // ... UPDATE実装
});
```

1. ✅ D1 driver-native エラーを application エラーコントラクトに変換。
2. ✅ SystemError / ConflictError など CLAUDE.md「adapter → application」に準拠。
3. ✅ 例外が application 層に漏れない（隔離成功）。

**結論:** ✅ マッピング正。

---

### 冪等性の検証（再確認）

**ケース 1: 不在 token**
- `eq(sessions.token, token)` で 0 行マッチ → 0 行 UPDATE（no-op）✅

**ケース 2: スロットル内に複数回呼び出し**
- 1 回目: 条件満たす → UPDATE。
- 2 回目: `lt(sessions.updatedAt, cutoff)` で false → 0 行（no-op）✅

**ケース 3: 期限切れ token**
- `resolve(token)` で既に null 返却 → `recordActivity` 呼ばれない。
- 仮に呼ばれても不在扱い → no-op ✅

**結論:** ✅ 完全に冪等。

---

## Notes

### N-001: スロットル WHERE の複合述語と unique index の相互作用

**場所:** sessionService.ts L177-193 / schema.ts L177  
**評価:** ✅ 非常に良い

**観点:**
- unique token index で「高々 1 行」が保証。
- WHERE で「該当行が old enough（cutoff 超過）」を追加条件。
- 結果: 「該当行が存在 AND old enough」の場合のみ UPDATE → 0 or 1 行。
- 無駄な行スキャンがない（index で高速絞込後、cutoff 判定は 1 行に対してのみ）。

**コメント L188-189:**
```typescript
// WHERE token + updated_at predicate ensures at most one row matches
// (unique index on token guarantees high-cardinality, and cutoff
// throttles the window). The row is 0–1, never >1.
```

このコメントが複合述語の設計意図を完璧に説明。

**結論:** ✅ 最適な設計。

---

## Architecture & Design Integrity（Round 2 確認）

### Hexagonal/DDD 依存方向の保持

| レイヤー | 変更内容 | 依存方向 | 評価 |
|---------|---------|---------|------|
| **Domain** | port に `recordActivity` JSDoc 追加 | — | ✅ 型・責務明確 |
| **Application** | `getContainer()` → `sessionService.recordActivity()` | application → domain port | ✅ ポート越し実行 |
| **Adapter** | `D1SessionService.recordActivity()` + `mapDbError` | adapter → application エラー層 | ✅ driver エラー隔離 |
| **Presentation** | `currentUser.ts` 内 try/catch | presentation → application (logger port) | ✅ 最小侵襲 |

**結論:** ✅ 依存方向完全保持。

---

### Cross-Layer Error Handling Policy

**CLAUDE.md ポリシー:**
> adapter → application: adapters catch driver-specific errors and translate them into the shared error contracts.

**実装確認:**
```
D1 エラー → mapDbError → SystemError/ConflictError
                           ↓
                    currentUser.ts catch
                           ↓
                    logger.warn (握り潰し)
                           ↓
                    認証経路に例外伝播なし
```

✅ 完全準拠。

---

## Performance & Load（Round 2 確認）

### write-on-read 抑制効果の検証

**スロットル WHERE の効果:**
- 5 分以内に複数リクエスト → WHERE で 0 行 UPDATE。
- `cache()` でリクエスト単位 1 回に抑制。
- 実書き込み: リクエスト単位で最大 1 回、かつ 5 分間隔で間引き。

**D1 課金への影響:** 最小化。write オペレーションが大幅削減。

✅ 問題なし。

---

## Testing Coverage（Round 2 確認）

### Manual Test Results
- **TC-01**: device-parser ラベル表示 → PASS
- **TC-02**: device-kind 別アイコン切替 → PASS
- **TC-03**: 最終アクセス相対時刻表示（たった今/分/時間/日） → PASS
- **TC-04**: 相対時刻ヘルパー粒度（たった今〜絶対日付） → PASS
- **TC-05**: geo なし IP 素出し → PASS

✅ 全 TC PASS。

---

## Blockers（Round 2）

**なし**

Round 1 の W-001・W-002 が確認・対応されており、再レビューで新たな blocker は検出されない。

---

## Warnings（Round 2）

**なし**

Round 1 で指摘した warning も対応完了。新規 warning なし。

---

## 最終判定（Round 2）

✅ **レビュー合格**

Adapter / Infrastructure 層の実装は:
- ISO 8601 文字列スロットルで write-on-read を適切に抑制
- `mapDbError` で driver エラーを隔離
- best-effort 握り潰しで認証可用性を保証
- 冪等な WHERE 述語で安全な 0 or 1 行更新を実現
- UoW 外配置でセッションのトランザクション外分離を徹底
- ポート越しログで CLAUDE.md cross-cutting 原則に準拠

**リスク:** なし

**推奨アクション:** PR マージ可能
