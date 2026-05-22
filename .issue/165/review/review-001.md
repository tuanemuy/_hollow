# PR Review #001 — fix(issue-165): chunk intersected id scope in buildOwnerListWhere

**PR:** #170
**Date:** 2026-05-23
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 12 (Adapter 5 / Test 4 / Performance 3)
- Notes: 14
- Verdict: **BLOCKED** (Warnings 残存のため）

---

## Adapter / Infrastructure

### Blockers
- なし

### Warnings

- **[A-W-001]** `where ?? undefined` のディフェンシブ二重化が型の精度を下げている
  - 場所: `app/core/adapters/d1/repositories/noteRepository.ts:407, 421, 667, 678`
  - 理由: `buildOwnerListWhere` の `conditions` は必ず `eq(notes.ownerId, ownerId)` を含むため `and(...conditions)` は実行時に `undefined` にならない。`where: SQL | null` と緩く宣言したことで caller に `?? undefined` の防御が散らばっている
  - 提案: 戻り型を `Promise<{ where: SQL; idScope: ReadonlySet<string> | null } | null>` に絞る

- **[A-W-002]** `sortNoteRowsBy` の `SortColumn` 型が `keyof NoteRow` に制約されていない
  - 場所: `app/core/adapters/d1/repositories/noteRepository.ts:914-929`
  - 理由: `SortColumn = "updatedAt" | "createdAt" | "title"` は `NoteRow` のキーだが、型システム上の制約は無い
  - 提案: `sortCol: SortColumn & keyof NoteRow` で交差させる

- **[A-W-003]** `Promise.all` 並列 chunk 数に上限ガードが無い
  - 場所: `noteRepository.ts:417-422, 674-679` (`_chunks.ts`)
  - 理由: ADR の "想定最大 1 万件" で `ceil(10000 / 90) = 112 chunks` が同時 `Promise.all` で発火する。本 PR スコープではないが Follow-up 候補
  - 提案: ADR-001 Follow-up に追記（後段 Follow-up で対応）

- **[A-W-004]** `T-bind-009` 以外で `sort/order` の chunk 経路バリエーションがテストされていない（Test W-001 と重複）
  - 場所: `noteRepository.integration.test.ts:1048-1082`
  - Test W-001 と同一指摘。Test 側で対応

- **[A-W-005]** `// backlink listing fixed sort: updatedAt desc, id desc` コメントが WHAT
  - 場所: `noteRepository.ts:649`
  - 理由: 直後の `sortNoteRowsBy(rows, "updatedAt", "desc")` がシグネチャで同じ情報を表現済み。CLAUDE.md の「Default to no comments. Add one only when the WHY is non-obvious」に反する
  - 提案: 削除するか、WHY を書く（「ここの固定 sort は backlink listing 用で caller-controlled sort を持たないことが API 規約」など）

### Notes
- [A-N-001] return shape 分割 (`where`/`idScope`) の責務分離が適切。ADR §補足 に整合
- [A-N-002] `sortNoteRowsBy` の tie-break と asc/desc 反転が簡潔
- [A-N-003] `findReferrers` の inline sort 重複が helper 化で解消
- [A-N-004] `T-bind-008..011` のコメントで pre-fix → post-fix 意図が伝わる
- [A-N-005] mapDbError / UoW / 既存リポジトリ規約は変更なし

---

## Test

### Blockers
- なし

### Warnings

- **[T-W-001]** `sort='title'` 経路の JS-side ソートが integration テストで一切踏まれていない
  - 場所: `noteRepository.integration.test.ts:1001-1155`
  - 理由: `sortNoteRowsBy` は 3 列対応で、plan.md / adr.md でわざわざ `title` sort の SQL/JS 同値性が議論されているが、`T-bind-008..011` はすべて `sort: 'updatedAt'`
  - 提案: `T-bind-012` 相当として `sort='title', order='asc'` の chunk 経路同値性テストを 1 件追加

- **[T-W-002]** `T-bind-011` (countByOwner) で list/count cross-check assertion 欠落
  - 場所: `noteRepository.integration.test.ts:1131-1155`
  - 理由: testing.md l.91 で「`findByOwner(...).length` と一致」を確認ポイントに明記しているが、`expect(count).toBe(150)` のみ
  - 提案: `findByOwner({ visibility: ['public'], limit: 1000 }).length === count` を追加 assertion

- **[T-W-003]** chunk fold seam (90 件境界) を `findByOwner` chunk path で意図的に straddle するテストがない
  - 場所: `noteRepository.integration.test.ts:1043-1082`
  - 理由: `T-bind-009` は 150 件 distinct timestamps なので tie-break 経路が新規 chunk path で未踏
  - 提案: 60+60=120 件で 2 timestamp buckets を seam 跨ぎで配置するテストを 1 件追加（findReferrers `T-bind-006` を template に）

- **[T-W-004]** `intersected.size === 0` の早期短絡経路がテストされていない
  - 場所: `noteRepository.integration.test.ts:1001-1155`
  - 理由: `buildOwnerListWhere` の return `null` 経路が新規実装で未検証
  - 提案: `findByOwner({ tagIds: [存在しない tagId], visibility: ['public'] })` で `[]` / `0` を assertion

### Notes
- [T-N-001] T-bind-008..011 のコメントスタイルが既存と整合
- [T-N-002] ID 採番が plan の 2 周目 + Phase 2 調整通り
- [T-N-003] T-bind-009 expected 計算の依存関係がコメントで明示
- [T-N-004] fresh in-memory D1 で UNIQUE 衝突無し
- [T-N-005] regression 担保: findReferrers の T-bind-004..006 で sortNoteRowsBy helper 経由化を担保

---

## Performance

### Blockers
- なし

### Warnings

- **[P-W-001]** `findByOwner` chunk 経路で `select()` (全カラム) を `idScope` 全件分マテリアライズする — `contentHtml` の重さで Plan の "1KB × 1 万件" 数値ガードが甘い
  - 場所: `noteRepository.ts:417-425`
  - 理由: `notes.contentHtml` / `frontMatterJson` を持ち、現実的に 10-50KB/行。`idScope.size = 5000` で `limit=50` でも 50-250MB クラスをマテリアライズ。Plan の "1KB × 1 万件" 想定から桁が 1 つズレる
  - 提案: 2-pass 化（軽量 `{id, sortCol}` で sort → page id 確定 → 全カラムは page のみ）。本 PR スコープを超えるなら ADR-001 Follow-up に必ず追記

- **[P-W-002]** `idScope.size > limit + offset` で chunk 数を絞れる余地（W-001 と統合）
  - 場所: 同上
  - 提案: W-001 の 2-pass 化と一体で対応、または DB-side covering index を Follow-up に追記

- **[P-W-003]** `countByOwner` chunk 経路の I/O が `count(*)` の N 倍 — chunk per `select { id }` ではなく `select { c: count() }` で十分
  - 場所: `noteRepository.ts:674-680`
  - 理由: 件数のみが目的なら数値 1 つ × chunk 数で済む。drizzle の `count()` を projection に使える
  - 提案: chunk runner を `db.select({ c: count() }).from(notes).where(...)` に差し替えて `rows[0]?.c ?? 0` を加算

### Notes
- [P-N-001] `selectInChunks` が `Promise.all` 並列で chunk 順を保つ
- [P-N-002] `hydrateMany` は page slice 後に 1 回のみ呼ばれ N+1 回避
- [P-N-003] `sortNoteRowsBy` helper 化で findReferrers 重複解消
- [P-N-004] `idScope === null` 経路は filter 未使用時に誤発火しない設計
- [P-N-005] chunk per `inArray` 組成オーバーヘッドは chunk=56 程度で実害なし

---

## Design Decisions

このラウンドで見つかった設計判断:

1. **`select()` 全カラムマテリアライズの最適化（P-W-001）** — 本 PR スコープを超えるが、ADR-001 Follow-up に追記して別 Issue で 2-pass 化を検討する。Plan の数値ガードも `contentHtml` を考慮した値に修正する
2. **chunk 並列数上限ガード（A-W-003）** — ADR-001 Follow-up に追記し、Workers throttling / メモリ実測 + 上限制御を別 Issue で扱う

---

## 修正方針

### このラウンドで修正する (即時修正)
- [A-W-001] `where ?? undefined` → return 型を `SQL` に絞る
- [A-W-002] `SortColumn` を `keyof NoteRow` に交差
- [A-W-005] backlink コメントを WHY に書き直しまたは削除
- [T-W-001] `sort='title'` chunk 経路テスト追加（T-bind-012）
- [T-W-002] T-bind-011 で list/count cross-check 追加
- [T-W-003] seam straddle テスト追加（T-bind-013）
- [T-W-004] `intersected.size === 0` 早期短絡テスト追加（T-bind-014）
- [P-W-003] `countByOwner` chunk で `count()` 集計に変更

### Follow-up（ADR-001 に追記、必要なら別 Issue 起票）
- [P-W-001/W-002] `contentHtml` を含む全行マテリアライズの 2-pass 最適化
- [A-W-003] chunk 並列数上限ガード
- [P-W-004] `findByOwner` + `countByOwner` の result memo / batch API
