# PR #674 レビュー2回目（Issue #642: 公開検索にソート選択肢追加）

## Domain / Use Case

レビュー対象: `app/core/domain/search/valueObject.ts`、`app/core/application/search/searchPublicNotes.ts`、`spec/domains/search.md` / `spec/usecases/search.md` / `spec/pages/index.md`、テスト（`searchPublicNotes.test.ts` / `searchIndex.integration.test.ts`）、計画 `.issue/642/plan.md` との整合。ゼロベースのフルレビュー。

### 前回指摘（review-001）の解消確認

- **W-001 解消を確認。** `spec/domains/search.md` の `SearchQuery` フィールド一覧に `directoryPathPrefix: string | null` と `dateBasis: DateBasis`（デフォルト `date_for_calendar` の注記付き）が追記され、実装の `SearchQuery`（keyword / ownerIdFilter / visibilityFilter / tagNames / directoryPathPrefix / dateRange / dateBasis / sort / limit / cursor）と一致した。`dateBasis` の意味（dateRange の適用軸）と `sort` の意味（newest = projection `updated_at` 降順 + `note_id` tie-breaker、カウント系に影響なし）の説明行も追加されており、単一の真実としての spec の品質が回復している。

### 計画・受け入れ基準との照合（ドメイン/ユースケース観点）

- AC-1: `spec/pages/index.md` P32 にソート選択肢（関連度順 = bm25 / 新着順 = `updated_at` 降順、`sort` パラメータ、省略時関連度順、切替時 `cursor` リセット、period × newest の時間軸差の補足）が定義済み。充足
- AC-2: `SearchSort` JSDoc・usecase 入力 JSDoc・integration テスト（MATCH 経路 `updated_at DESC` + tie-breaker 検証）で担保。充足
- AC-5（ドメイン側の前提）: カーソルリセットは UI 責務（`reduceSortSearch`）に置かれ、VO / usecase は sort と cursor を直交に扱う。オフセットカーソルが同一 ORDER BY 内でのみ意味を持つというアダプター不変条件は tie-breaker 付き ORDER BY とページ境界 tie のページネーションテストで担保。充足
- AC-6: `buildOrderBy(sort, relevanceOrder)` が LIKE 経路に `sd.note_id ASC` を relevanceOrder として渡す構造で spec 文言（「関連度順時は note_id 安定ソート」）と一致。LIKE × newest / LIKE × relevance 両方に integration テストあり。充足
- AC-7: `SearchQuery.create` のデフォルト `"relevance"` + usecase の `input.sort ?? "relevance"`。`searchOwnNotes` / `searchUserPublicNotes` / `countPublicSearchFacets` は無変更（`sort` 不使用）で従来挙動。unit テストが省略 / null の両方を検証。充足
- 計画ステップ1（`SearchSort` plain union + `SearchQuery.sort` デフォルト付きオプション）・ステップ2（`SearchPublicNotesInput.sort?: SearchSort | null`）・ステップ8（spec 3ファイル更新）は記載どおりに実装されている

### Blockers

なし

### Warnings

なし

### Notes

- **[N-001]** `SearchSort` を `DateBasis` と同型の plain union（brand なし）+ `SearchQuery.create` のデフォルト付きオプションとした設計は、illegal states unrepresentable（不正値は型レベル排除、transport 境界は `z.enum(SEARCH_SORTS)`、`searchSchema` は `.catch(undefined)` / `renderInputSchema` は `.catch` なしの規約どおり）と既存先行例への一貫性を両立しており適切
- **[N-002]** レイヤー責務の分離が正しい。`SearchIndex` ポートのシグネチャは不変（VO 経由で伝播）、ORDER BY への翻訳はアダプター内 `buildOrderBy` に閉じ、「LIKE 経路に bm25 が無い」という知識を各経路が自分の `relevanceOrder` を渡す形で局所化している
- **[N-003]** usecase の `sort: input.sort ?? "relevance"` は `SearchQuery.create` のデフォルトと二重定義（`?? undefined` でも同値）だが、`cursor: input.cursor ?? null` と同じ既存流儀であり許容。将来デフォルトを変える場合のみ2箇所同期に留意（review-001 N-003 の再掲、対応不要）
- **[N-004]** `SearchQuery` 型コメントの「only the public search surface (P32) exposes `'newest'`」はプレゼンテーション事情への言及だが、デフォルトが relevance である WHY の説明として有用で、コード依存は発生していない。許容範囲（review-001 N-004 の再掲）
- **[N-005]** テストカバレッジは計画のテスト方針を満たす。unit: sort 伝播 + 省略/null デフォルト。integration: MATCH/LIKE × newest、tie-breaker、ページ境界 tie をまたぐページネーション（MATCH/LIKE 両方 — 計画より手厚い）、relevance デフォルト回帰（MATCH/LIKE）。UI 側も `reduceSortSearch` を pure 関数として切り出して cursor リセット・パラメータ保持・非破壊性を直接検証しており、AC-3/AC-5 のロジック部分がプレゼンテーション層内で適切にテスト可能化されている
- **[N-006]** クライアントコンポーネント（`SearchSortToggle.tsx`）からの `import type { SearchSort }` はドメイン層への型のみ参照で、依存方向（presentation → domain）として正当。実体の漏出なし
