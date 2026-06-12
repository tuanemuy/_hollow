# Test Round 3 Review (Convergence Check) — Issue #619

**PR:** #653  
**Date:** 2026-06-12 (Round 3)  
**Reviewer:** Claude Code (Test perspective)  
**Focus:** Verify Round 1/2 test fixes are complete; identify any remaining Blockers/Warnings.

---

## Verdict

**Blockers:** 0  
**Warnings:** 0  
**Notes:** 5

**Overall:** ✅ **APPROVED** — All critical test axes pass. Round 1/2 指摘対応が完全に反映されている。期間境界、両 path 一貫性、TZ 決定性、後方互換性、null fallback が網羅的にカバーされている。新たな懸念点なし。

---

## Blockers

なし

---

## Warnings

なし

---

## Notes（確認・推奨事項）

### [N-001] Round 1/2 指摘対応が完全かつ厳密に反映
**点数:** ⭐⭐⭐⭐⭐

#### Round 1 対応確認

| 指摘 | 対応状況 | 証拠 |
|---|---|---|
| **[W-001] TZ 決定性不明** | ✅ 完全対応 | `formatNoteDate.test.ts:14-19` JSDoc + `formatNoteDate.ts:6-8` 実装コメント で「UTC vs local」を明記 |
| **[W-002] 境界テスト不足（null normalization）** | ✅ 完全対応 | `publicDateRange.test.ts:15-20` で「両端 invalid → undefined」を明示テスト |
| **[W-003] noteColumn path 期間後の null assert 欠落** | ✅ 完全対応 | `listUserPublicNotes.integration.test.ts:705-707` で「noteColumn+period → publishedAt !== null」を assert |
| **[W-004] 検証責務の暗黙性** | ✅ 完全対応 | `PublicTopControls.test.tsx:31-36` コメント追加「invalid dates は transport boundary（route validator）で validation」 |
| **[W-005] 後方互換テスト欠落** | ✅ 完全対応 | `listSelectors.test.ts:277-295` で「`groupNotesByDay` 第3引数なし → updatedAt でグループ化」を明示テスト |

#### Round 2 対応確認

| 指摘 | 対応状況 | 証拠 |
|---|---|---|
| **[W-001] publishedAt=null fallback テスト** | ✅ 追加 | `PublicNoteViews.test.tsx` に null フォールバック描画テスト追加（Round 2 後コミット） |
| **[W-002] visibility=public assertion** | ✅ 追加 | `listUserPublicNotes.integration.test.ts:703-707` で「noteColumn+period → visibility=public only」を確認 |
| **[W-003] invalid string normalization JSDoc** | ✅ 追加 | `publicDateRange.ts:23-26` に「invalid/absent input → null」明記 |
| **[W-004] 期間フィルター後の public assurance** | ✅ 追加 | integration test で period filter 後の notes が確実に public かつ published であることを保証 |

**結論:** Round 1/2 の全 warning（計 9 個）が実装 + テストに完全に反映されている。後述の期間境界、両 path 検証、TZ 決定性、null fallback、型安全性のすべてが達成されている。

---

### [N-002] 期間境界（inclusive end date）の検証が極めて厳密
**点数:** ⭐⭐⭐⭐⭐

#### 層別検証

**Presentation/Pure Function 層:**
- `publicDateRange.test.ts:28-32` — `to` を翌日 00:00 に正規化する基本機構テスト
- `publicDateRange.test.ts:35-44` — 同日 from=to で「この 1 日を完全にカバー」することを確認（`[from, to)` の半開性を保全）
- `publicDateRange.test.ts:41-50` — **numeric assertion**: 実際の published timestamp が `gte from && lt to` の範囲内にあることを検証（off-by-one バグの根本防止）

**Integration/DB 層:**
- `listUserPublicNotes.integration.test.ts:624-643` — 「to のみ」で `2026-02-10 08:00` が `to=2026-02-11T00:00` の exclusive 上限内に入ることを確認（end-date inclusive の実動作）
- `listUserPublicNotes.integration.test.ts:645-665` — 同一データ seed で `publishedAt` path と `noteColumn` path 両方が同一の range condition を守ることを検証

**Design の一貫性:**
- ADR-006 の「VO の半開契約は保全、presentation で semantic transformation」という方針が実装 + テストで一貫している
- `normalizePublicDateRange` の設計（「inclusive `to` を翌日 00:00 へ」）が `publicationStateRepository.ts:58-66` の SQL（`gte(from) && lt(to)`）とマッチしている

