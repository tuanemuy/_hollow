# PR #785 レビュー（2回目） — Domain / Application

**対象 PR:** #785 / Issue #779（公開検索 P32 の結果タイトルへの `<mark>` ハイライト）
**観点:** Domain / Application 層
**方式:** 前ラウンド指摘（W-001）の修正確認 ＋ ゼロベースでのフルレビュー
**結論:** 受け入れ基準のドメイン/アプリ層関連（AC-1 / AC-3 / AC-4 / AC-5）は計画・ADR どおり正しく実装されている。前ラウンドの **W-001 は妥当に修正済み**。`SearchHighlightedTitle` VO はスニペットの `SearchBody`/`SearchSnippet` 分離と対称で、保存用不変条件を汚さず illegal state も作っていない。`SearchQuery.highlight` の既定 true は後方互換を維持し、AC-5 のサーフェス別制御は構造的に担保されている。`pnpm typecheck` パス。**Blocker / Warning なし。**

## Domain / Application

### Blockers

なし

### Warnings

なし

### Notes

- **[N-001 / W-001 修正確認]** 公開描画サーフェスの `highlight` 明示が妥当に入った。`searchPublicNotes.ts:66-69` で `SearchQuery.create` に `highlight: true` を明示し、「own-notes の `highlight: false` をミラーする／create-time の既定に依存しない」旨のコメントを付与済み。`searchOwnNotes.ts:59-63`（`highlight: false`）と意図の対称性が回復し、`dateBasis`/`sort` を両面で明示しているのと同じ粒度に揃った。既定が将来変わってもサイレントに公開面のハイライトが消えるトレーサビリティ弱点は解消。`searchUserPublicNotes.ts:36` は `searchPublicNotes` へ委譲のみで直接 `create` しないため、この明示は委譲先で一元化されている。**W-001 はクローズ可。**

- **[N-002]** `SearchHighlightedTitle` VO（`valueObject.ts:117-144`）の新設は先例と完全に対称。`SearchTitle`(cap 200, 保存用 `SearchDocument.title` と共用) を据え置き、描画用に別ブランド VO(cap 1024) を切る判断は `SearchBody`(保存) / `SearchSnippet`(描画) 分離（`valueObject.ts:146-162, 308-321`）の既存イディオムと一致。保存用不変条件を汚さず、ブランド分離で `keyword`/`cursor` 等と同様に取り違えを型で防いでいる。cap 1024 の導出（trigram 最小一致3コードポイント→最悪区間≈50→overhead≈650→合計≈850<1024、到達不能の安全弁）が JSDoc(`valueObject.ts:20-28, 117-129`)に定量的に残されており、overflow パス（`HighlightedTitleTooLong`）が defence-in-depth である旨も明記。`SearchHit.title` 型が `SearchHighlightedTitle` に変更され（`valueObject.ts:461`）、アダプター `toHit` も `SearchHighlightedTitle.create`（`searchIndex.ts:466`）へ追従済み。

- **[N-003]** エラーコード `HighlightedTitleTooLong: "search_highlighted_title_too_long"`（`errorCode.ts:7`）は命名規約（PascalCase キー / lower_snake 値、`search_` プレフィックス）に適合。`errorCodeNaming.test.ts` で自動検証され、`SearchErrorCode` は EXPECTED セット既登録のため新規追加も自動カバー。`BusinessRuleError(SearchErrorCode.HighlightedTitleTooLong, …)` の throw 形（`valueObject.ts:136-141`）も既存 `TitleTooLong`/`SnippetTooLong` と同型。

- **[N-004]** AC-5 のサーフェス別制御は正しく機能。`SearchIndex.query()` を共有する直接呼び出しを全件確認: `searchOwnNotes`(`highlight:false`) / `searchPublicNotes`(`highlight:true` 明示) / `countPublicSearchFacets`。`countPublicSearchFacets.ts:75-89` は `highlight` 未指定で既定 true だが、`countFacets`→`countByDateRanges` 経路は title/snippet を SELECT しない（`searchIndex.ts:339-375` の `COUNT(*)` のみ）ため inert で、生マーカー漏れの経路を持たない。`searchUserPublicNotes` は `searchPublicNotes` へ委譲し漏れなし。自ノートビューへの新規リグレッションは構造的に防止されている。

- **[N-005]** DTO の透過性と契約コメントが正確。`toSearchHitDTO` の `hit.title as string`（`dto/search.ts:72`）は新ブランドが `string` の部分型のため透過、`view.ts` の `toSearchHitView`/`toOwnedSearchHitView`（`view.ts:16-40`）は委譲のみで影響なし。`SearchHitDTO` の JSDoc(`dto/search.ts:4-14`)は title/snippet とも `<mark>` を含み得る描画用文字列であること、opt-out 面（own-notes P30, `highlight:false`）はプレーンを受ける旨を明示しており、スニペットと同じ契約として妥当。

- **[N-006]** `SearchQuery.highlight: boolean` は型上は必須フィールドで、`create` が `params.highlight ?? true` で既定を与える（`valueObject.ts:406, 443`）。構築後は値が常に確定し illegal state は表現不能。`dateBasis`/`sort` と同じ opt-in パターンで一貫。型変更で壊れるフィクスチャ4箇所も `SearchHighlightedTitle.create` へ追従済み（`dto/__tests__/search.test.ts:17`, `searchOwnNotes.test.ts:111`, `searchPublicNotes.test.ts:86`, `service.test.ts:105`）。テストカバレッジも十分: VO（≤1024 受理・>1024 を `HighlightedTitleTooLong` 拒否、`valueObject.test.ts:102-126`）、フラグ伝播（own=false `searchOwnNotes.test.ts:169-182` / public=true `searchPublicNotes.test.ts:137-150`）、アダプター統合（AC-1/3/4/5、`searchIndex.integration.test.ts:743-862` で MATCH ハイライト・本文のみ一致時のタイトル無マーク・`highlight:false` プレーン・LIKE フォールバック非マークを網羅、空スニペット回帰ガードも付与）。

- **[N-007 / 任意]** `countPublicSearchFacets.ts:75` の `SearchQuery.create` は `highlight` を明示せず既定 true に依存している（N-004 のとおり inert で無害）。N-001 の対称性原則を厳密に貫くなら `highlight: false`（count は描画も SELECT もしないので false が意味的に正確）を明示する選択肢もあるが、count サーフェスはハイライトと無関係であり、明示するとかえって「count がハイライトを気にする」誤読を招きうる。現状（未指定＝既定）でも漏れ経路がなく問題ないため、**変更不要。設計判断として現状維持を支持する**。
