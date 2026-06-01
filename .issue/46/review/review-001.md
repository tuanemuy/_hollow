# PR Review #001 — feat(#46): findReferrers の結果上限制御（LIMIT/OFFSET 化）

**PR:** #404
**Date:** 2026-06-01
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 5（doc/コメント改善 2 / 既存対応済み・設計前提の確認 3）
- Notes: 多数（パターン踏襲・性能達成・後方互換・テスト網羅を確認）
- Verdict: **BLOCKED**（Warning 残のため。doc 2 件を修正、3 件を disposition）

レビューは Adapter+Performance / UseCase+Domain Port / Test / Frontend の 4 視点を並列実施。全視点で **Blocker 0**。

---

## Adapter / Infrastructure + Performance

#### Blockers
なし

#### Warnings
- **[A-W-001]** Pass1 の軽量 select に `where` 述語が無く `findByOwner` との「同型」がコメント上わずかに崩れる（実害なし・保守注意）
  - 場所: `app/core/adapters/d1/repositories/noteRepository.ts:841-847`
  - → **修正済み**: Pass1 コメントに「referrer filter is fully captured by `fromIds`, so Pass 1 needs no extra `where` predicate」を追記。
- **[A-W-002]** count 側 RTT 増加 + `resolveReferrerCandidates` の link 行 select 二重実行
  - → **disposition（対応不要）**: ADR-003 で認識済み、`getNoteDetail` は `Promise.all` 並列化で累積レイテンシを抑制（実装確認済み）。全件 hydrate 回避の削減効果が支配的。将来 `findReferrersWithCount` 統合余地は ADR-003 に引き継ぎ済み。

#### Notes（要点）
- 2-pass chunk path が `findByOwner` を 1 行レベルで正確に踏襲。Pass1 軽量列 `{id, updatedAt, createdAt, title}` は `pickSortColumn` の全分岐を満たす。
- Performance: opts 指定時に重い列 + `loadChildren` が確実に top-N 件だけに当たる（Issue 意図を本質的に達成）。
- 後方互換が完全等価（`opts === undefined` パスは旧コードと逐語一致、`resolveReferrerCandidates` も同一 Set dedup）。
- chunk 境界ソート整合性・status スコープ整合（trashed 母集合一致）を実コードで確認。

---

## Use Case + Domain Port

#### Blockers
なし

#### Warnings
- **[U-W-001]** port `findReferrers` JSDoc が tie-break（常に `id DESC`、order 非依存）を明記していない
  - 場所: `app/core/domain/note/ports/noteRepository.ts:188-194`
  - → **修正済み**: JSDoc に「tie-break is always `id DESC` regardless of `order`（same as `findByOwner`）」を追記。
- **[U-W-002]** 母集合一致の前提（referrers = owner-scoped）が port 契約に依存表明されているが、将来クロス owner リンク解決が入ると count（owner フィルタ）と preview（owner 非フィルタ）が静かにズレる
  - → **disposition（対応不要）**: クロス owner の `resolvedNoteId` は domain service `resolveInternalLinks`（`service.ts:239,250` の owner 一致条件）が**禁じる不変**であり、現状成立を実コードで確認済み。port JSDoc（「Referrers are effectively owner-scoped」）+ ADR-003 に前提を明記。禁止状態を seed する回帰テストは誤解を招くため追加しない。invariant 自体は domain service 層のテストが担保すべき関心事。

#### Notes（要点）
- 「opts 有無で 2 モード」設計は hexagonal/DDD で許容範囲。新規型を増やさず `NoteListOpts` 再利用で port 表面最小。
- `countByOwner({ referencingNoteId })` 流用は filter family（同一 `buildOwnerListWhere`）に乗る妥当な判断。`countByOwner` JSDoc が「opts なし=全 status」を明記し母集合一致前提が契約から読める。
- `Promise.all` 並列 read は UoW 内で安全。`exactOptionalPropertyTypes` 下で undefined 明示代入なし。
- `BACKLINK_PREVIEW_LIMIT=5` の usecase 配置・`backlinkCount` DTO 追加は application 層責務内。スコープ（getBacklinks/export）は無変更を確認。

---

## Test

#### Blockers
なし

#### Warnings
なし

#### Notes（要点）
- 2 ファイル 75 件 green、3 回連続安定（フレークなし）。2-pass reindex（`byId` map + `pageIds` walk）で並列 chunk 完了順に依存しない決定的順序。
- 計画のテストケース（T-ref-limit-001〜005 / T-detail-preview/count×3/count-trashed）を漏れなく実装。
- T-ref-limit-004（order=asc）は createdAt ユニーク化で tie 回避し、tie-break=id DESC 不変と矛盾しない（P-001 準拠）。
- chunk 境界（90）を実際にまたぐ seed（150/120 件）。既存 T-bind-004/005/006 は未変更で後方互換回帰として維持。
- 既存 usecase テストは分割代入アサートで `backlinkCount` 追加に壊れず、`backlinkCount` 検証を追記済み（P-002 該当せず）。
- trashed 母集合一致を T-detail-count-trashed が担保。

---

## Frontend

#### Blockers
なし

#### Warnings
- **[F-W-001]** `backlinkCount > backlinks.length`（preview 5 / 「（8 件）」等）の表示を直接担保するフロント側テストが無い（確信度 中、Blocker ではない）
  - → **disposition（対応不要）**: manual-test（`.issue/46/manual-test/report.md` TC-1）で「inline ちょうど5件 / フッター『（7 件）』」を end-to-end 検証済み。GET レンダリングのため manual-test でカバーされる。プロジェクトに component 単体テストの仕組みはなく、usecase integration + manual-test で実質担保。

#### Notes（要点）
- 件数表示差し替えが `backlinks.length` → `backlinkCount` の 1 行のみ。inline は top-N preview をそのまま map し余計な変更なし。
- `backlinkCount: number` を `Readonly` props に追加、async server component でデータ取得 → 純粋表示コンポーネントへ受け渡す RSC/TanStack Start 規約に準拠。consumer は `NoteDetail` のみで漏れなく更新。
- preview < 総数 時の「一覧を見る（N 件）」導線は home の referencingNoteId フィルタ（ページネーション済み）へ繋がり UX 妥当。Tailwind utility-first 規約遵守。

---

## Design Decisions

このラウンドで新規の設計判断はなし。U-W-002 の「referrers は owner-scoped」前提は ADR-003 で既に記録済み。
