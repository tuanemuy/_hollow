# Review 002 — Adapter (D1 / SQL) — PR #674 (Issue #642)

ゼロベースのフルレビュー（2回目）。対象: `app/core/adapters/d1/searchIndex.ts` の ORDER BY 切替（MATCH/LIKE 両経路）、tie-breaker、ページネーション整合、SQLインジェクション安全性、ファセットカウント非影響。前回指摘（review-001-adapter.md W-001/W-002）の解消確認を含む。

### Adapter

#### Blockers

なし

#### Warnings

なし

#### Notes

- **[N-001] 前回 W-001 解消を確認**: LIKE フォールバック経路のページネーション連続性テストが追加されている（`searchIndex.integration.test.ts` "paginates 'newest' with a stable cursor across an updated_at tie on the page boundary (LIKE path)"、キーワード "AI" でトライグラム最小長未満を担保）。MATCH/LIKE 両経路が共通フィクスチャ（`seedPagingFixture` + `expectContiguousNewestPages`）で対称に検証され、しかも equal-`updated_at` ペアが limit-3 のページ境界をまたぐ配置になっており、tie-breaker がページング安定性に効く唯一の箇所を狙い撃ちしている。前回提案より強い検証になっている
- **[N-002] 前回 W-002 解消を確認**: tie-breaker テストが 3 件構成・逆順 upsert（`for (const doc of [c, b, a])`）に書き換えられ、期待値は JS sort ではなく生成順（`nextId` 単調カウンタ = note_id ASC）で固定されている。挿入順非依存であることがテスト構造から証明され、トートロジーは解消。さらに "keeps the note_id ASC stable order on the LIKE path..." テストでは `updated_at` を意図的に note_id と逆時系列にして 'newest' リークの混入も検出可能にしており、回帰検出力が高い
- **[N-003] SQLインジェクション安全性: 問題なし**。`sort` は `SearchSort`（`"relevance" | "newest"`）として型レベルで閉じ、`buildOrderBy` は文字列補間ゼロの静的 drizzle `sql` フラグメント選択のみ。ユーザー入力が ORDER BY に到達する経路はない。transport 境界は `app/routes/search.tsx` の `z.enum(SEARCH_SORTS)`（`validateSearch` 側は `.catch(undefined)` で不正値を黙ってデフォルトに落とす）で検証済み。`LIMIT ${peekLimit} OFFSET ${offset}` も数値パラメータバインドのまま不変
- **[N-004] ORDER BY 切替の構造**: `buildOrderBy(sort, relevanceOrder)` に各経路固有の relevance 順（MATCH: `bm25 ASC, note_id ASC` / LIKE: `note_id ASC`）を引数で渡し、`newest` は両経路で `sd.updated_at DESC, sd.note_id ASC` を共有。relevance 経路の ORDER BY は diff 上バイト不変であり、AC-7（既存順序の後方互換）が構造的に保証される。デフォルトも `SearchQuery.create` の `params.sort ?? "relevance"` で閉じており、`sort` を渡さない既存サーフェス（own-notes 等）は完全に非影響
- **[N-005] `updated_at DESC` の正しさ**: `search_documents.updated_at` は `toRow` で常に `Date.toISOString()`（固定長 UTC ISO8601）書き込みのため lexical DESC = 逆時系列。ヘルパーコメントにこの前提が明記され、既存の `buildDateRangeClause` の同種コメントと整合
- **[N-006] ページネーション整合**: カーソルは base64 オフセット方式のまま。同一 `sort` 内では同一 ORDER BY に対するオフセットなので重複・欠落なし（N-001 のテストでページ境界 tie まで検証済み）。sort 切替時の cursor リセットは UI 側（`SearchSortToggle`）の責務で、手組み URL の旧カーソル残留は新順序へのオフセット適用になるだけでエラーにならない — 計画のリスク分析どおり
- **[N-007] ファセットカウント非影響**: `countByDateRanges` / `countMatch` / `countLike` は無変更（diff に含まれず）。`buildOrderBy` の参照元は `runMatchQuery` / `runLikeQuery` のみで、COUNT 系 SQL に ORDER BY は存在しない。domain JSDoc（`SearchSort`）の「count surfaces are order-independent」とも整合
- **[N-008] ポート/スキーマ非破壊**: `SearchIndex` ポートのシグネチャ不変、`sort` は `SearchQuery` VO の必須フィールド（create 側 optional）として伝播。private メソッド末尾への `sort: SearchSort` 追加のみで、スキーマ変更・マイグレーションなし（`updated_at` は #627 で projection 済み）。インデックス追加なしの判断も妥当（MATCH/LIKE で絞った結果セットへのソート、limit ≤ 50）
- **[N-009] 「新着順」のセマンティクス**: 公開サーフェスの期間フィルタは `published_at` 基準（ADR-006）だが、'newest' ソートは `sd.updated_at` 基準。一見非対称だが、結果カードに表示される日付が `SearchHit.updatedAt` であること（並びと表示の一致）が JSDoc / usecase コメントに根拠として明記されており、publication join を強制しない実装上の利点もある。設計判断として記録済みなので問題なし
