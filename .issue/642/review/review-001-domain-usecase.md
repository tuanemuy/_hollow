# PR #674 レビュー（Issue #642: 公開検索にソート選択肢追加）

## Domain / Use Case

レビュー対象: `app/core/domain/search/valueObject.ts`、`app/core/application/search/searchPublicNotes.ts`、関連 spec（`spec/domains/search.md` / `spec/usecases/search.md`）、および計画 `.issue/642/plan.md` との整合。

### 計画・受け入れ基準との照合（ドメイン/ユースケース観点）

- AC-2（新着順 = `updated_at` 降順）: `SearchSort` の JSDoc と `D1SearchIndex` の integration テストで `updated_at DESC + note_id ASC` を検証。充足
- AC-6（LIKE 経路の新着順 / 関連度順時は `note_id` 安定ソート）: `buildOrderBy` が LIKE 経路に `relevanceOrder = sd.note_id ASC` を渡す構造で spec 文言と一致。integration テストあり。充足
- AC-7（`sort` 省略時は関連度順・後方互換）: `SearchQuery.create` デフォルト `"relevance"` + usecase の `input.sort ?? "relevance"`。`SearchQuery.create` の全呼び出し元（`searchOwnNotes` / `countPublicSearchFacets` / `searchPublicNotes`）を確認し、`searchPublicNotes` 以外は無変更で従来挙動を維持することを確認。`searchUserPublicNotes` は `searchPublicNotes` の thin wrapper で `sort` を渡さないため relevance 固定 — 計画のスコープ（P32 のみ露出）どおり。充足
- 計画ステップ1・2は記載どおりに実装されている（`DateBasis` と同型の plain union + デフォルト付きオプション、`SearchPublicNotesInput.sort?: SearchSort | null`）

#### Blockers

なし

#### Warnings

- **[W-001]** `spec/domains/search.md` の `SearchQuery` フィールド一覧が実装と不一致のまま（`sort` 追加時に同じ行を編集しているのに `dateBasis` と `directoryPathPrefix` が一覧に欠けている） / 場所: `spec/domains/search.md:67`（フィールド一覧行） / 理由: spec は単一の真実（CLAUDE.md / plan.md ステップ8の前提）。本PRはまさにこの行を編集して `sort: SearchSort` を追記しており、実装の `SearchQuery`（`keyword / ownerIdFilter / visibilityFilter / tagNames / directoryPathPrefix / dateRange / dateBasis / sort / limit / cursor`）との乖離が残ると、次に `SearchQuery` を触る人が spec を信じて誤った前提で設計するリスクがある。乖離自体は本PR以前からの既存問題だが、当該行を触った本PRで直すのが最小コスト / 提案: フィールド一覧に `directoryPathPrefix: string | null` と `dateBasis: DateBasis` を追記する（`dateBasis` のデフォルト `date_for_calendar` の注記も一言あるとよい）

#### Notes

- **[N-001]** `SearchSort` を `DateBasis` と同型の plain union + `SearchQuery.create` のデフォルト付きオプションとした判断は適切。illegal states unrepresentable（不正値は型レベルで排除、transport 境界は `z.enum(SEARCH_SORTS)` で検証）の原則と、既存先行例への一貫性の両方を満たしている。brand 不要の判断も妥当（2値リテラルに runtime 不変条件はない）
- **[N-002]** ポート設計が正しく不変に保たれている点が良い。`SearchIndex.query(q: SearchQuery)` のシグネチャは変えず VO 経由で `sort` を伝播し、ORDER BY への翻訳（`buildOrderBy`）はアダプター内に閉じている。`relevance` 時の経路別順序（bm25 / note_id）を「各経路が自分の relevanceOrder を渡す」構造にしたのは、LIKE 経路に bm25 が存在しないという制約を呼び出し側の知識にせずに済む良い分解
- **[N-003]** usecase の `sort: input.sort ?? "relevance"` は `SearchQuery.create` のデフォルトと二重定義になっている（`input.sort ?? undefined` でも同値）。挙動上の問題はなく、`cursor: input.cursor ?? null` と同じ「usecase で null → 正規化」の既存流儀に沿っているため許容。ただし将来デフォルトを変える場合は2箇所の同期が必要になる点だけ留意
- **[N-004]** `SearchQuery` 型コメントの「only the public search surface (P32) exposes `'newest'`」はドメイン層からプレゼンテーション事情（ページID）への言及だが、「なぜデフォルトが relevance か」の WHY 説明としては有用であり、依存方向の違反ではない（コードはどのサーフェスも知らない）。許容範囲
- **[N-005]** テストの妥当性: `searchPublicNotes.test.ts` の伝播テスト（`sort: "newest"` → `SearchQuery.sort`）と省略/null 両方のデフォルト検証は AC-7 を直接担保。integration テストの tie-breaker 検証（同一 `updated_at` 時の `note_id ASC`）と newest ページネーションの連続性検証（重複・欠落なし）は、オフセットカーソル安定性というアダプター不変条件を正しく押さえている。relevance 回帰テスト（dense doc が古くても先頭）もデフォルト挙動の良いガード
- **[N-006]** `SearchSort` JSDoc で「`sort` は `countByDateRanges` に影響しない」を明文化し、spec（`spec/domains/search.md`）にも同内容を反映している。計画レビュー（arch-risk S-001）の指摘事項が実装まで一貫して反映されている
