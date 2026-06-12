# PR #653 Round 3 Review — Use Case / Domain Perspective

**Date**: 2026-06-12  
**PR**: #653 (Issue #619: P30 ユーザー公開ページをデザインモックに完全一致)  
**Reviewer Role**: Use Case / Domain architect (zero-based, zero-coddling, Blocker/Warning/Note focus only)

---

## Summary

**Blockers**: 0  
**Warnings**: 0  
**Notes**: 0  

No issues detected from a Use Case / Domain perspective. The implementation satisfies all critical contracts defined in the plan / ADR documents and maintains structural invariants.

---

## Validation Scope

### ✓ Checked: Core Invariants

1. **`items.length <= total` preservation** — Both paths (`publishedAt` and `noteColumn`) resolve the page and count from the same filter scope (ADR-005 / plan ステップ2).
   - `publishedAt` path: `listSortedAll` / `listSortedWithinCandidates` both use `whereClause` for page and count (lines 273-282 of adapter).
   - `noteColumn` path: candidate set resolved once via `listPublicNoteIdsByOwnerInRange`, then intersected with tag/visibility candidates in `buildOwnerListWhere` (lines 665-676 of adapter).
   - Invariant holds structurally.

2. **Period filter boundary semantics** — `DateRange` VO contract (`[from, to)` half-open) is preserved; inclusive end date achieved by pushing `to` to day-after 00:00 UTC (ADR-006).
   - `normalizePublicDateRange` correctly normalizes user-chosen inclusive `to` to exclusive boundary (lines 17-25 of `publicDateRange.ts`).
   - `publishedRangeConditions` applies `gte(from)` + `lt(to)` without redefining VO (lines 54-66 of adapter).
   - Test coverage: 7 boundary cases including same-day from=to, from-only, to-only, end-date-inclusive (lines 511-679 of integration test).
   - **Off-by-one prevention**: included in design (ADR-006), implementation, and test rigor.

3. **Path-asymmetry for public date projection** — Acknowledged by design (ADR-001, plan S-001), implemented correctly.
   - `publishedAt` path: sees publication SQL directly; result discarded, re-fetched in post-processing.
   - `noteColumn` path: doesn't see publication; uses candidate id resolution.
   - Both paths converge on shared post-processing (lines 162-178 of `listUserPublicNotes.ts`): one bulk `findByNoteIds` call maps public dates into projection.
   - N+1 avoided; path asymmetry encapsulated.

4. **NoteListItemDTO non-contamination** — DTO remains generic; `publishedAt` is public-domain-specific, so `PublicNoteListItem` (intersection type, line 62 of usecase) carries it alone.
   - Other consumers (auth-scoped listing, management UI) unaffected.
   - Correct boundary between domain and presentation concerns.

5. **Port / Adapter Contracts** —
   - `PublicNoteSortedOpts` extended with `publishedRange?: DateRange` (port, line 34 of adapter).
   - `PublicationStateRepository.listPublicNoteIdsByOwnerInRange` signature correct (port, lines 99-103).
   - Adapter implementation: both `listSortedAll` (line 261) and `listSortedWithinCandidates` (line 318) call `publishedRangeConditions(opts.publishedRange)`.
   - `listPublicNoteIdsByOwnerInRange` (lines 348-373) resolves ids within range, capped at `PUBLISHED_RANGE_CANDIDATE_CAP=1000`.
   - Contracts honored; no drift from port.

6. **Usecase Input Contract** — `publishedRange?: DateRange` (line 52 of usecase).
   - String→Date conversion lives at presentation boundary (`UserPublicTop.tsx` line 102, `normalizePublicDateRange`), not in usecase.
   - Usecase only receives VO; matches CLAUDE.md principle ("Validate at the boundaries... trust the static type in between").
   - Correct layering.

7. **Candidate Set Integration** — `NoteOwnerFilters.noteIds` new field (lines 50-68 of note port) is merged into `candidateSets` within `buildOwnerListWhere` (lines 665-676 of adapter).
   - Intersection semantics: empty set short-circuits to "match nothing" via `intersectIdSets`.
   - Chunking via `selectInChunks` handles D1 host-var cap.
   - Tested indirectly via period-filter tests on `noteColumn` path (lines 555-574 of integration test).

---

## File-by-File Validation

### Domain / Application Layer

- **`app/core/domain/publication/ports/publicationStateRepository.ts`**
  - `PublicNoteSortedOpts.publishedRange` added (line 34): ✓
  - `listPublicNoteIdsByOwnerInRange` JSDoc (lines 90-103): ✓ Correct semantics, half-open, cap noted.

- **`app/core/domain/note/ports/noteRepository.ts`**
  - `NoteOwnerFilters.noteIds` JSDoc (lines 50-58): ✓ Clear intent (pre-resolved candidate set from publication path).

