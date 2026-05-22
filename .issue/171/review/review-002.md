# PR Review #002 — perf(notes): 2-pass findByOwner chunk path
**PR:** #175
**Date:** 2026-05-23
**Round:** 1回目
**Perspective:** Test

## Summary
- Blockers: 0
- Warnings: 2
- Notes: 4
- Verdict: APPROVED

総評: T-bind-015 は Pass 1 で `where` 追加述語が適用されることを 100 active + 50 trashed の seed で素直に観測しており、本 PR の最重要回帰（Pass 1 が `where` を落とす）を確実に捕まえる。スタイル・コメント・fixture セットアップとも既存 T-bind-008..014 に揃っており、CLAUDE.md「WHY を書く」原則も「Regression guard for the optimisation that moved full-row hydration into Pass 2」と Issue 番号を冒頭に明示している点で十分。既存 T-bind-009 / T-bind-013 が 2-pass 化後の order 復元経路をそのまま貫いており、回帰検知能力が温存されている。BLOCKER なし。Warning は coverage 拡張余地に関するもので、本 PR スコープ内のブロッカーではない。

## Blockers

なし。

## Warnings

- **[T-W-001]** `pageIds.length === 0` 早期 return 経路の専用テストがない（testing.md §2 の主張と差異）
  - **問題**: `noteRepository.ts` の新規早期 return `if (pageKeys.length === 0) return [];` は Pass 1 後 / Pass 2 前の経路で、`buildOwnerListWhere` の `idScope === null` 短絡（T-bind-014 がカバー）とは別ブランチ。`.issue/171/testing.md` §「2. `pageIds.length === 0` の早期短絡」は T-bind-014 でカバーされる旨を述べているが、T-bind-014 は ghostTag によって `idScope.size === 0` → `buildOwnerListWhere` が `null` を返す経路に入る（PR #170 時点の挙動）。つまり Pass 1 を実行せず短絡するため、新規 `pageKeys.length === 0` の if 分岐は通らない
  - **観測**: noteRepository.ts l.~440 の `if (pageKeys.length === 0) return [];` は現状どのテストでも通過していない可能性が高い（Pass 1 が空配列を返すケース = `idScope` 非空 + `where` 述語ですべての行を除外、を発生させるテストが不在）
  - **影響度**: 中。誤って `if (pageKeys.length === 0) return [];` を `if (pageKeys.length === 0) return undefined` のようにタイポしても CI が通る危険。とはいえ JS 上は `selectInChunks([], ...)` も `[]` を返すため、現状の実装では仮に早期 return を消しても結果は等価で、本質的なバグ余地は限定的
  - **推奨修正**: T-bind-015 のバリエーションとして、active 0 件 + trashed 100 件 を seed して `status='active'` で問い合わせ、`expect(found).toEqual([])` を確認するテストを追加するか、既存 T-bind-015 の末尾に `status='trashed'` の対称呼び出しを足してもよい。`idScope` 非空 × Pass 1 後 0 件 のケースを 1 件足せば十分

- **[T-W-002]** Pass 2 で `where` を再適用しない設計（ADR-001 §補足）に対するテストが実質ゼロ
  - **問題**: ADR-001 §補足は「Pass 1 で `where` が適用済みなので Pass 2 は `inArray(notes.id, pageIds)` のみで安全」と主張するが、これを観測するテストが存在しない。T-bind-015 は Pass 1 の `where` 適用を観測するが、Pass 2 の where 不在は無条件に通過する（Pass 1 が trashed を除外している以上、Pass 2 が `where` を持っていても持っていなくても結果は同一）
  - **観測**: 「Pass 2 で where を再適用すべきだった」という回帰（例: Pass 2 が `where` を取り損ねた場合）は本 PR 範囲では存在しないが、将来 Pass 2 builder に `status` を「念のため」付け足したくなる誘惑があり、その判断が観測テストなしに行われる
  - **影響度**: 低〜中。ADR §補足のロジックは妥当で、コードレビューで担保されている。観測テストは原理的に組み立てづらい（Pass 1/2 間の row 状態変化を deterministic に再現する必要があり、`UnitOfWork` 1 トランザクション内で row UPDATE を挟む integration テストが必要で重量級）
  - **推奨修正**: 本 PR では追加不要。`.issue/171/adr.md` §補足にすでに根拠が明文化されているため、設計判断として記録済みの扱いでよい。ただし review-001 で同等の指摘が無いなら、別 follow-up Issue として「Pass 1/2 race observable test」を起票しておく価値あり

## Notes

