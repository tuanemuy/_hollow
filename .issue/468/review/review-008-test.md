# Review 008 — Test（テスト網羅性・テスト設計）

対象: PR #834（Issue #468: source blob のストレージ衛生）/ head `8a7aaf9c`
ゼロベースのフルレビュー。plan.md の受け入れ基準・テスト方針、docs/test.md のテスト戦略に照らして検証した。

## 検証サマリー

対象スイートをローカルで実行し全パスを確認した:

- unit: `sweepAbandonedSourceIntakes.test.ts` / `service.test.ts` / `runPruneTick.test.ts` — 47 passed
- integration: `sweepAbandonedSourceIntakes.integration.test.ts` / `r2ObjectStorage.integration.test.ts` / `mediaAssetRepository.integration.test.ts` — 16 passed
- integration: `ingestion.integration.test.ts` / `handlers.integration.test.ts` — 69 passed

受け入れ基準とテストの対応:

| AC | 担保 | 判定 |
|---|---|---|
| AC-1（ポリシー明文化） | ADR-001 + `spec/domains/media.md`（ドキュメント。テスト対象外） | OK |
| AC-2（rollback → 自動回収） | `ingestion.integration.test.ts`「reclaims the source blob after a commit rollback via sweep → purge」— rollback 後の pending 行 + blob 残存 → sweep で orphan 化 → purge 1回で blob+行消滅まで単一テストで実証。put 失敗（blob なし行）経路も別テストで sweep → purge 完走まで実証 | OK |
| AC-3（cron 配線） | `runPruneTick.test.ts`（呼び出し順・失敗 swallow・他ステップ非阻害・outbox prune 失敗時の非実行）+ `handlers.integration.test.ts` の実 DB/実 R2 2-tick テスト | OK |
| AC-4（猶予内の誤回収防止） | sweep integration の境界ペア（24h+1min swept / 24h−1min skipped）で `DEFAULT_GRACE_SEC` をピン留め。さらに handlers integration が本番配線（デフォルト猶予）上で猶予内 pending の生存を assert | OK |
| AC-5（既存フロー退行なし） | #452 正常系（metadata フィールド assert が `SourcePersist` 縮小リファクタを直接ガード）・overwrite 差し替え・temp 欠損 skip・purge ループの既存テストすべて green | OK |

`spec/testcases/media/index.md`（SweepAbandonedSourceIntakes 8行）と `spec/testcases/ingestion/index.md`（Commit 追加5行)の全行が実装テストに 1:1 で対応していることを確認した（per-row save 失敗と fresh ガードの unit 分担は ADR「実装時の追加決定」どおり）。

## Test

### Blockers

なし

### Warnings

なし

7ラウンドの先行レビューを経たスイートとして、指摘に値する欠陥は見つからなかった。厳しく見た上で Warning 未満と判断した残余候補は Notes に記録する（N-006, N-007）。

### Notes

- **[N-001]** AC ↔ テストのトレーサビリティが完全。spec/testcases の追加行すべてが実装テストに対応し、テスト側コメントも spec / ADR への参照を明記している。全対象スイートがローカルで green（unit 47 + integration 85）。
- **[N-002]** strict `<` 境界が 3 層で一貫してピン留めされている: ドメイン述語（`isAbandonedSourceIntake` の cutoff 等値 → false）、D1 クエリ（`updatedAt == cutoff` 除外）、sweep integration のデフォルト猶予境界（24h ± 1min ペア）。plan が警告した同時刻フレーク級のリスクをクロックピン留め（`withFixedClock` / バックデート）で排除しており、`handlers.integration.test.ts` の実クロック使用箇所も 25h/1h と余裕のあるマージンで flake の懸念がない。
- **[N-003]** `handlers.integration.test.ts` の 2-tick テストが優秀。猶予内（1h）の pending source を併置して「tick がデフォルト猶予で sweep を呼ぶこと」（誤配線 `graceSec: 0` の検出）を本番経路で assert し、tick 1 終了時に orphan が残ることで「orphan は同一 tick の purge に食われない」（二重猶予）も暗黙に証明している。unit（モック）と integration（container → adapter 実配線）の分担が明確。
- **[N-004]** `ObjectStorage.delete` の冪等性契約（missing key = 成功）が、新設の `r2ObjectStorage.integration.test.ts`（実 R2 binding、削除→再削除まで）と、アプリ層の blob なし行 purge 完走テスト（in-memory 実装）の両側でピン留めされており、契約テストとして対称性がある。回収チェーンが構造依存する契約（ADR-002）の担保として適切。
- **[N-005]** DataIntegrityError ガードの 2 テストが `uowRuns === 3` で UoW トポロジを明示的にピン留めしている。リファクタで変異フックが空振りになる場合にテストが黙って無意味化せず、assertion で明示的に落ちる設計。rollback テストの outbox 検査（`media.*` 不在）や temp blob 保全 + 再 commit 干渉なしの assert も含め、副作用の検証範囲が広い。
- **[N-006]** `DEFAULT_GRACE_SEC` は境界テストでピン留めされている一方、`DEFAULT_BATCH_SIZE`（100）はどのテストにもピンされていない（unit は明示 `batchSize: 7` の貫通のみ検証、handlers integration は候補1件のため縮退しても通る）。誤縮退の実害は回収スループット低下のみで、スループット上限は既知の別 Issue 送りテーマに隣接するため Warning とはしない。テスト投資が「猶予誤り = データ喪失リスク」に正しく傾斜している証左でもある。
- **[N-007]** D1 `findAbandonedSourceIntakes` の除外テストは attached / orphan / 他 kind / 猶予内をカバーするが `deleting` の source 行は含まない。ただし実装は `status = 'pending'` の単一等値 + `filter(MediaAsset.isPending)` の静的絞り込みで二重に守られており、仮に SQL が退行しても観測可能な影響は limit 境界のスロット消費のみ。追試の価値は低い。
- **[N-008]** テスト分担が docs/test.md の方針に忠実: リポジトリ fake を常備しない方針を守りつつ、integration で作為なしに再現できない「候補列挙後の遷移」「特定行 save 失敗」だけをテストローカルの `MutableFakeRepo`（変異/失敗注入フック付き）で unit 検証し、その判断を ADR に記録している。fake の候補クエリが D1 実装の順序契約（updatedAt, id 昇順）を明示的に模倣し、D1 側にも tie-break の契約テストがある点も整合的。
