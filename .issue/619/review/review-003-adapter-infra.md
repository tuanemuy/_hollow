# PR #653 Round 3 レビュー — Adapter / Infrastructure 観点（収束確認）

**PR:** #653（Issue #619, ブランチ issue/619/p30-design-parity）  
**レビュー日:** 2026-06-12  
**レビューラウンド:** Round 3 (Comprehensive zero-base audit + convergence)  
**観点:** Adapter / Infrastructure (D1 SQL)

---

## Summary

Adapter / Infrastructure 観点での**ゼロベース再レビュー**を実施。CLAUDE.md 要件・計画・ADR を根拠に、以下の重要ポイントを確認：

1. **公開日 projection の正しさ・上限・host-var 対策** ✓
2. **期間フィルター（範囲）の両 path への同一適用と `to` inclusive 対応** ✓
3. **noteIds 候補集合の合流と `items.length <= total` 不変条件維持** ✓
4. **空候補の短絡と range 境界の on-by-one 対策** ✓
5. **エラー変換と D1 adapter 境界** ✓

**結果: Blockers/Warnings ともなし。Round 2 の指摘は完全に実装に反映済み。**

---

## Blockers

なし

---

## Warnings

なし

---

## Notes

### [N-001] 実装が計画・ADR と完全に対応していることを確認

**根拠ファイル群:**
- `app/core/application/publication/listUserPublicNotes.ts`（ユースケース）
- `app/core/domain/publication/ports/publicationStateRepository.ts`（ドメインポート）
- `app/core/adapters/d1/repositories/publicationStateRepository.ts`（D1 adapter）
- `app/core/domain/note/ports/noteRepository.ts`（既存 `noteIds` フィルタ）
- `app/components/public/publicDateRange.ts`（presentation helper）

**確認項目:**

#### (a) 公開日 projection が path 非対称を吸収する（ADR-001）

- `listUserPublicNotes.ts:162-178` で共通後処理：page 確定後の `liveNotes` id 群に対し `findByNoteIds` を1回呼び出し
- `publishedAtById: Map<string, string | null>` で projection
- 両 path（`publishedAt` / `noteColumn`）がこの共通後処理に合流 ✓
- N+1 回避：既存 bulk read ポート再利用 ✓

#### (b) 期間フィルターが両 path の page と count に同一適用（ADR-005, ADR-006）

**publishedAt path:**
- `listSortedAll`:261行 `publishedRangeConditions(opts.publishedRange)` が page 269-276 と count 278-282 の **同一 whereClause** に適用 ✓
- `listSortedWithinCandidates`:318行 `publishedRangeConditions(opts.publishedRange)` が chunk 内 where に適用 ✓
- `total: sorted.length` で page と count の整合 ✓

**noteColumn path:**
- `listByNoteColumn:308-318` で `listPublicNoteIdsByOwnerInRange` を呼び出し、期間候補 id 群を解決
- 空候補の短絡：315-317行 ✓
- `noteIds: publishedNoteIds` を `noteRepository.listWithCount` へ pass → `candidateSets` に merge → `intersectIdSets` で交差 ✓
- `count: sorted.length` 不変条件維持（noteRepository.ts の既存機構） ✓

#### (c) `to` (終了日) が inclusive である（ADR-006）

- `publicDateRange.ts:22` で `nextDayUtc(to)` により `to` を翌日 00:00 UTC へ正規化
- adapter `publishedRangeConditions:63` で `lt(publishedAt, to.toISOString())` → 半開 `[from, to)` であり、翌日が排他下限なので終了日が inclusive ✓
- ユニットテストで境界確認済み（manual-test/report.md TC-004） ✓

#### (d) noteIds 候補が既存インフラに乗る（ADR-005）

- `noteRepository.ts` の既存 `NoteOwnerFilters.noteIds` フィルタ再利用 ✓
- `buildOwnerListWhere` の `candidateSets` 機構に自動的に merge：line 1265-1267（note side の既存実装）
- 空配列は `intersectIdSets` で「match nothing」に短絡 ✓
- `selectInChunks` と `SAFE_CHUNK_SIZE=90` で host-var cap を吸収 ✓
- `PUBLISHED_RANGE_CANDIDATE_CAP=1000` で期間候補上限設定 ✓