- **[T-N-001]** T-bind-015 のアサーションは `found.length` 直接ではなく `Set(...).size` を使っているため、万一の duplicate 検出に弱い
  - **観測**: `expect(foundIds.size).toBe(100)` は `found` が dup を含む場合（Pass 2 の `byId` reindex が壊れて `pageIds.map(id => byId.get(id))` で同じ id を 2 回返したケースなど）に検出が遅れる。`expect(found).toHaveLength(100)` を 1 行足せば dup と count を同時に観測できる
  - **対比**: T-bind-008 / T-bind-010 / T-bind-011 はいずれも `expect(found).toHaveLength(150)` + `expect(new Set(...)).toEqual(new Set(ids))` の 2 段で書いており、T-bind-015 だけ length チェックが Set 経由になっている。スタイル一貫性の観点でも `toHaveLength` 直接が望ましい
  - **影響度**: 低。`pageIds` は Pass 1 の slice 結果なので原理的に dup 不可、`byId` の Map lookup も同じ id を 2 回 push しない。実害ゼロだが、テスト記述の防御深度として揃えるのが筋

- **[T-N-002]** 並行 delete race（Pass 2 で `byId.get(id) === undefined`）に対するテスト不在は妥当な省略
  - **観測**: noteRepository.ts l.~452 `if (row !== undefined) ordered.push(row);` は Pass 1/Pass 2 間に row が消える race を吸収する。integration テストで deterministic に再現するには `UnitOfWork` 内で Pass 1 / Pass 2 間に DELETE を割り込ませる必要があり、現テスト基盤の `unitOfWorkProvider.run(fn)` 構造では介入点が無い
  - **判断**: ADR-001 §トレードオフで「既存 chunk 経路 / DB-side LIMIT 経路でも同じ race が存在し、page 件数が limit より少ない結果になる症状で整合」と明文化されており、新たに導入される race ではない。テスト不在は許容範囲

- **[T-N-003]** `countByOwner` の整合性確認は本 Issue 範囲外で OK
  - **観測**: PR 範囲は `findByOwner` の chunk 経路 1 箇所のみで `countByOwner` は変更されていない（plan.md スコープ §「含まれないもの」で明示、review-001.md P-W-003 で別 follow-up）。T-bind-011 が `count = listed.length` の整合チェックを担保しており、本 PR で `findByOwner` だけが変わっても整合性が崩れたら T-bind-011 が検知する
  - **判断**: スコープ判断として妥当

- **[T-N-004]** seed fixture `seedManyNotes` の slug 衝突懸念は partial unique index で吸収済み
  - **観測**: T-bind-015 は `seedManyNotes(..., 100, { status: "active" })` + `seedManyNotes(..., 50, { status: "trashed" })` を呼ぶ。両者とも `slug: bulk-${i}` を使うため、active `bulk-0..bulk-49` と trashed `bulk-0..bulk-49` が同じ owner で衝突しうるが、`schema.ts` l.268-270 の `uniqueIndex("uniq_notes_owner_slug").where(sql\`status = 'active'\`)` は active 行のみ unique 制約対象。trashed 行は自由に衝突可能なので INSERT は通る
  - **判断**: 設計通り。本 PR で追加考慮事項なし

## カバレッジ評価

| 失敗モード | 担保テスト | 評価 |
|---|---|---|
| Pass 1 の `where` 述語落とし | T-bind-015 | ◎（このために追加された） |
| Pass 1 → Pass 2 の order 復元崩れ | T-bind-009（offset 50 + sort updatedAt desc）, T-bind-013（chunk 跨ぎ tie + sort desc） | ◎（2-pass 化後そのまま貫通） |
| Pass 1 sort のタイブレーク（id DESC） | T-bind-006（findReferrers 側）, T-bind-013 | ○（直接ではないが等価ロジック） |
| `pageIds.length === 0` 早期 return | なし | △（T-W-001） |
| Pass 1/Pass 2 race delete | なし | ○（ADR で明示的に許容） |
| Pass 2 で `where` を取り損ねる回帰 | なし（観測不能） | ○（ADR §補足で担保, T-W-002） |
| `sortNoteRowsBy` generic 化の互換 | T-bind-005..007（findReferrers 側で `T = NoteRow` 推論） | ◎ |
| `idScope === null` 経路の非regression | T-bind-001..003 系 + 既存 findByOwner テスト | ◎ |
| `countByOwner` 整合性 | T-bind-011（変更なし） | ◎（本 PR スコープ外） |
| sort = 'title' chunk 経路 | T-bind-012 | ◎（2-pass 化後そのまま貫通） |

総合: 主要な回帰モードに対するカバレッジは十分。T-W-001 の早期 return ブランチが唯一の本質的な空白だが、実装上は `selectInChunks([], ...)` の挙動と等価で副作用なし。本 PR の Verdict は **APPROVED**。

## 推奨フォローアップ（本 PR 外）

1. T-bind-016（任意）: `idScope` 非空 × Pass 1 後 0 件 を 1 件追加し、`pageIds.length === 0` の早期 return ブランチをカバー（T-W-001）
2. Pass 2 の `where` 不在 / race 観測テストは別 Issue として整理（T-W-002）。`unitOfWorkProvider.run` 内に介入点を作るテスト基盤拡張が前提
