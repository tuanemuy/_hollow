# Review 002 — PR #674 (Issue #642: 公開検索ソート選択肢)

レビュー観点: Test（網羅性・テスト設計）— ゼロベースのフルレビュー（2回目）
実行確認: PR ブランチ HEAD（f9f1d745、working tree 一致を確認済み）で
`reduceSortSearch.test.ts` / `PublicSearch.test.tsx` / `searchPublicNotes.test.ts`
（3 files / 14 passed）と `pnpm test:integration`（55 files / 675 passed、
`searchIndex.integration.test.ts` 含む）を実際に実行し、全パスを確認した。

## 前回指摘（review-001-test.md）の解消確認

- **W-001 → 解消。** navigate reducer が `reduceSortSearch` として pure 関数に
  抽出され（`app/components/public/SearchSortToggle.tsx`）、
  `app/components/public/__tests__/reduceSortSearch.test.ts` で
  「newest 切替 = sort 書込み + cursor リセット」「relevance 復帰 = sort/cursor とも
  undefined」「他パラメータ（q/username/tags/period/limit）の保持」「入力の非破壊」
  の 4 ケースが固定された。提案どおり router モック不要の ms オーダーで回る。
  保持テストは `toEqual` の全形比較なので、`...prev` スプレッドの欠落・余計な
  キー混入のどちらにも落ちる。
- **W-002 → 解消。** MATCH 経路の default regression テスト
  （`searchIndex.integration.test.ts` "keeps the bm25 relevance order…"）に
  `sort: "relevance"` 明示クエリのアサーションが追加され、LIKE 経路にも
  "keeps the note_id ASC stable order on the LIKE path for default and explicit
  'relevance'" が新設された。LIKE 側 fixture は `updated_at` を note_id と逆順、
  upsert 順も逆転させており、newest 漏出・挿入順偶然一致のどちらでも落ちる
  偽陽性耐性のある構成。
- **W-003 → 解消。** LIKE 経路の newest テスト追加に加え、`seedPagingFixture` が
  同時刻ペア（tieA/tieB）を limit-3 のページ境界（3件目/4件目）に正確に配置し、
  MATCH / LIKE 両経路でカーソル連続性 + tie-breaker 安定性を 1 本ずつ固定した。
  tie ペアを最初に生成して note_id ASC を `updated_at` と独立に確定させる手当も
  正しい。提案（境界 tie で tie-breaker とカーソル安定性を同時固定）の理想形。
- **N-005（参考指摘）も対応済み。** 旧 `[a, b].sort()` による JS/SQLite 照合順の
  暗黙仮定は除去され、tie-breaker テストは monotonic な `nextId` の生成順
  （= note_id ASC）に依拠し、upsert を逆順にして挿入順偶然一致も排除している。

## Test

### Blockers

なし

### Warnings

なし

### Notes

- **[N-001]** 新 describe「D1SearchIndex sort (#642)」の 7 テストは全件、
  「ソートが no-op になった場合の自然順序が期待値と必ず食い違う」fixture 構成に
  なっており（newest 系は挿入順 ≠ 期待順、relevance 系は updated_at 逆順 +
  upsert 逆順）、`buildOrderBy` の素通し・分岐取り違えのいずれでも確実に落ちる。
  偽陽性リスクは低い。AC-2 / AC-6 / AC-7 のアダプター層分はすべて自動テストで
  固定された。
- **[N-002]** `SearchSortToggle` の React 配線（click → `router.navigate`、
  `useOptimistic` のラベルミラー、二連打時の `next` 導出）は自動テストなしで
  マニュアル記録（`.issue/642/.manual-test/`）のみ。reducer 抽出により URL 整合性
  リスク（AC-3/AC-5 の本体）は unit で固定済みであり、残りは表示系の薄い配線。
  docs/test.md「Frontend は必要最小限」の範囲内として妥当。
- **[N-003]** transport 境界の `sort: z.enum(SEARCH_SORTS).optional().catch(undefined)`
  （`app/routes/search.tsx:27`）の不正値正規化は自動テストなし（マニュアル EDGE
  記録で `sort=oldest` を確認）。route schema を unit でテストする先行例が
  リポジトリにないため、新規のテストインフラを要求するほどの価値はない。
- **[N-004]** `SearchQuery.create` の `sort` デフォルト（domain VO レベル）の
  直接テストはないが、同型の先行例 `dateBasis` も VO レベルでは未テストであり、
  usecase unit（omitted / null → `"relevance"` 伝播）と integration（省略時
  regression）で実効的に二重カバーされている。docs/test.md の「Domain ~100%」は
  不変条件・分岐ロジックが対象で、リテラル union + `?? "relevance"` には
  該当ロジックがない。
- **[N-005]** hidden input / 「次のページ」リンクへの `sort` 伝播
  （`PublicSearch.tsx:162, 265`）は前回 N-006 同様マニュアル検証のみ。
  `PublicSearch.test.tsx` の変更は hero コピー検証の型追従（`sort: null`）に
  とどまる。許容範囲だが、将来 P32 の URL 伝播パラメータがさらに増えるなら
  markup 構造検証を 1 本足す価値が出てくる。
- **[N-006]** integration テスト総数は 673 → 675 に増加（ページネーション
  境界 tie の MATCH/LIKE 2 本分の純増を含む再編）。既存テストの改変による
  カバレッジ後退はない。

## 総評

前回 Warnings 3 件はいずれも提案どおり、あるいは提案以上の形で解消されている。
特にページ境界 tie fixture とソート no-op 検出可能な fixture 設計は、偽陽性に
強い integration テストの好例。残る未自動化領域（React 配線・transport `.catch`・
URL 伝播）はすべて docs/test.md の Frontend 最小方針とマニュアル検証の役割分担に
収まっており、追加修正を要求する水準の不足はない。APPROVED 相当。
