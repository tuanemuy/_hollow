# Review 001 — PR #674 (Issue #642: 公開検索ソート選択肢)

レビュー観点: Test（網羅性・テスト設計）
実行確認: PR ブランチ（ce06e348）で `searchPublicNotes.test.ts`（8 passed）、`PublicSearch.test.tsx`（2 passed）、`pnpm test:integration`（55 files / 673 passed）を実際に実行し、全パスを確認済み。

### Test

#### Blockers

なし

#### Warnings

- **[W-001]** `SearchSortToggle` の navigate reducer（AC-3 の「relevance 時は `sort` を URL から除去」と AC-5 の「切替時に `cursor` をリセット」）に自動テストが一切ない
  / 場所: `app/components/public/SearchSortToggle.tsx:124-147`（テストファイル不在）
  / 理由: AC-5 は plan の「リスクと注意点」筆頭に挙がった整合性リスクの対策そのものであり、その実装が `nextSearch.cursor = undefined` / `nextSearch.sort = next === "relevance" ? undefined : next` の 2 行に集約されているのに、検証はマニュアルテスト（TC 記録）のみ。同じ public 配下のクライアント島 `SearchFilterDrawer` には `__tests__/SearchFilterDrawer.test.tsx`（markup 検証）の先行例があり、「frontend は必要最小限」（docs/test.md）の範囲でも、この reducer はリグレッションで静かに壊れやすい（例: `...prev` スプレッドの変更で `cursor` が残る）。マニュアル記録は今回の snapshot であり回帰ガードにならない
  / 提案: reducer を pure 関数（`(prev, current) => next`）に抽出して unit テスト（「newest へ切替で `sort: "newest"` + `cursor` 除去」「relevance へ戻すと `sort` も `cursor` も undefined」「他のパラメータ（q / username / tags / period / limit）が保持される」）を追加する。抽出すれば router モック不要で数ミリ秒で回る

- **[W-002]** 明示的な `sort: "relevance"` がアダプター integration テストで一度も exercise されていない（省略時デフォルトのみ）。特に LIKE 経路 × `sort: "relevance"` の `note_id ASC` 安定ソート（AC-6 後半「関連度順時の LIKE 経路は従来どおり `note_id` 安定ソート」）を直接検証するテストがない
  / 場所: `app/core/adapters/d1/__tests__/searchIndex.integration.test.ts:742-915`（新 describe）
  / 理由: plan のテスト方針は「MATCH 経路: `sort` 省略 / `"relevance"` で従来の bm25 順が維持されること」と両方を明記しているが、実装されたのは省略ケースのみ（`makeQuery({ keyword: "design" })`）。`buildOrderBy` は `sort === "newest"` の二分岐なので現実装では同値だが、テストは実装の対偶ではなく契約（VO の `"relevance"` 値が両経路で従来順序を生む）を固定すべき。将来 sort 値が増えて分岐が書き換わったとき、省略ケースだけでは `"relevance"` 明示パスの回帰を捕まえられない
  / 提案: MATCH 経路の既存 regression テストに `sort: "relevance"` 明示のアサーション（または同一 fixture でのもう 1 クエリ）を追加し、LIKE 経路にも `sort: "relevance"`（および省略）で `note_id ASC` 順を直接 assert するケースを 1 本足す

- **[W-003]** newest の tie-breaker テストが MATCH 経路のみで、LIKE 経路の同時刻 tie（`updated_at DESC, note_id ASC`）は未検証
  / 場所: `app/core/adapters/d1/__tests__/searchIndex.integration.test.ts:786-811`
  / 理由: `buildOrderBy` が両経路共通なので現実装では冗長に見えるが、テストは SQL 文字列の共有ではなく経路ごとの観測可能な振る舞いを契約として固定するのが integration 層の役割（docs/test.md「経路ごとに 1 本」）。また newest ページネーションテスト（:845-880）は全行の `updatedAt` が distinct で、ページ境界に tie がまたがるケース（オフセットカーソルの安定性が tie-breaker に依存する唯一の局面）を exercise していない
  / 提案: LIKE 経路の tie ケースを 1 本追加。ページネーションテストの fixture に同時刻ペアをページ境界（3件目/4件目）に置けば、tie-breaker とカーソル安定性を 1 本で同時に固定できる

#### Notes

- **[N-001]** 新規 integration テストは偽陽性に対して堅牢。各 fixture を確認したところ、ソートが no-op になった場合の自然な順序（bm25 同点 → `note_id ASC` = 挿入順）は期待値と必ず食い違う構成になっており（MATCH newest: 挿入順 old→fresh→mid vs 期待 fresh→mid→old、LIKE newest / pagination も同様）、`buildOrderBy` を素通しにすると確実に落ちる。default regression テストも「古いが dense / 新しいが sparse」の対置で newest と relevance を判別可能にしており設計が良い
- **[N-002]** `searchPublicNotes.test.ts` の伝播テストは既存 spy-fake パターン（`observed` キャプチャ）に揃っており、省略と `null` の両方をひとつのテストで `["relevance", "relevance"]` として固定しているのは AC-7 の検証として適切。docs/test.md の「usecase の振る舞いは integration に寄せ、unit は伝播・分岐確認」という方針にも合致
- **[N-003]** マニュアルテスト記録（`.issue/642/.manual-test/`）が充実: 不正 `sort=oldest`（transport 境界の `.catch` → URL 正規化）、旧カーソル + 手組み `sort=newest`（エラーなしの整合動作）、0件/1件でのトグル、カウント系のソート非依存（REGRESSION #3/#4）まで押さえている。これらは自動化困難 or 費用対効果が低い領域で、docs/test.md の manual/browser verification 方針に沿う。ただし記録は snapshot であり、W-001/W-002 の自動化を代替するものではない
- **[N-004]** REGRESSION の P30（`/notes/search`）確認は認証情報なしで SKIP されている。ドメイン VO のデフォルト値経由の無害性は既存 unit/integration が無変更で 673 件パスしていることで担保されており、P30 に UI 変更はないため実害リスクは低い（記録としては妥当な SKIP 判断）
- **[N-005]** tie-breaker テストの期待値導出 `[a.noteId, b.noteId].sort()`（:810）は JS の UTF-16 順 vs SQLite BINARY 照合の一致を暗黙に仮定している。小文字 hex UUID では常に一致するため現状問題ないが、ID 形式が変わると静かに前提が崩れる。固定 id 2 つを明示する方がテストの意図（ASC である事実）が読み取りやすい
- **[N-006]** `PublicSearch.test.tsx` の変更は型追従（`sort: null`）のみで、hidden input / 次ページリンクへの `sort` 伝播はマニュアル検証のみ。frontend 最小方針の範囲内として許容（W-001 が解消されればリスクの大半は潰れる）