- **`app/core/application/publication/listUserPublicNotes.ts`**
  - `ListUserPublicNotesInput.publishedRange` (lines 43-52): ✓ DateRange VO, not raw scalars.
  - `PublicNoteListItem` type (lines 62-63): ✓ Intersection, not base DTO pollution.
  - `listByPublishedAt` / `listByNoteColumn` (lines 227-335): ✓ Both paths call `publicationStateRepository` with filtered args.
  - Post-processing (lines 162-178): ✓ Single bulk read, Map lookup, projection composition.

### Adapter Layer

- **`app/core/adapters/d1/repositories/publicationStateRepository.ts`**
  - `publishedRangeConditions` (lines 54-66): ✓ Lexicographic string compare (ISO8601 property), `gte/lt` semantics, no VO rewrite.
  - `listSortedAll` WHERE clause (line 261): ✓ `publishedRangeConditions(opts.publishedRange)`.
  - `listSortedWithinCandidates` WHERE clause (line 318): ✓ Same conditions applied to chunk.
  - `listPublicNoteIdsByOwnerInRange` (lines 348-373): ✓ Publication table, visibility='public', active note JOIN, range conditions, limit cap.

- **`app/core/adapters/d1/repositories/noteRepository.ts`**
  - `buildOwnerListWhere` noteIds integration (lines 665-666): ✓ Pushed to `candidateSets`, intersected, no special path.

### Presentation / Type Safety

- **`app/components/public/publicDateRange.ts`**
  - `normalizePublicDateRange` (lines 17-25): ✓ String→Date at boundary, `to` pushed to next-day-UTC, returns `DateRange | undefined`.
  - `parseDateOnly` / `nextDayUtc` (lines 30-42): ✓ UTC semantics, `null` on invalid (safe fallback).
  - Unit tests (7 cases): ✓ Boundary coverage including same-day, from-only, to-only, inclusive-end confirmation.

- **`app/components/public/UserPublicTop.tsx`**
  - Normalization call (line 102): ✓ `normalizePublicDateRange(from, to)` invoked before usecase.
  - `publishedRange` passed to `loadNotes` (line 111): ✓ VO shape, not strings.

- **`app/routes/u/$username/index.tsx`**
  - `publicTopSearchSchema`: ✓ `from` / `to` as `z.string().date().optional().catch(undefined)` (lines 42-43).
  - `loaderDeps` (lines 115-122): ✓ Includes `from` / `to`.
  - Props passed to `UserPublicTop` (lines 72-73): ✓ Strings from URL → component boundary.

---

## Test Coverage Validation

### Unit Tests
- **`publicDateRange.test.ts`** (7 cases): off-by-one boundaries, same-day, from-only, to-only, both-bounds, invalid inputs. ✓

### Integration Tests
- **`listUserPublicNotes.integration.test.ts`** (publishedRange suite, lines 508-680):
  - Both paths (publishedAt / noteColumn) with range filter ✓
  - from-only, to-only, same-day window ✓
  - end-date inclusive verification (line 611-631) ✓
  - empty result case ✓
  - `publishedAt` field non-null assertion in filtered results ✓
  - `items.length <= total` property tested implicitly via result shape ✓

### Manual Tests (from `.issue/619/manual-test/report.md`)
- TC-004 (period filter): ✓ PASS — public-date-basis, to-inclusive, URL persistent, ソート横断 all verified.

---

## Critical Path Checklist

| Concern | Status | Evidence |
|---------|--------|----------|
| Period range inclusive semantics | ✓ OK | ADR-006, adapter line 63 (`lt`), test line 611-631 |
| N+1 on publication dates | ✓ OK | Bulk `findByNoteIds` line 169, post-processing convergence |
| `items.length <= total` invariant | ✓ OK | Same WHERE scope for page+count, both paths, candidate intersection |
| NoteListItemDTO isolation | ✓ OK | `PublicNoteListItem` type, line 62, no base DTO change |
| VO contract preservation | ✓ OK | `DateRange` VO unchanged, boundary semantics in presentation layer |
| Port/Adapter alignment | ✓ OK | `publishedRange` in `PublicNoteSortedOpts`, both methods, no drift |
| Candidate set chunking | ✓ OK | `selectInChunks`, `PUBLISHED_RANGE_CANDIDATE_CAP=1000`, `intersectIdSets` |

---

## Notes

- **ADR-007 (implementation time decision)**: Correctly captured the choice of dedicated `listPublicNoteIdsByOwnerInRange` method over `candidateSets` fallback. Method signature and cap design are sound.
- **Edge case handling**: Relay-lag (trashed note with public publication_states row) correctly excluded by `notes.status='active'` JOIN in both paths.
- **Backward compatibility**: `DateRange` VO JSDoc contract left unchanged; inclusive semantics achieved in presentation layer, not in VO. Clean separation.
- **Test quality**: Both boundary and path-agnostic tests present. Manual verification confirms practical behavior (TC-004 PASS).

---

## Conclusion

The implementation is **structurally sound** from a Use Case / Domain perspective. All critical contracts (invariants, port signatures, VO semantics, path asymmetry encapsulation) are honored. No architectural debt introduced. Ready for merge from this lens.
