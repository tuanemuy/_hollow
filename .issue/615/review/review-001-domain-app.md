# PR #775 レビュー — Domain & Application 層

**リビジョン:** PR #775  
**対象:** Issue #615（P22 セッション一覧表示リッチ化）  
**レビュー観点:** Domain・Application 層の設計・実装の厳密性  
**レビュー日:** 2026-06-25

---

## 概要

PR #775 は Issue #615 の実装を完結させ、device-parser・相対時刻ヘルパー・活動時刻更新メカニズム（recordActivity + スロットル）を段階導入する。Domain 層に純粋な `parseDeviceInfo` を置き、Application 層で `SessionDTO` に projection し、Adapter で WHERE スロットル付き `recordActivity` を実装する。overall design は堅牢。

---

## Domain 層

### AC-1: device-parser 純粋関数 ✓

**対象ファイル:** `app/core/domain/identity/services/deviceInfo.ts`

```typescript
export function parseDeviceInfo(userAgent: string | null): DeviceInfo
```

**判定:** 完全に正しい。

**確認点:**
- 入力: `userAgent` 文字列のみ（null 許容）
- 出力: `DeviceInfo` 値オブジェクト（`kind | os | browser | label` の Readonly タプル）
- **副作用なし**: I/O、時刻参照、乱数なし
- **判別不能フィールドを null で統一**: OS 不明なら `os: null`、ブラウザ不明なら `browser: null`、両方確定してはじめて `label: "Browser on OS"`
- **lazy label 合成**: `label` は `os !== null && browser !== null` の場合のみ合成（L46）。一方欠落なら `null`。これにより「`browser` のみ判明→`"Safari"` 単独表示」のような虚偽表示の可能性を排除

**テスト:** `app/core/domain/identity/services/__tests__/deviceInfo.test.ts`
- 代表 UA 5 種（macOS Safari / Windows Chrome / iPhone / iPad / Android phone/tablet）で正しく判定 ✓
- Edge（Chrome + Safari トークン含む）の優先順序をテスト ✓
- 未認識 UA（`CustomAgent/9.9`）で all-null を返す ✓
- partial match（OS のみ判明）で label 無し（line 77-84）✓
- null・空文字列で all-unknown ✓

**トークン検出ロジック:**
- `detectOs()` (L51-67): iPad → iPhone/iPod → Android → Windows → macOS → Linux の順序。**iPad を Mac トークン前に検査する理由が JSDoc で明記**（L52-54：「iPadOS が Macintosh を report する」）。**この順序はスペック依存**なので、UA 偽装時に順序逆転で misdetect する可能性がある。**ただし虚偽表示禁止原則上、これは許容できる誤り**（null より good）
- `detectBrowser()` (L69-78): Edge → Firefox → Chrome → Safari の逆優先度。**Edge 優先は正しい**（Edge UA に Chrome + Safari トークンを含む）。**Safari の Version/ トークン確認が秀逸**（他のエンジンも Safari を claim するため version check で genuine Safari のみ）
- `detectKind()` (L81-91): os ベースの分岐（iOS=mobile / iPadOS=tablet / Android は Mobile トークンで分岐 / Tablet トークン汎用 / desktop os は desktop）

**potential edge case:** Android の Mobile トークン判定（L85）。Tablet UA が `Mobile` を含む場合、この実装は誤分岐。**ただし実装の基準（Android OS では mobile/tablet を Mobile token で分岐）は業界標準**で、edge case は許容可。

**依存方向:** ✓ ドメイン層が外部ライブラリ非依存（自前パーサ）。type-level で illegal state 不可（DeviceInfo.label は os && browser 時のみ non-null にできない、けど型では表現しないため runtime check に依存）

---

### AC-2: DeviceInfo DTO 貫通・虚偽表示禁止 ✓

**対象ファイル:** `app/core/application/dto/identity.ts` (SessionDTO.device)

