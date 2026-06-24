# PR #775 レビュー（Round 2） — Domain & Application 層

**リビジョン:** PR #775  
**対象:** Issue #615（P22 セッション一覧表示リッチ化）  
**レビュー観点:** Domain・Application 層の設計・実装の厳密性（Round 1 修正後）  
**レビュー日:** 2026-06-25

---

## 概要

PR #775 は Issue #615 の実装を完結させ、Round 1 レビューの指摘（[P-001] ~ [P-003]）を反映して修正された。現レビューは修正後の最終判定を行う。overall design は堅牢で、Round 1 で指摘された **3つのblocking問題は全て解決済み** である。

---

## Domain 層

### AC-1: device-parser 純粋関数 ✓

**対象ファイル:** `app/core/domain/identity/services/deviceInfo.ts`

**判定:** Round 1 と変わらず **完全に正しい**。

**確認点:**
- 入力: `userAgent` 文字列のみ（null 許容）
- 出力: `DeviceInfo` 値オブジェクト（`kind | os | browser | label`）
- 副作用なし: I/O、時刻参照、乱数なし ✓
- 判別不能フィールドを null で統一 ✓
- lazy label 合成（`os !== null && browser !== null` の場合のみ）✓

**テスト:** `deviceInfo.test.ts` が代表 UA 5 種・Edge 優先順序・未認識 UA・partial match・null/空文字列を網羅 ✓

---

### AC-2: DeviceInfo DTO 貫通・虚偽表示禁止 ✓

**対象ファイル:** `app/core/application/dto/identity.ts`

**判定:** **正しい**。依存方向を侵さず、虚偽表示を防ぐ設計。

**根拠:**
- `DeviceInfo` はプリミティブのみで wire-safe ✓
- presentation が domain を直接 import していない（`SessionDTO` 経由のみ） ✓
- DTO projection で `parseDeviceInfo` を呼び出し（application 層） ✓

**JSDoc品質:** ✓

```typescript
/**
 * Parsed OS / browser / device-kind summary of `userAgent`. Projected
 * here (application layer) so the presentation surface receives settled
 * values rather than re-parsing. Indeterminate fields are `null` — the
 * parser never fabricates a device name (#615 ADR-001). The raw
 * `userAgent` is retained alongside this for fallback / transparency.
 */
```

虚偽表示禁止原則を明示。

**edge case:** `SessionDTO.updatedAt` の意味がドメイン層では「行の最終保存」から application/presentation では「セッション活動時刻」へ確大している。ただし `toSessionDTO` の JSDoc（L78-84）が明確に改訂され、freshly issued session が `updatedAt == createdAt` になることも「仕様、バグでない」と説明している ✓

---

## Application 層

### AC-4: recordActivity Port 設計 ✓✓

**対象ファイル:** `app/core/domain/identity/ports/sessionService.ts`

```typescript
export interface SessionService {
  recordActivity(token: string): Promise<void>;
}
```

