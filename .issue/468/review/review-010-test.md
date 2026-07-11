# Review 010 — Test（テスト網羅性・テスト設計）

対象: PR #834 (Issue #468) / ゼロベースのフルレビュー
検証: `pnpm typecheck` green、新規・変更テストを実行して確認 — unit 47 passed（sweep unit / service / runPruneTick）、integration 86 passed（sweep / r2ObjectStorage / mediaAssetRepository / ingestion / handlers）。

## 受け入れ基準とテストの対応

| AC | 担保 | 判定 |
|---|---|---|
| AC-1（ポリシー明文化） | adr.md ADR-001 + `spec/domains/media.md` 保持ポリシー節（ドキュメントで担保、テスト対象外） | OK |
| AC-2（rollback → 自動回収） | `ingestion.integration.test.ts` "reclaims the source blob after a commit rollback via sweep → purge"（blob 残存 → pending 残存 → sweep → purge の全連鎖を実 DB + in-memory storage で実証）+ put 失敗系 "leaves a reclaimable pending row and no blob" | OK |
| AC-3（cron 配線） | `runPruneTick.test.ts`（呼び出し・順序・失敗 swallow・戻り値契約不変）+ `handlers.integration.test.ts` の 2-tick 実 DB/実 R2 経路 | OK |
| AC-4（grace 内の誤回収防止） | D1 repo テスト（strict `<` / RECENT 除外）、sweep integration（24h−1min 境界 skip）、tick integration の in-grace 行（本番デフォルト猶予での検証） | OK |
| AC-5（既存フロー退行なし） | 既存の commit 正常系（#452 source 束縛）・overwrite 差し替え（旧 source orphan 化）・temp delete・tag 系テストが同一ファイルで green | OK |

`spec/testcases/media/index.md` の SweepAbandonedSourceIntakes 8 行、`spec/testcases/ingestion/index.md` の追加 5 行は、すべて実装済みテストに 1:1 で対応していることを確認した（per-row save 失敗と fresh ガードの unit 分担は adr.md「実装時の追加決定」どおり）。

### Test

#### Blockers

なし

#### Warnings

なし

#### Notes

- **[N-001]** 境界のピン留めが両側から効いている: sweep integration の「24h−1min は skip」「24h+1min は swept」のペアが `DEFAULT_GRACE_SEC` を ±1min で挟み、domain unit の `isAbandonedSourceIntake` テストが strict `<`（cutoff 同時刻 = false）を秒粒度で固定。デフォルト値のタイポ（縮小・拡大どちら向きも）がテストで落ちる構造になっている。
- **[N-002]** `handlers.integration.test.ts` の 2-tick テストに仕込まれた in-grace の 2 本目の pending/source 行は、AC-4 を「本番配線のデフォルト引数」に対して検証する良い設計。副次的に、tick 1 内で sweep → purge が連続実行されるため、purge 側のデフォルト猶予が誤って 0 に配線された場合も `afterSweep`（orphan で残存）の assert が落ちる — sweep / purge 両方のデフォルトが 1 テストで暗黙にピン留めされている。
- **[N-003]** `r2ObjectStorage.integration.test.ts`（新規）が `ObjectStorage.delete` の冪等性契約（missing key = 成功）を**実 R2 binding** に対して検証している。アプリ層の blobless-row → purge 完走テストは in-memory fake 経由なので、fake と実アダプターの乖離（fake-drift）で契約検証が空洞化する穴をここで塞いでいる。ADR-002 の「契約として固定する」に忠実。
- **[N-004]** DataIntegrityError ガードの 2 テストが `expect(uowRuns).toBe(3)` で UoW トポロジー（job read → stage(a) insert → main UoW）をピン留めしている点は堅牢。usecase の UoW 数が変わると mutation 注入が空振りして偽陽性 pass になる典型的な罠を、テスト自身が検知できる。
- **[N-005]** sweep の `DEFAULT_BATCH_SIZE`（100）は直接ピン留めするテストがない（unit は明示値 7 の passthrough のみ）。誤設定してもスループット低下だけで正しさは保たれ、複数 tick で自己回復するため Warning には当たらない。将来 drain ループの上限設計（既知の別 Issue: purge スループット）に手を入れる際に併せてピン留めすると良い。
- **[N-006]** テスト専用の `MutableFakeRepo` / `PutThrowingObjectStorage` はいずれもテストファイルローカルで、`docs/test.md` の Fake 在庫方針（共有 fake は IdGenerator / Logger のみ）を汚さない配置。fake の候補クエリには D1 実装と同一の順序契約（updatedAt, id 昇順）がコメント付きで複製され、順序契約自体も D1 側の tie-break テストで固定されているため、fake-実装間の順序乖離が検知可能になっている。
