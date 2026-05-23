# PR Review #004 — perf(notes): 2-pass findByOwner chunk path
**PR:** #175
**Date:** 2026-05-23
**Round:** 2回目
**Perspective:** 統合（Adapter / Test / Performance）

## Summary
- Blockers: 0
- Warnings: 0
- Notes: 7
- Verdict: **APPROVED**

Round 1（3 視点並列）で送られた 6 Warnings のうち、merge-blocking 性の 3 件（Test W-001 = T-bind-016 追加、Test N-001 = T-bind-015 への `toHaveLength` 追加、Performance W-001 = ADR 数値ガード修正）が `84ae2b0` で全て反映されている。残り 3 件（Adapter W-001 の `[...chunk]` spread 5 箇所統一、Adapter W-002 の `sortNoteRowsBy` generic 制約緩和、Performance W-002 の partial-sort）はいずれもスコープ外として ADR-001 §Follow-up に記録済み。新規 Blocker / Warning は発生しておらず、副作用も観測されない（typecheck PASS / 46/46 integration tests PASS）。

---

## Re-review (Round 1 → Round 2)

### Blockers
- なし（新規・既存とも）

### Warnings
- なし（新規）

### Notes

- **[R2-N-001]** Test W-001 → **T-bind-016 追加で解消**
  - `app/core/adapters/d1/__tests__/noteRepository.integration.test.ts:1409-1440`
  - 100 行 trashed + `visibility='public'` を seed し、`status='active'` で問い合わせ → Pass 1 で全行除外 → `pageKeys.length === 0` の早期 return 経路を踏ませる構成。`idScope` は `visibility=['public']` 経由で 100 ids を持つため `buildOwnerListWhere` が `null` を返す T-bind-014 経路（PR #170 短絡）には入らず、新規追加の `if (pageKeys.length === 0) return [];` ブランチを確実に通過する
  - アサーションは `expect(found).toEqual([])` 単発で、Round 1 review-002 の推奨「`status='active'` で active 0 件 + trashed 100 件」構成と一致。コメントも「a typo in the early-return branch would otherwise reach `selectInChunks([], ...)` which also returns `[]`, hiding the regression」と WHY を明示しており CLAUDE.md「WHY を書く」原則に沿う
  - これにより Round 1 で「実装上等価（早期 return を消しても `selectInChunks([], ...)` が `[]` を返す）」と評価された防御深度の空白が観測テストで埋まる

- **[R2-N-002]** Test N-001 → **T-bind-015 に `toHaveLength` 追加で解消**
  - `noteRepository.integration.test.ts:1394`
  - 既存の `expect(foundIds.size).toBe(100)` の直前に `expect(found).toHaveLength(100)` を追加。Round 1 で指摘した「dup row を Set 経由では検出できない」問題が解消される
  - スタイルが既存 T-bind-008 / T-bind-010 / T-bind-011（`toHaveLength` + `Set.size` の 2 段）と一貫した
  - コメントブロックも「Also pins `toHaveLength` so a duplicated row (e.g. Pass 2 fanning out incorrectly) would be caught alongside the set-equality assertion」と意図を明示

- **[R2-N-003]** Performance W-001 → **ADR-001 §Consequences 数値ガード修正で解消**
  - `.issue/171/adr.md:31-35`
  - 旧: `idScope.size × {id, sortCol} (~64 bytes)` → 新: `idScope.size × {id, updatedAt, createdAt, title} (~150 bytes)`
  - 旧: `5000 × 64B + 50 × 50KB = 320KB + 2.5MB ≈ 2.8MB` → 新: `5000 × 150B + 50 × 50KB = 750KB + 2.5MB ≈ 3.25MB`
  - 追加で「Pass 1 projection は `pickSortColumn` が返す 3 列すべてに加え `id` を含む静的形（`sortCol` 別の動的 projection を避けて drizzle の型推論を保つため）」という設計判断を明文化。ADR の数値根拠と実装が一致した
  - 旧実装比 250MB → 3.25MB（約 77 倍削減 / 2 桁オーダー削減）の主目的は変わらず

