# PR Review #001 — perf(notes): 2-pass findByOwner chunk path
**PR:** #175
**Date:** 2026-05-23
**Round:** 1回目
**Perspective:** Adapter / Infrastructure

## Summary
- Blockers: 0
- Warnings: 2
- Notes: 8
- Verdict: **APPROVED**

`findByOwner` の chunk 経路（`idScope !== null`）を 2-pass に書き換えた変更は Adapter 層の責務分離・既存規約（UoW / `mapDbError` / `selectInChunks` 抽象）に違反しておらず、ADR-001 / plan.md / `.issue/165/review-001.md` P-W-001 の指摘内容と一貫している。`buildOwnerListWhere` の return shape (`Promise<{ where: SQL; idScope } | null>`) も触られておらず、PR で宣言した「signature を変更しない」スコープが守られている。

Blocker レベルの問題は無く、残る指摘は微細な「型シグネチャの細部」と「runner 引数の冗長な spread」のみで、いずれも振る舞いは正しい。Warnings レベルでもマージを止める性質のものではないため Approved とする。

---

## Blockers

なし。

---

## Warnings

- **[A-W-001]** Pass 2 の chunk runner で `inArray(notes.id, [...chunk])` の spread が冗長
  - 場所: `app/core/adapters/d1/repositories/noteRepository.ts:452`（および同ファイルの 312, 439, 695, 722 既存箇所と整合させる意味でも）
  - 理由: `selectInChunks` の `runner` シグネチャは `(chunk: readonly string[]) => Promise<readonly T[]>` で、drizzle の `inArray(col, values: any[] | Placeholder)` は `readonly string[]` をそのまま受けられる（`[...chunk]` で配列コピーする必要はない）。本 PR では新規追加した Pass 2 (`l.452`) でも従来の慣習に倣って `[...chunk]` しており、結果として **Pass 2 の各 chunk で `pageIds.length / SAFE_CHUNK_SIZE` 回の不要な配列コピー**が走る。性能上の実害は無い（最大 6 chunk × 90 要素）が、Adapter 層の「driver 詳細を不要に複製しない」原則からは外れる
  - 提案: 別 PR でファイル全体 (`l.312, 439, 452, 695, 722`) を一括で `inArray(col, chunk)` に揃える Follow-up とするのが望ましい。本 PR で部分修正すると既存コードとの不整合が残るため、本 PR 内でやる場合は **5 箇所まとめて**直すこと。本 PR 単体としては merge を止めない

- **[A-W-002]** `sortNoteRowsBy` の generic 制約が `Record<SortColumn, string>` に固定されており、Pass 1 の projection が将来 `number` カラムへ拡張されたとき shape compatibility が崩れる
  - 場所: `noteRepository.ts:963-965`
  - 理由: 現状の制約は `T extends { readonly id: string } & { readonly [K in SortColumn]: string }`。`NoteRow` の `updatedAt / createdAt / title` がすべて `string` であることに依存している。仮に将来 `sort='version'` (number) を追加した場合、`av < bv` の比較は number でも動くが型として `string` リテラルに pin されているため Pass 1 projection 側でキャストが必要になる
  - 提案: `string | number` への緩和は本 Issue スコープ外。コメントで「現状 SortColumn 全てが `string` 型カラムである前提」と一文足すか、`schema` の `notes` 列を直接参照する `Pick<NoteRow, "id" | SortColumn>` 系の制約に置き換えると、schema 変更時にコンパイル時破断する保険になる。これは preference の領域なので必須ではない

---

## Notes

- **[A-N-001]** Pass 2 の order preservation ロジック (`Map<id, NoteRow>` で再索引 → `pageIds.map` で復元) が ADR-001 ステップ 5 と過不足なく一致している。`for (const row of fullRows) byId.set(row.id, row)` の build と `for (const id of pageIds) { const row = byId.get(id); if (row !== undefined) ordered.push(row); }` の reorder は最小実装。`filter(Boolean)` を避けて explicit undefined check にしているのも `NoteRow` の型維持の観点で正解（`filter(Boolean)` は narrowing が効かない）

- **[A-N-002]** Pass 1 / Pass 2 間の並行 delete race の取り扱いが既存挙動と整合している点が、コード内コメント (`l.454-460`) と ADR-001 §トレードオフ §補足の両方で明示されている。`idScope === null` 経路の DB-side `LIMIT/OFFSET` でも同種の race は存在し、いずれも「ページ件数が limit より少ない結果」になるという挙動の同値性が保たれている。Adapter 層で新規 race を導入していない