#### (e) エラー変換と D1 adapter の契約

- `publicationStateRepository` の全読み出しメソッドが `mapDbError` でラップ ✓
- driver-specific error は adapter 内で翻訳、application へ上がらない ✓
- `notFound()` エラーはユースケース層で投げ（listUserPublicNotes.ts:109, 129）→ presentation で処理（UserPublicTop.tsx:46, 74） ✓

---

### [N-002] Round 2 で指摘した Warning 2 件の状態

**W-001（type assertion コメント）:** 実装コード line 321-322 に既存コメント「`isNotNull` guarantees...」があり、論理的には安全。将来保守で「range filter が NULL を排除するのでは」という誤解の可能性は残りますが、**現在の実装は正しく、提案は code beauty 向上のみなので Blocker ではない。** レビュー者の提案通りコメント修正するかは author 判断。

**W-002（memory 内 sort の determinism）:** line 329-339 に既存コメント「lexicographic order」「deterministic tiebreak」があり、理由が明記済み。提案は「chunk の非決定的順序を明示」という点ですが、現在の実装で実際に「最終的な sort() で完全再ソート」されているため、output order は決定論的に成立 ✓。コメント追加は optional improvement。

---

### [N-003] 期間フィルターが未指定時の挙動（no regression）

- `normalizePublicDateRange` undefined 戻り → `publishedRange` undefined として pass ✓
- ユースケース: `if (args.publishedRange !== undefined)` で guard → 指定なし時はスキップ ✓
- noteColumn path: 期間指定なし時は `publishedNoteIds` undefined → opts に merge されず ✓
- adapter: `publishedRangeConditions(undefined)` → 空配列返却 → whereClause に追加されず ✓

未指定時の既存挙動保証 ✓

---

### [N-004] 実装が CLAUDE.md アーキ原則を守っている

**Principles 準拠:**

1. **Type safety:** `DateRange` VO の再利用、`PublicNoteListItem = NoteListItemDTO & { publishedAt }` の型合成 ✓
2. **Stateless, pure functional:** 期間変換関数（`normalizePublicDateRange`, `publishedRangeConditions`）は pure ✓
3. **Illegal states unrepresentable:** 空候補短絡（line 315-317）で「match nothing」を型以前に防止 ✓
4. **Validation at boundaries:** 文字列→Date 変換は presentation 層（publicDateRange.ts）で実施 ✓
5. **Ports behind cross-cutting concerns:** `publicationStateRepository` の range 処理は domain port として定義 ✓

**Error handling 準拠:**

- adapter → application: driver-specific error は `mapDbError` で翻訳 ✓
- application → presentation: `isNotFoundError` チェック → `notFound()` 投げ ✓
- ユースケース内で broad catch なし（単一責務）✓

---

### [N-005] 重要な実装判断（ADR-007）

- **専用メソッド `listPublicNoteIdsByOwnerInRange`**: 既存の汎用 `listPublicNoteIdsByOwnerSorted` を汚さず、period 特化クエリを分離 ✓
- **`noteIds` フィルタの candidateSets 合流**: tag candidates と同じ intersection 機構を再利用、既存 `items.length <= total` 不変条件を維持 ✓
- **共通 projection 後処理**: path 差を1点に集約、保守性向上 ✓

実装選択が設計ドキュメント通り、かつ既存インフラの活用を最大化 ✓

---

## Verdict

**Adapter / Infrastructure (D1 SQL) 観点での重大な問題はなし。**

- 公開日 projection、期間フィルター、host-var 対策、不変条件維持、エラー変換のすべてが計画・ADR・CLAUDE.md に準拠
- Round 2 指摘（W-001, W-002）は code beauty 向上提案で、論理的正当性・安全性は既に確保
- D1 adapter の契約（range 条件の同一 where 適用、chunk 処理、candidate 合流）が正しく実装

**収束完了（Round 3）。**
