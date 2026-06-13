# Review 001 — Adapter (D1 / SQL) — PR #674 (Issue #642)

レビュー観点: `app/core/adapters/d1/searchIndex.ts` の ORDER BY 切替（MATCH/LIKE 両経路）、tie-breaker、ページネーション整合、SQLインジェクション安全性、ファセットカウント非影響。計画: `.issue/642/plan.md` ステップ3 / AC-2, AC-5, AC-6, AC-7。

### Adapter

#### Blockers

なし

#### Warnings

- **[W-001]** `newest` のページネーション連続性テストが MATCH 経路のみで、LIKE フォールバック経路のページングは未検証 / 場所: `app/core/adapters/d1/__tests__/searchIndex.integration.test.ts:846`（"paginates 'newest' with a stable cursor" は `keyword: "design"` で MATCH 経路を通る） / 理由: LIKE 経路は FROM 句・WHERE 句が別 SQL であり、`buildOrderBy` の共有だけではページング込みの動作同一性は構造的には保証されるが、計画のテスト方針（AC-6: LIKE 経路でも新着順が機能する）に対しページ送りの検証が片経路に偏っている。`buildOrderBy` が両経路共有のヘルパーである現実装では回帰リスクは低い / 提案: 重大度は低。LIKE 経路（短トークン）での 2 ページ連続性テストを 1 本追加するか、現状のままで許容する場合はこの判断を記録しておく。マージブロックには値しない
- **[W-002]** tie-breaker テストの期待値が実装と同型のソートで生成されており、検証がトートロジー気味 / 場所: `app/core/adapters/d1/__tests__/searchIndex.integration.test.ts:813` 付近 `const expected = [a.noteId, b.noteId].sort();` / 理由: JS の `Array.prototype.sort`（UTF-16 code unit 比較）と SQLite の BINARY collation は ASCII の UUID 文字列では一致するため結果は正しいが、テストが「note_id ASC である」ことを実装非依存に主張していない。また UUIDv7 は生成順で単調なので 2 件では `[a, b]` 固定順と同値 / 提案: `expected` を `[a.noteId, b.noteId]`（生成順 = UUIDv7 単調性）として固定するか、3 件以上で逆順 upsert して挿入順非依存であることを示すとより強い検証になる。任意改善

#### Notes

- **[N-001]** SQLインジェクション安全性: 問題なし。`sort` は `SearchSort`（`"relevance" | "newest"` の plain union）として型レベルで閉じており、`buildOrderBy` は文字列補間ではなく静的な drizzle `sql` フラグメント（`sql`sd.updated_at DESC, sd.note_id ASC``）の選択のみ。ユーザー入力が ORDER BY 句に到達する経路は存在しない。transport 境界（`app/routes/search.tsx` の `z.enum(SEARCH_SORTS)`）でも検証済みで、CLAUDE.md の「境界で検証し、間は静的型を信頼」の規約どおり
- **[N-002]** ORDER BY 切替の設計が良い: `buildOrderBy(sort, relevanceOrder)` に各経路固有の relevance 順（MATCH: `bm25 ASC, note_id ASC` / LIKE: `note_id ASC`）を引数で渡し、`newest` は両経路で単一の `sd.updated_at DESC, sd.note_id ASC` を共有する構造。relevance 経路の既存 ORDER BY がバイト単位で不変であることが diff から自明で、AC-7（後方互換）の保証が構造的
- **[N-003]** `updated_at DESC` の正しさ: `search_documents.updated_at` は `toRow` で常に `Date.toISOString()`（固定長 UTC ISO8601）で書き込まれるため、lexical DESC = 逆時系列が成立する。ヘルパーのコメントにもこの前提が明記されており、`buildDateRangeClause` の既存コメント（"ISO8601 strings, so lexical comparison is chronological"）と整合
- **[N-004]** ページネーション整合: カーソルは base64 オフセット方式のままで、同一 `sort` 内では同一 ORDER BY に対するオフセットなので重複・欠落なし（integration テストで 5 件 / limit 3 の 2 ページ連続性を検証済み）。sort 切替時の `cursor` リセットは UI 側（`SearchSortToggle` の `navigate` で `cursor: undefined`）で実施されており、計画 L72 の責務分担どおり。手組み URL で旧カーソルが残っても新順序へのオフセット適用になるだけでエラーにならない点も計画のリスク分析どおり
- **[N-005]** ファセットカウント非影響: `countByDateRanges` / `countMatch` / `countLike` は無変更（diff に含まれず）。`buildOrderBy` は `runMatchQuery` / `runLikeQuery` からのみ参照され、COUNT 系 SQL に ORDER BY は存在しない。domain JSDoc（`SearchSort`）にも「count surfaces are order-independent」と明記
- **[N-006]** ポート/シグネチャ非破壊: `SearchIndex` ポートは不変で、`sort` は `SearchQuery` VO 経由で伝播（計画ステップ1–3 どおり）。`runMatchQuery` / `runLikeQuery` の private シグネチャ末尾に `sort: SearchSort` を追加する最小変更で、スキーマ変更・マイグレーションなし（`updated_at` は #627 で projection 済み）という計画前提も実コードで確認した
- **[N-007]** インデックス不要の判断は妥当: `newest` の ORDER BY は MATCH/LIKE で絞られた結果セットに対するソートで、`SearchLimit` ≤ 50 + offset 上限も実用範囲。LIKE 経路は元々フルスキャンであり追加コストは計画 L157 の分析どおり軽微
- **[N-008]** integration テストのカバレッジは計画のテスト方針 4 項目（MATCH newest / tie-breaker / LIKE newest / newest ページング / デフォルト relevance 回帰）をすべて満たす。`makeDoc` への `updatedAt` パラメータ追加も既存デフォルト（`NOW`）を保ち非破壊