**JSDoc:** 詳細・正確（L54-60）

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
```

**判定:** ✓✓ **完全に正しい**。

- best-effort 契約を明示 ✓
- 멱等성 보장 ✓
- 스로틀이 adapter 책임임을 명시 ✓
- port 는 최소 신규 추가만 ✓

---

### AC-4 (continued): recordActivity 호출 위치 — getCurrentUser ✓✓

**대상 파일:** `app/lib/server/currentUser.ts` (L61-77)

```typescript
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const token = readSessionToken(getRequestHeaders());
  if (token === null) return null;
  const container = await getContainer();
  const resolved = await container.sessionService.resolve(token);
  if (resolved === null) return null;
  const found = await container.unitOfWorkProvider.run(({ userRepository }) =>
    userRepository.findById(resolved.userId),
  );
  if (found === null) return null;
  try {
    await container.sessionService.recordActivity(token);  // L72
  } catch (cause) {
    container.logger.warn("Failed to record session activity", { cause });
  }
  return found.entity;
});
```

**판정:** ✓✓ **Round 1 指摘の3つのblocking問題がすべて解決されている**

#### [P-001] recordActivity 失敗が認証経路を落とす → **解決済み**

**修正内容:**
- `recordActivity` 呼び出しのみを限定的な `try/catch` で囲む（L71-75）
- 失敗をログのみに留めて握り潰す ✓
- **best-effort 設計** が JSDoc に明記（L52-57）
  ```
  The `server-only` import at the top blocks
  accidental client-graph inclusion.

  `recordActivity` advances the session's "最終アクセス" time and is
  fired after a successful `resolve` (#615 ADR-003). It is best-effort:
  the write is idempotent and adapter-throttled (safe to run more than
  once per request — the `cache()` at-most-once is an optimisation, not
  a correctness premise), and any failure is swallowed with a logged
  warning so an incidental D1 write error never fails authentication.
  ```

**評価:** ✓ **正当な boundary として CLAUDE.md に整合** — 「付随書き込みの partial-failure tolerance」という正当な例外を ADR-003 で明記しており、broad try/catch 禁止の原則に反さない。

#### [P-002] getCurrentUser の read-only 意味変化 → **解決済み**

**修正内容:**
- JSDoc を明確に改訂（L42-59）
  ```
  The helper goes through `getContainer()` directly because it is a
  read + best-effort activity-touch (sessionService.resolve +
  userRepository read, then a throttled `recordActivity`) that does not
  need a usecase wrapper.
  ```
- 副作用が入ることを **明示的に宣言** ✓
- `cache()` の「1 回保証」を負荷見積りの前提から **best-effort 最適化** に変更（L55-56）
  ```
  (safe to run more than once per request — the `cache()` at-most-once
  is an optimisation, not a correctness premise)
  ```

**評価:** ✓ **設計上の判断を明確に宣言** — 副作用の意味・スコープ・失敗時の扱いが all in JSDoc と ADR に記載。呼び出し側が「なぜ try/catch があるのか」を理解できる。

#### [P-003] スロットル WHERE と ISO 文字列スキーマの整合 → **解決済み**

**修正内容:** `app/core/adapters/d1/repositories/sessionService.ts` (L177-195)

```typescript
async recordActivity(token: string): Promise<void> {
  await mapDbError("Failed to record session activity", async () => {
    const now = this.clock.now();
    // `updated_at` is stored as an ISO 8601 string (see `issue`), so the
    // throttle compares strings — ISO 8601 is lexicographically ordered
    // by time — rather than relying on SQLite `datetime()` arithmetic,
    // which would not match the stored representation.
    const cutoff = new Date(
      now.getTime() - ACTIVITY_THROTTLE_MS,
    ).toISOString();
    // WHERE token + updated_at predicate ensures at most one row matches
    // (unique index on token guarantees high-cardinality, and cutoff
    // throttles the window). The row is 0–1, never >1.
    await this.db
      .update(sessions)
      .set({ updatedAt: now.toISOString() })
      .where(and(eq(sessions.token, token), lt(sessions.updatedAt, cutoff)));
  });
}
```

**評価:** ✓✓ **正確かつ定教** — 

1. **ISO 8601 文字列直接比較** — SQLite `datetime()` を使わず、app 層で cutoff を計算（L184-186）
2. **既存スキーマとの整合** — `issue` の `now.toISOString()`（L78）と同じ表現を使用
3. **lexicographic ordering** — ISO 8601 は時系列で辞書順序が一致するため、文字列比較で大小が保証される ✓
4. **멱等성 + 스로틀 + no-op** — 直近更新内 → 0 行 UPDATE ✓
5. **JSDoc の透徹性** — なぜ SQLite `datetime()` を使わないか、理由が明記（L180-183） ✓

**スロットル幅の一貫性:**
- `ACTIVITY_THROTTLE_MS = 5 * 60 * 1000` (L30)
- `formatRelativeTime` の `JUST_NOW_MS = 5 * MINUTE_MS` (L291) と **正確に一致** ✓
- ADR-003 / ADR-004 の「スロットル幅 ≤ relativeTime の最小粒度」を満たす ✓

---

## Cross-Layer 検証

### getCurrentUser の副作用導入 — CLAUDE.md 原則との整合 ✓

**CLAUDE.md から:**
```
Avoid broad `try / catch` in ordinary application logic. Use it only at
explicit boundaries (server-function serialization, per-row tolerance in workers).
```

**現実装の正当性:**
- `getCurrentUser` は presentation 隣接の **lib helper** （application/presentation 界面）
- `recordActivity` 呼び出しのみを限定的に catch → 「付随書き込みの partial-failure tolerance」という **正当な境界** ✓
- ADR-003 で判断を明記 ✓
- JSDoc で意図を宣言 ✓

**評価:** ✓ **CLAUDE.md の厳密な原則と実装の distance がゼロに近い** — catch が必要な理由、スコープ、条件がすべて定義されている。

### SessionDTO.updatedAt の semantics 拡張 ✓

**以前:** 「行の最終保存」一般的なタイムスタンプ  
**現在:** 「セッション活動時刻」（最終アクセス）

**根拠:**
- application layer（`toSessionDTO`）でセマンティクス改訂が明記（L78-84） ✓
- freshly issued session が `updatedAt == createdAt` になることを「仕様」と明記 ✓
- adapter の `recordActivity` で呼び出しごとに進む ✓

**評価:** ✓ **型・実装・JSDoc が一貫** — column の overload は application 層で「明示的に」されている。

---

## テスト カバレッジ

| 層 | テスト | ファイル | 状態 |
|---|---|---|---|
| Domain | parseDeviceInfo pure function | `deviceInfo.test.ts` | ✓ Complete |
| Application | toSessionDTO projection | `dto/identity.test.ts` | ✓ Complete |
| Adapter | recordActivity idempotent + throttle | `identity.integration.test.ts` | ✓ Complete |
| Presentation | relativeTime formatter + boundaries | `relativeTime.test.ts` | ✓ Complete |
| Integration | manual browser test | `.issue/615/manual-test/` | ✓ Complete |

---

## Blockers

**なし。** Round 1 の3つの blocking 問題はすべて解決済み。

---

## Warnings

**なし。** 実装が厳密で、設計判断が JSDoc / ADR に明記されている。

---

## Notes

- **[N-001] スロットル幅と relativeTime の正確な一致** — `ACTIVITY_THROTTLE_MS = JUST_NOW_MS = 5min` で完全に同期されている。両定数を調整する際には必ず併せて変更する必要がある設計になっており、一貫性が高い ✓

- **[N-002] getCurrentUser の JSDoc 改訂の精度** — Round 1 指摘の「read-only から read+activity-touch へ」の意味変化を、JSDoc が明確に宣言している。呼び出し側（ページ層）が「副作用がある」ことを理解して使える ✓

- **[N-003] best-effort 境界の正当性** — CLAUDE.md「broad try/catch は境界のみ」の境界定義が、「付随書き込みの partial-failure tolerance」として ADR-003 に明記されている。後続のアーキテクチャ監査で「なぜここに catch があるか」を question する際の基準が明確に存在する ✓

- **[N-004] 虚偽表示禁止原則の一貫適用** — device-parser の null field（判別不能）、sessionTitle の優先順位폴백（label → userAgent → 不明な端末）、아이콘의 unknown=汎用 glyph、AD-005 でのログイン日時の実データ表示…すべてが「추측 x, 實데이터만」原則を구현하고있음 ✓

- **[N-005] ADR-005 による SSOT 乖離の意図化** — モック（2行構成: device·IP / 最終アクセス）に対して、実装が 3行構成（IP / 最終アクセス / ログイン日時）になっている。ただし ADR-005 が「理由: 実データ・#572 との整合・透明性」と明記しており、乖離が**意図的で許容可能**な判断として記録されている ✓

- **[N-006] `recordActivity` の멱等성 + WHERE 스로틀** — 「複数回呼ばれても害がない」設計が adapter 層（UPDATE の WHERE 조건）で体現されている。`cache()` が1回保証しないという仮定の下でも안전하다는점이秀逸。`getCurrentUser` の memoization は **최적화**, not **correctness premise** として扱われている ✓

---

## 최종 평가

**Domain & Application 设계: 10 / 10**

✓ 순수 함수 (domain), 투명한 projection (application), 명확한 포트 (adapter)  
✓ 虚偽표시禁止の타입/구현 이중 방어  
✓ best-effort semantics の명시적 boundary화  
✓ スロットル幅と相対時間表示の정교한 일관성  
✓ Round 1 指摘の3つの blocking 问题が완벽하게 해결됨  
✓ JSDoc / ADR による設計判断の full transparency  

---

## 推奨

**通過 ✓** — Domain & Application 層の設計・実装に問題なし。高い品質基準を満たしている。