```typescript
export type SessionDTO = Readonly<{
  device: DeviceInfo;  // domain型をそのまま載せる
  // ...
}>;
```

**判定:** 依存方向を侵さず、かつ虚偽表示を型・実装で防いでいる。**正しい判断**。

**根拠:**
- `DeviceInfo` がプリミティブのみで構成（string | null）→ wire-safe
- presentation が domain を直接 import してないか確認:
  - `app/components/identity/SecurityForm/index.tsx` L1-50: import は `SessionDTO` のみ（L9）
  - `SessionDTO` import（L9） → `SessionDTO["device"]` へのアクセス（L60, 119）
  - **domain 直接 import なし** ✓
- presentation は `SessionDTO` 経由でのみ参照 → 依存方向内向き（presentation → application → domain）

**DTO projection（toSessionDTO）:**

```typescript
device: parseDeviceInfo(record.userAgent),
```

- application layer（`dto/identity.ts`）で parseDeviceInfo を呼び出し（L149）
- domain 서비스를 application projection 단에서 호출하는 것은 정확한 설계 계층화 ✓

**JSDoc 품질:** ✓
```typescript
/**
 * Parsed OS / browser / device-kind summary of `userAgent`. Projected
 * here (application layer) so the presentation surface receives settled
 * values rather than re-parsing. Indeterminate fields are `null` — the
 * parser never fabricates a device name (#615 ADR-001). The raw
 * `userAgent` is retained alongside this for fallback / transparency.
 */
```
虚偽표시 금지 원칙을 JSDoc에 명시 ✓

---

## Application 層

### AC-4: recordActivity Port 設計 ✓

**対象ファイル:** `app/core/domain/identity/ports/sessionService.ts`

```typescript
export interface SessionService {
  recordActivity(token: string): Promise<void>;
}
```

**추가 JSDoc:**
```typescript
- `recordActivity` advances a resolved token's `updatedAt` to "now" so
  the P22 list can show a real "最終アクセス" time (#615 ADR-003).
  Idempotent and best-effort: an unknown / expired token is a no-op,
  the adapter throttles the write (only updating when the row is older
  than a window), and the caller (`getCurrentUser`) is free to swallow
  failures — this is an incidental write that must not affect auth
  success.
```

**판정:** ✓ 포트 설계가 정확하고 JSDoc이 best-effort 계약을 명시

**평가:**
- **냉등성 없는 port 시그니처** (1 메서드, 명확한 책임)
- **best-effort 명시** (실패 용인, 부수 쓰기)
- **멱등성 보장** (unknown token is no-op)
- **스로틀이 adapter 책임임을 명시** (명확한 계층 분리)

---

### AC-4 (continued): recordActivity 호출 위치 — getCurrentUser ✓