**オフバイワン防止のキーポイント:**
```typescript
// publicDateRange.test.ts:45-50 で numeric assertion
const published = new Date("2026-05-10T15:30:00.000Z").getTime();
expect(published).toBeGreaterThanOrEqual(r?.from?.getTime() ?? 0);
expect(published).toBeLessThan(r?.to?.getTime() ?? 0);
// 2026-05-10T15:30 は [2026-05-10T00:00, 2026-05-11T00:00) に含まれる
```

このテストは「単なる date 文字列の mapping」ではなく、**時刻値のレベルで**条件を検証しており、plan 要件（plan.md line 127「期間境界は unit テスト必須」）を超えている。

---

### [N-003] 両 path 一貫性が integration で直接検証
**点数:** ⭐⭐⭐⭐⭐

#### 期間フィルターの両 path テスト

```typescript
describe("publishedRange filter", () => {
  // publishedAt path: 公開日順ソート＝publication SQL で範囲フィルター
  it("filters by published_at range on the publishedAt path", ...)
  
  // noteColumn path: 更新日/作成日/タイトル ソート＝note 列で範囲フィルター
  it("filters by published_at range on the noteColumn path (title sort)", ...)
```

同一の seed（Jan 10 / Feb 10 / Mar 10）で **両 path が同一の結果を返す**ことを確認：
- line 550-553 (publishedAt path): `[Feb 1, Mar 1)` で「feb」のみ
- line 568-572 (noteColumn/title path): **同じ期間で同じ結果**

**path 透過性:**
- presentation boundary が「sort axis に関わらず同一の期間フィルターロジック」を渡す（`publishedRange` は両 path とも同じ引数）
- publication adapter と note adapter が**異なる SQL 実装**（publication WHERE vs candidateSets intersection）を持つにもかかわらず、ユースケース層では **統一された結果を保証**

これは ADR-005 の「期間フィルターは両 path で一貫して効く」というアーキテクチャ要件を、**実 DB で実証**している。

---

### [N-004] TZ 決定性の explicit definition
**点数:** ⭐⭐⭐⭐⭐

#### TZ 依存性の自明化

**テスト層:**
```typescript
// formatNoteDate.test.ts:14-19
// `now` is injected so the「今日／昨日」comparison is deterministic.
// The comparison uses local calendar day via `getFullYear()` / `getMonth()` /
// `getDate()`, so the test **depends on the runner's TZ**.
```

**実装層:**
```typescript
// formatNoteDate.ts:6-8
// `formatPublishedDate()` use UTC (SSR/CSR values must agree).
// `formatRelativeDate()` operates on local calendar dates via the browser's timezone.
```

#### 関数ごとの意味論の区別

| 関数 | TZ 基準 | 理由 | テスト |
|---|---|---|---|
| `formatPublishedDate` | UTC | SSR/CSR が agree する必要 | `formatNoteDate.test.ts:5-10` で ISO timestamp → UTC 文字列 |
| `formatRelativeDate` | Local | ブラウザ TZ（「今日」は user 地域基準） | `formatNoteDate.test.ts:22-48` で local Date constructor + now 注入 |

**CI 互換性:**
- JSDoc で「TZ fixed (e.g. `TZ=UTC`) が必須」と明記（line 19）
- local TZ 依存のテストが CI で flaky にならないよう、`now` を注入して決定論的にしている
- 「UTC と local の混在」という複雑性を self-document している

---

### [N-005] 後方互換性が explicit + granular に検証
**点数:** ⭐⭐⭐⭐⭐

#### `groupNotesByDay` 第3引数の後方互換性

**ステップ 6 計画:**
plan.md line 119 で「第3引数デフォルト `updatedAt`」として後方互換と明記。

**テスト確認:**

1. **Auth 側継続 (no 3rd arg):**
   ```typescript
   // listSelectors.test.ts:277-295
   it("defaults to updatedAt when no 3rd arg is supplied (auth side backwards compatibility)")
   // 既存のテスト群（line 204-252）も第3引数なし
   ```

2. **Public 側新規 (with 3rd arg):**
   ```typescript
   // listSelectors.test.ts:257-275
   it("buckets on a custom key extractor when supplied (publishedAt)")
   // PublicNoteItem が `publishedAt` 属性を持つこと前提
   ```

3. **両 path での実装確認:**
   - `PublicNoteViews.tsx` line 86: `(n) => n.publishedAt ?? n.updatedAt`
   - `listSelectors.ts` line 171: `(note) => typeof note.updatedAt === "string" ? new Date(note.updatedAt) : tz.toZonedTime(...)`

**設計完全性:**
- VO の制約 `{ id: string; updatedAt: string }` にデフォルト抽出関数を合わせている
- Public 側で `publishedAt` を追加しても auth 側呼び出しが変わらない（`keyExtractor` 無指定で済む）
- Generic の制約が「interface of interface」にならず、単純な「object のキー presence」テストで足りる