- **[R2-N-004]** Adapter W-002 → **`sortNoteRowsBy` コメント補足で解消**
  - `app/core/adapters/d1/repositories/noteRepository.ts:962-964`
  - 「The `T` constraint pins down only the columns the comparator actually reads — `id` plus every `SortColumn` (all three are `string` in the current schema: ISO-8601 for `updatedAt`/`createdAt`, application text for `title`).」と schema 依存の前提が明示された
  - 将来 `sort='version'` (number) 等が追加された場合の影響範囲を読み手に明示しており、Round 1 の preference レベル指摘が解消されている
  - generic 制約そのものは現行 schema 下で正しく動作するため変更不要（schema 由来の `Pick<NoteRow, "id" | SortColumn>` への置き換えは Round 1 で「preference の領域」と判定されており、本 PR では取らない判断）

- **[R2-N-005]** **Follow-up 系 Warnings は全て ADR-001 §Follow-up に記録済み**
  - `.issue/171/adr.md:97-99` で以下 3 件を明示:
    - P-W-001（`sort='title'`-only 動的 projection で `title` を `sort='updatedAt'/'createdAt'` から外す ~100B/row × idScope.size の追加削減 / 優先度低 / drizzle 型推論の懸念を併記）
    - P-W-002（`O(N log N)` 全 sort → top-k partial-sort `O(N log k)` の余地 / JS 標準に heap 無しで割に合わない可能性 / 優先度最低）
    - A-W-001（`inArray(col, [...chunk])` の 5 箇所一括統一を別 PR で / 本 PR 内で部分修正すると既存と不揃いになるため）
  - Test W-002（Pass 2 で `where` 再適用しない選択の観測テスト）は Round 1 review-002 で「観測が原理的に困難（UnitOfWork 内介入点が必要）」と判定済みで、ADR-001 §補足のロジック明文化で担保されている範囲。Follow-up Issue 起票の必要性はあるが、本 PR の verdict には影響しない

- **[R2-N-006]** **実装側 diff は最小限**
  - `noteRepository.ts` は `sortNoteRowsBy` のコメントブロックに 3 行足しただけ。アルゴリズム / 型 / 振る舞いは Round 1 評価から不変
  - `noteRepository.integration.test.ts` は T-bind-015 への 1 行（`toHaveLength`）追加と T-bind-016（45 行）追加のみ。既存 45 テストには触れていない
  - `.issue/171/adr.md` は数値修正 + Follow-up 3 件追記のみ。Status (`Accepted`) / Decision / 却下案セクションは不変

- **[R2-N-007]** **副作用なし**
  - `pnpm test:integration noteRepository.integration`: **46/46 PASS** (2.66s)
    - Round 1 時点の 45 tests + T-bind-016 = 46 tests に増えており、T-bind-015 の追加 `toHaveLength` も PASS
  - `pnpm typecheck`: **PASS**（`sortNoteRowsBy` generic 制約は触れていないので影響なし）
  - lint / format も今回の diff は人間可読の `.md` 修正 + テストコード追加のみで Biome 規約に抵触しない範囲

---

## Verdict

**APPROVED — マージ可**

Round 1 の merge-blocking 系 Warnings 3 件（T-W-001 / T-N-001 / P-W-001）は本 Round で全て解消され、Follow-up 系 3 件（A-W-001 / A-W-002 / P-W-002）は ADR-001 §Follow-up に記録された。実装本体（`findByOwner` の 2-pass 化）の振る舞いは Round 1 評価から変わっておらず、テスト・ドキュメント側の補強のみ。新規 Blocker / Warning は無く、46/46 integration tests と typecheck がいずれも PASS。本 PR は merge してよい状態。
