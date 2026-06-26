# PR #785 レビュー — Domain / Application

**対象 PR:** #785 / Issue #779（公開検索 P32 の結果タイトルへの `<mark>` ハイライト）
**観点:** Domain / Application 層
**結論:** 受け入れ基準のドメイン/アプリ層関連（特に AC-5 のサーフェス別制御）は計画・ADR どおり正しく実装されている。VO 設計はスニペットの `SearchBody`/`SearchSnippet` 分離と一貫し、ドメインロジックのアダプター/UI 漏れはなく、`SearchQuery.highlight` の既定 true は後方互換を壊さない。illegal state も作っていない。**Blocker なし。** 軽微な指摘のみ。

## Domain / Application

### Blockers

なし

### Warnings

- **[W-001]** 公開描画サーフェスが `highlight` を明示せず既定値（true）に依存している。
  - 場所: `app/core/application/search/searchPublicNotes.ts:55-68`（および `searchUserPublicNotes.ts` 経由）
  - 理由: 自ノート面は `searchOwnNotes.ts:63` で `highlight: false` を**明示**して意図を宣言しているのに対し、AC-1 で実際にハイライトを必要とする公開面は `SearchQuery.create` の既定 true に暗黙依存している。意図の対称性が崩れ、将来 `SearchQuery.create` の既定が変わった場合に公開面のハイライトがサイレントに消えるトレーサビリティ上の弱さがある。
  - 提案: `searchPublicNotes` の `SearchQuery.create` に `highlight: true` を明示する（計画 L72/L105 も「明示は任意」としており、明示は設計と矛盾しない）。`dateBasis`/`sort` を両面で明示しているのと同じ粒度に揃う。低優先度。

### Notes

- **[N-001]** `SearchHighlightedTitle` VO の新設は妥当で先例と完全に対称。`SearchTitle`(cap 200, 保存用 `SearchDocument.title` と共用) を据え置き、描画用に別ブランド VO(cap 1024) を切る判断は `SearchBody`(保存) / `SearchSnippet`(描画) 分離（`valueObject.ts:150-162, 309-321`）の既存イディオムと一致。保存用不変条件を汚さず、ブランド分離で `keyword`/`cursor` 等と同様に取り違えを型で防いでいる。cap 1024 の導出（trigram 最小一致3コードポイント→最悪区間≈50→overhead≈650→合計≈850<1024、到達不能の安全弁）が JSDoc(`valueObject.ts:20-28, 117-129`)に定量的に残されており、将来 cap を触る人への配慮が `LIKE_SNIPPET_CHARS` の caveat 精度と揃っている。

- **[N-002]** エラーコード `HighlightedTitleTooLong: "search_highlighted_title_too_long"`（`errorCode.ts:7`）は命名規約（PascalCase キー / lower_snake 値、`search_` プレフィックス）に適合。`errorCodeNaming.test.ts` の KEY_REGEX/VALUE_REGEX で自動検証され、`SearchErrorCode` は EXPECTED セットに既登録のため新規追加も自動カバー。`BusinessRuleError(SearchErrorCode.HighlightedTitleTooLong, …)` の throw 形（`valueObject.ts:136-141`）も既存 `TitleTooLong`/`SnippetTooLong` と同型。

- **[N-003]** AC-5 のサーフェス別制御は正しく機能している。`SearchIndex.query()` を共有する全直接呼び出し（`searchOwnNotes`/`searchPublicNotes`/`countPublicSearchFacets`）を確認: 自ノートのみ `highlight: false`、公開2面は既定 true。`countPublicSearchFacets.ts:75` は `countFacets`（title/snippet を SELECT しない）経由のため既定 true でも無害（inert）。`searchUserPublicNotes` は `searchPublicNotes` へ委譲し直接 `create` しないため漏れなし。自ノートビューへの生マーカー漏れ（新規リグレッション）を構造的に防げている。

- **[N-004]** DTO の透過性と契約コメントが正確。`toSearchHitDTO` の `hit.title as string`（`dto/search.ts:71`）は新ブランドが `string` の部分型のため透過に動作し、`view.ts` の `toSearchHitView`/`toOwnedSearchHitView` は委譲のみで影響なし。`SearchHitDTO` の JSDoc(`dto/search.ts:8-13`)が title/snippet とも `<mark>` を含み得る描画用文字列であること、opt-out 面（own-notes P30）はプレーンを受ける旨を明示しており、スニペットと同じ契約として妥当。

- **[N-005]** `SearchQuery.highlight: boolean` は型上は必須フィールドで、`create` が `params.highlight ?? true` で既定を与える（`valueObject.ts:406, 443`）。構築後の値は常に確定しており illegal state は表現不能。`dateBasis`/`sort` と同じ opt-in パターンで一貫。型変更で壊れるテストフィクスチャ4箇所も `SearchHighlightedTitle.create` へ正しく追従済み（`dto/__tests__/search.test.ts:17`, `searchOwnNotes.test.ts:111`, `searchPublicNotes.test.ts:86`, `service.test.ts:105`）。VO テスト（≤1024 受理・>1024 を `HighlightedTitleTooLong` で拒否、`valueObject.test.ts:102-126`）も網羅。