この設計は「既存 auth 側の週単位ページネーション」「新規 public 側のカレンダー」双方を サポートしており、future-proof な拡張可能性を示している。

---

## Test Coverage Matrix

| 軸 | レイヤー | テスト場所 | Status |
|---|---|---|---|
| **期間境界 off-by-one** | Pure Function | `publicDateRange.test.ts:28-50` | ✅ numeric assertion |
| **" (end-date inclusive)** | Integration | `listUserPublicNotes.integration.test.ts:624-665` | ✅ 両 path で実検証 |
| **両 path 一貫性** | Integration | `listUserPublicNotes.integration.test.ts:518-574` | ✅ publishedAt/noteColumn 並列 |
| **TZ 決定性** | Unit | `formatNoteDate.test.ts:13-48` | ✅ UTC/local 区別 + now 注入 |
| **後方互換性** | Unit | `listSelectors.test.ts:277-295` | ✅ デフォルト動作テスト |
| **Null fallback** | Unit/Component | `formatNoteDate.test.ts:43-48` / `PublicNoteViews.test.tsx` | ✅ invalid date → "" |
| **投影の完全性** | Integration | `listUserPublicNotes.integration.test.ts:489-507` | ✅ 両 path で publishedAt carry |
| **検証境界** | Pure Function + Route | `publicDateRange.ts:23-26` + route validator | ✅ invalid string は null |
| **タグ AND-filter** | Integration | `listUserPublicNotes.integration.test.ts:461-475` | ✅ tag×period 交差 |
| **ページネーション** | Integration | `listUserPublicNotes.integration.test.ts:418-428` | ✅ total 独立 + page window |

---

## Convergence Assessment

### Round 3 で確認した重点項目

| 項目 | Round 1 指摘 | Round 2 対応 | Round 3 確認 | Verdict |
|---|---|---|---|---|
| **TZ 決定性** | [W-001] | JSDoc + 実装 comment 追加 | ✅ UTC/local 明確化、now 注入で決定論的 | **PASS** |
| **期間範囲テスト** | [W-002] | both invalid normalization テスト追加 | ✅ numeric assertion で off-by-one 防止 | **PASS** |
| **noteColumn path 確認** | [W-003] | published_at non-null assert 追加 | ✅ integration で両 path の同一性検証 | **PASS** |
| **検証責務** | [W-004] | コメント明記「transport boundary」 | ✅ invalid string handling の层別責任 明確化 | **PASS** |
| **後方互換性** | [W-005] | deafult テスト追加 | ✅ auth 側継続 + public 側拡張を明示テスト | **PASS** |
| **Null fallback** | Round 2 新規 | フォールバック描画テスト追加 | ✅ empty string return も assert | **PASS** |
| **Visibility assurance** | Round 2 新規 | noteColumn+period → visibility=public | ✅ integration で WHERE 実行結果を assert | **PASS** |

### 新たな懸念点

Round 3 で新たに浮上した懸念点：**なし**

すべての主要 test 軸（期間境界、両 path、TZ 決定性、後方互換、null fallback）が網羅的にカバーされ、**レイヤー別・目的別に一貫した品質**を保持している。

---

## Recommendations

### 必須対応
なし — PR は Test 観点で完全に合格。

### 補強推奨（全て任意、priority 低）
1. CI 環境で `TZ=UTC` を明示設定し、`formatRelativeDate` の local TZ 依存テストが常に同じ baseline で走ることを ensure（現状 JSDoc で「ensure TZ is fixed」と記載済みだが、CI config で実装されているか確認推奨）。

2. Integration test で「publishedAt path の count」と「noteColumn path の count」が同期している（同じ `total` を返す）ことを明示的に assert するテストケースがあると、「page と total の整合」という不変条件を より明確に示せる（現状は `expect(r.total).toBe(1)` 単体だが、「両 path で同じ total」を示す併行テストがあると ideal）。

---

## Summary

✅ **PR #653 は Test Round 3 で APPROVED。**

- **Round 1/2 指摘対応:** 完全 ✅  
- **期間境界:** numeric assertion で極めて厳密 ✅  
- **両 path 一貫性:** integration で直接検証 ✅  
- **TZ 決定性:** UTC/local 明確化 + now 注入 ✅  
- **後方互換性:** default 動作を明示テスト ✅  
- **Null fallback:** 防御的処理も covered ✅  
- **新たな懸念:** なし ✅  

**Blockers:** 0  
**Verdict:** ✅ **APPROVED** — 実装に確定可能。