- **[A-N-003]** `where` の Pass 2 非適用の根拠が ADR-001 §補足で明示されており、実装は `inArray(notes.id, [...chunk])` のみで `where` 述語を意図的に再適用していない。`buildOwnerListWhere` が組み立てる述語 (`ownerId / status / dateRange / notExists`) はすべて `notes` 行状態ベースで Pass 1 で適用済み id の subset を Pass 2 で IN するため再適用しても結果が変わらない、という主張は正しい。T-bind-015 で Pass 1 の述語適用は観測されており、Pass 2 が再適用していないことは code review レベルで担保される（観測は困難だが書かれてない述語は実行され得ない）

- **[A-N-004]** `sortNoteRowsBy` の generic 化 (`<T extends { readonly id: string } & { readonly [K in SortColumn]: string }>`) は `findReferrers` の呼び出し (`sortNoteRowsBy(rows, "updatedAt", "desc")`, `l.697`) で `T = NoteRow` に推論され、互換が保たれている。`NoteRow` は `id: string` を含み `updatedAt / createdAt / title` も `string` なので制約を満たす。`.issue/165/review-001.md` A-W-002 (`SortColumn & keyof NoteRow` への絞り込み) は今回の generic 化により異なる形で解消されている

- **[A-N-005]** `selectInChunks(Array.from(idScope), ...)` の用法が `Set → Array` 変換の必須性を踏まえて適切。`selectInChunks` の引数は `readonly string[]` で、`Set` を直接渡せないため `Array.from(idScope)` は必須。Pass 2 の `selectInChunks(pageIds, ...)` は `pageIds` がすでに `string[]` (`pageKeys.map((r) => r.id)`) なので `Array.from` 不要、これも妥当

- **[A-N-006]** `buildOwnerListWhere` の return shape (`Promise<{ where: SQL; idScope: ReadonlySet<string> | null } | null>`) は本 Issue で変更されておらず、ADR-001 §却下案 (B)(C)(D) で議論された通り Adapter の signature 安定性が守られている。Issue #165 で確立した port 規約に対する破壊的変更ゼロ

- **[A-N-007]** `mapDbError("Failed to list notes by owner", async () => { ... })` の枠は維持されており、Pass 1 / Pass 2 のいずれの D1 driver エラーも統一して `SystemError` 系へ変換される（adapter → application の翻訳契約は不変）。`hydrateMany` も同じ枠内で呼ばれており、`loadChildren` の chunk 経路と直列に並ぶことで N+1 を起こさない

- **[A-N-008]** `idScope === null` 経路（DB 側 `ORDER BY/LIMIT/OFFSET` 一発）は完全に元のまま。filter 未指定時の hot path は性能特性が変わらず、`countByOwner` 経路もこの PR では一切触られていない。スコープ管理が堅実

---

## Design Decisions

このラウンドで見つかった設計判断:

1. **A-W-001 (`inArray(col, [...chunk])` の `[...]` 冗長 spread)**: 本 PR のスコープは「2-pass 化」であり、`selectInChunks` の使い方の慣習統一は別軸。本 PR 内で部分的に書き換えると既存コードと不揃いになるため、別 PR で 5 箇所まとめて削るのが望ましい。本 PR の merge はブロックしない

2. **A-W-002 (`sortNoteRowsBy` 制約の `string` 固定)**: 現状の SortColumn 全カラムが `string` 型である前提に依存。schema 変更時のコンパイル時破断保険として `Pick<NoteRow, "id" | SortColumn>` 系へ置き換える余地はあるが、本 Issue スコープ外。コメント追加で十分

---

## 修正方針

### このラウンドで修正する (即時修正)
- なし（Warnings はいずれも merge ブロックではない）

### Follow-up
- [A-W-001] `inArray(col, [...chunk])` の `[...]` 冗長 spread を 5 箇所一括で `inArray(col, chunk)` に統一する別 PR を立てる候補
- [A-W-002] `sortNoteRowsBy` の generic 制約を schema 由来に置き換えるかコメント追記。schema 変更タイミングで対応

### 確認できた検証
- ADR-001 / plan.md / testing.md の整合性
- `buildOwnerListWhere` の signature 不変性（本 Issue 宣言通り）
- `selectInChunks` / `SAFE_CHUNK_SIZE` の使い方が `_chunks.ts` の契約に従っている（chunk 順序保証 / `Promise.all` 並列 / dedup なし）
- Pass 2 の chunk size = `min(pageIds.length, 90)` で最大 `ceil(500/90) = 6` chunks、bind cap 安全
- `pageKeys.length === 0` 早期 return で Pass 2 の no-op 呼び出し回避
- `Map<id, NoteRow>` → `pageIds.map` の order 復元ロジックが Pass 1 の sort 結果を正しく保持
- `mapDbError` 包含・UoW 規約・ポート定義への準拠