**대상 파일:** `app/lib/server/currentUser.ts`

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
    await container.sessionService.recordActivity(token);  // Line 72
  } catch (cause) {
    container.logger.warn("Failed to record session activity", { cause });
  }
  return found.entity;
});
```

**판정:** ✓ **거의 완벽하나 한 가지 고려사항 있음**

**강점:**
1. **최소 주입** — `resolve` 후 즉시 호출 (L72, callback 외부)
2. **한정적 try/catch** — `recordActivity` 호출만 감싸기 (L71-75)
3. **포트 월스 로깅** — `console` 아님, `container.logger`使用 (L74) ✓
4. **UoW 외부 호출** — callback (L67-69) 외부에서 call (L72)
   - JSDoc (L58-59): "It runs *outside* the `unitOfWorkProvider.run` callback"
   - 세션이 aggregate 외이므로 정확 ✓
5. **JSDoc 개정됨**:
   ```typescript
   /**
    * Resolve the request's session cookie to the owning `User`, or return
    * `null` when no valid session is present. Uses `cache()` so multiple
    * server components within the same request share a single resolution.
    *
    * The helper goes through `getContainer()` directly because it is a
    * read + best-effort activity-touch (sessionService.resolve +
    * userRepository read, then a throttled `recordActivity`) that does not
    * need a usecase wrapper.
    */
   ```
   副作用 명시 ✓

**미묘한 점 (블로커 아님, 노트):**
- **CLAUDE.md 재독:** "broad try/catch는 명시적 경계에서만" (line 68)
  - 현 설계는 "부수 쓰기 partial-failure tolerance"를 정당한 경계로 제시 (ADR-003)
  - **근데 문제: CLAUDE.md는 "worker → root"만 예로 듦**
  - 여기서는 presentation 단의 server function이 아닌 lib helper에서 catch를 하는 것
  - 그런데 JSDoc과 ADR이 정당성을 명시했으므로, 설계는 정확하나 **CLAUDE.md와 약간의 "다른 종류의 경계" 사이에 gap이 있을 수 있음**
  - **이것은 블로커가 아님** (설계가 정당하고 JSDoc이 why를 명시함)

---

### AC-4 (continued): Adapter — recordActivity 스로틀 구현 ✓✓

**대상 파일:** `app/core/adapters/d1/repositories/sessionService.ts`

```typescript
const ACTIVITY_THROTTLE_MS = 5 * 60 * 1000;  // Line 30

async recordActivity(token: string): Promise<void> {
  await mapDbError("Failed to record session activity", async () => {
    const now = this.clock.now();
    const cutoff = new Date(
      now.getTime() - ACTIVITY_THROTTLE_MS,
    ).toISOString();
    await this.db
      .update(sessions)
      .set({ updatedAt: now.toISOString() })
      .where(and(eq(sessions.token, token), lt(sessions.updatedAt, cutoff)));
  });
}
```

**판정:** ✓ **정확하고 정교함**

**강점:**
1. **ISO 8601 문자열 비교** (L184-192)
   - DB 스키마가 `updated_at: string` 저장 (issue에서 `now.toISOString()`)
   - SQLite `datetime()` 아님 (호환 X)
   - **문자열 cutoff 비교는 ISO 8601의 시간순 정렬 특성을 이용**
   - 기존 `expiresAt` 비교와 동일 표현 (L101: `gt(sessions.expiresAt, now.toISOString())`)
2. **멱등성 + 스로틀 + no-op**
   - 직근 업데이트 내 → 0 행 (스로틀 window)
   - 불명 token → 0 행
   - 두 경우 모두 오류 없이 resolve (Promise<void>)
3. **기존 상수 스타일 준수** (L21-22: DEFAULT_SESSION_TTL_MS와 동일)
4. **mapDbError 래핑** (L178) — error 번역 일관성

**스로틀 幅 선택:**
- 5분 (300,000 ms) is JUST_NOW_MS in relativeTime (line 18)
- ADR-003 주장: "스로틀 幅 ≤ '지금 당장' 상한"
- relativeTime (5min) = throttle (5min) → 정확히 일치 ✓

**주의:** adapter 테스트 (integration)에서 confirmed:
- 스로틀 내 → no-op (updated_at unchanged)
- 스로틀 超 → updated_at advanced
- unknown token → no-op

---

## Presentation 層 (참고)

### AC-2 / AC-3: SessionRow 컴포넌트

**대상:** `app/components/identity/SecurityForm/index.tsx`

**device.label 우선순위:**
```typescript
function sessionTitle(session: SessionDTO): string {
  if (session.device.label !== null) return session.device.label;
  const ua = session.userAgent?.trim();
  return ua !== undefined && ua !== "" ? ua : "不明な端末";
}
```

- label (파스된) → userAgent (원문) → 불명 폴백
- **虚僞표시 금지 준수** ✓ (label이 null이면 추측 라벨 X)

**device.kind 기반 아이콘:**
```typescript
function deviceGlyph(kind: SessionDTO["device"]["kind"]) {
  if (kind === "mobile") {
    return <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />;  // 세로
  }
  if (kind === "tablet") {
    return <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />;
  }
  // desktop + unknown both get monitor glyph
  return <>
    <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
    <line x1="8" y1="21" x2="16" y2="21" />
    <line x1="12" y1="17" x2="12" y2="21" />
  </>;
}
```

- desktop / mobile / tablet 각각 다른 glyph
- unknown도 범용 glyph (monitor) — 추측 형태 X (ADR-001 준수) ✓

**최종 접근 표시 (updatedAt):**
```typescript
<div className={SESSION_META}>
  最終アクセス: {formatRelativeTime(session.updatedAt)}
</div>
```
- real data 기반 ✓
- relativeTime helper 사용 ✓

---

### AC-5: formatRelativeTime Helper ✓

**대상:** `app/components/common/relativeTime.ts`

```typescript
const JUST_NOW_MS = 5 * MINUTE_MS;  // 5min = throttle
const ABSOLUTE_THRESHOLD_DAYS = 7;

export function formatRelativeTime(instant: string, now: Date = new Date()): string {
  const then = new Date(instant).getTime();
  const diff = now.getTime() - then;

  if (diff < JUST_NOW_MS) return "たった今";
  if (diff < HOUR_MS) return `${Math.floor(diff / MINUTE_MS)} 分前`;
  if (diff < DAY_MS) return `${Math.floor(diff / HOUR_MS)} 時間前`;

  const days = Math.floor(diff / DAY_MS);
  if (days < ABSOLUTE_THRESHOLD_DAYS) return `${days} 日前`;

  return new Date(instant).toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
```

**판정:** ✓ **정확**

**확인:**
1. **의존 주입** — `now` 매개변수로 테스트 결정성 ✓ (기본값: new Date())
2. **스로틀 일치** — JUST_NOW_MS = 5min = ACTIVITY_THROTTLE_MS ✓
3. **경계 경우 처리:**
   - diff < 0 (미래) → "たった今" 반환 (시계 스큐 방지)
   - boundary test: `5min - 1ms` → "たった今", `5min` → "5 분前" ✓
4. **절대 임계값** — 7일 초과시 `toLocaleDateString("ja-JP")` → "2026年5月8日" ✓

**테스트:** `app/components/common/__tests__/relativeTime.test.ts`
- 시간대 별 경계 (0 / 4min / 5min / 59min / 2hr / 23hr / 3day / 6day / 7day+) ✓
- 미래 시간대 처리 ✓
- 절대 날짜 포맷 ✓

---

## 교차 레이어 문제점

### 1. getCurrentUser의 read-only 의미 변화 (노트)

**파일:** `app/lib/server/currentUser.ts`

**종전:** read-only helper (userRepository.findById)
**현재:** read + best-effort activity-touch (+ recordActivity)

**평가:**
- JSDoc 개정 ✓ ("read + best-effort activity-touch")
- 함수명은 변경 X (getC urrentUser — 시맨틱은 여전히 "현재 user 구하기")
- **다만 side effect (DB write) 추가됨** — CLAUDE.md 원칙 상 "pure functional / stateless"에 약간 어긋남
- **But:** cache()의 semantic과 멱등성 + WHERE스로틀이 이를 보상 ✓
- 호출처는 "authentication flow" 이므로 best-effort 부수 쓰기 허용 범위 내 ✓

**결론:** 정당하나 의도적 선택 기록이 충분하므로 OK

---

### 2. SessionDTO.updatedAt의 의미 확대 (노트)

**종전:** "row's last-saved time (any mutation)" — 업데이트 타임스탬프
**현재:** "session activity time" — 최종 접근 시각

**평가:**
- `toSessionDTO` JSDoc 개정 (L78-84) ✓
  ```typescript
  /**
   * Last session-activity time. Advanced (throttled, best-effort) on each
   * `resolve` via `SessionService.recordActivity` (#615 ADR-003), so this
   * is now a meaningful "最終アクセス" value the UI may surface. For a
   * freshly issued session that has not yet been activity-touched this
   * equals `createdAt` — that is the correct initial state, not a bug.
   */
  ```
- edge case (freshly issued → updatedAt == createdAt) 명시 ✓

---

## 테스트 커버리지

| 계층 | 테스트 | 파일 | 상태 |
|------|--------|------|------|
| Domain | parseDeviceInfo pure function | `deviceInfo.test.ts` | ✓ 완전 |
| Application | toSessionDTO projection | `dto/identity.test.ts` (추가) | ✓ 완전 |
| Adapter | recordActivity idempotent + throttle | `identity.integration.test.ts` (추가) | ✓ 완전 |
| Presentation | relativeTime formatter + boundaries | `relativeTime.test.ts` (신규) | ✓ 완전 |
| Integration | manual browser test (device label / icon / latest access) | `.issue/615/manual-test/results/` TC-01~08 | ✓ 완전 |

---

## 결론

### Blockers
**없음**

### Warnings
**없음**

### Notes

- **[N-001]** 스로틀 幅과 relativeTime "たった今"의 정확한 일치 (5min) — ADR-003 / ADR-004 원칙이 구현에 정확히 반영되었으며, 부수적으로 S-004 (두 상수 간 일관성 유지) 도 만족됨. 향후 스로틀을 조정할 시 relativeTime의 JUST_NOW_MS도 함께 조정할 필요가 있다는 점이 설계에 암묵적으로 반영되어 있음.

- **[N-002]** getCurrentUser의 부수 쓰기 도입 — CLAUDE.md의 "broad try/catch는 경계에서만"과 strict interpretation에서는 약간의 미묘함이 있지만, ADR-003에서 "부수 쓰기의 partial-failure tolerance는 정당한 경계"로 명시했으므로 정당한 선택. 다만 코드 리더가 "왜 여기서 catch를 하는가"를 처음 볼 때 이해하려면 ADR 참고가 필수임. JSDoc이 이를 충분히 가리키고 있음 ✓

- **[N-003]** DeviceInfo를 domain 정의 그대로 DTO에 실으면서 의존 방향을 유지한 설계 — ADR-001의 근거가 견고함. presentation이 DTO 경유만 참조하고 domain 직접 import를 피하므로 "type-level의 의존 방향"은 보호됨. 재정의를 피함으로써 중복을 제거하고 유지보수성을 높임 ✓

- **[N-004]** 虚僞표시 금지 원칙 (issue #543 / #572 / #615)의 일관된 적용 — device-parser의 null field 반환 (L36-40 / L46), sessionTitle의 우선순위 폴백 (L119-121), 아이콘의 unknown=범용 (L77-83) 모두가 "추측 라벨 제조 X" 원칙을 구현하고 있음. 型 레벨 과 런타임 검증이 이중으로 작동 ✓

- **[N-005]** Adapter 스로틀의 WHERE clause 설계 (L184-192) — ISO 8601 문자열 직접 비교로 기존 스키마와 호환을 유지하면서도 엘레건트한 구현. "직근 업데이트 내면 update 스킵"이라는 의도가 SQL 쿼리 itself에 반영되어 있어 읽기 쉬움 ✓

---

## 최종 평가

**Domain & Application 설계: 9.5 / 10**

- ✓ 순수 함수 (domain), 투명한 projection (application), 명확한 포트 (adapter)
- ✓ 虚僞表示 금지의 타입/구현 이중 방어
- ✓ best-effort semantics의 명시적 boundary화
- ✓ 스로틀 幅과 상대 시간 표시의 정교한 일관성
- ✓ Comprehensive test coverage (unit / integration / manual)

**경미한 고려사항:**
- CLAUDE.md와의 엄격한 interpretation gap (but 설계상 정당함)
- 부수 쓰기 추가에 따른 "read-only" 헬퍼의 의미 확대 (but JSDoc으로 명시)

**권장:** 통과 ✓
