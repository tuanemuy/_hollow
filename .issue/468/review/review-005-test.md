# PR #834 レビュー（Round 5）

## 対象

- PR: #834（Issue #468: source blob のストレージ衛生 — 保持ポリシー明文化と孤児 blob 回収）
- 観点: Test（テスト網羅性・テスト設計）。ゼロベースのフルレビュー
- 検証: 新規・変更テストを全て精読し、ローカルで実行して green を確認
  - unit: `sweepAbandonedSourceIntakes.test.ts` / `service.test.ts` / `runPruneTick.test.ts` — 42 passed
  - integration: `sweepAbandonedSourceIntakes.integration.test.ts` / `mediaAssetRepository.integration.test.ts` — 14 passed
  - integration: `ingestion.integration.test.ts` / `handlers.integration.test.ts` — 69 passed

## 受け入れ基準とテストの対応

| AC | 担保 | 判定 |
|---|---|---|
| AC-1（ポリシー明文化） | ADR-001 + `spec/domains/media.md` 保持ポリシーセクション（ドキュメントのみ、テスト対象外） | 充足 |
| AC-2（put 成功・UoW ロールバック → 自動回収） | `ingestion.integration.test.ts`「reclaims the source blob after a commit rollback via sweep → purge」— 残存 assert → 再 commit 非干渉 → sweep → purge 完走まで実 DB で実証 | 充足 |
| AC-3（cron 配線） | `runPruneTick.test.ts`（呼び出し・順序・失敗 swallow・outbox 失敗時の非実行）+ `handlers.integration.test.ts` の 2-tick 実 DB/実 R2 経路 | 充足（W-003 の補強余地あり） |
| AC-4（grace window の誤回収防止） | sweep integration「skips ... inside the grace window」、adapter の strict `<` 境界テスト、E2E での attached 行非干渉 | 充足（W-002/W-003 の補強余地あり） |
| AC-5（既存フロー退行なし） | #452 正常系（L713）・overwrite 差し替え（L1574）が新フロー上で green。temp 欠損 skip の順序不変条件も新テストで固定 | 充足 |

`spec/testcases/media/index.md` の SweepAbandonedSourceIntakes 全 7 行、`spec/testcases/ingestion/index.md` の新 4 行は、いずれも実装テストと 1:1 で対応していることを確認した。

### Test

#### Blockers

なし

#### Warnings

- **[W-001]** `ObjectStorage.delete` の「missing key = 成功」契約が、唯一の本番実装である `R2ObjectStorage` に対して未検証。
  - 場所: `app/core/adapters/cloudflare/__tests__/r2ObjectStorage.test.ts`（delete のテストが 1 本も無い）/ `app/worker/cloudflare/__tests__/handlers.integration.test.ts`（実 R2 経路は blob ありのケースのみ）
  - 理由: 本 PR はこの冪等性を「hard port contract」（`ports/objectStorage.ts` JSDoc / ADR-002）へ格上げし、blob なし `pending` 行の purge 完走がこれに構造的に依存する。しかし契約検証テスト（`sweepAbandonedSourceIntakes.integration.test.ts` の blobless ケース、ingestion の put 失敗ケース）はすべて application ヘルパーの `InMemoryObjectStorage` に対してのみ走る。現状の R2 実装は `bucket.delete` 素通しで契約を満たすが、将来 `head` チェック + `StorageNotFoundError` を足すようなリグレッションをどのテストも検出できない — その故障モードは「blob なし行が `deleting` で永久 stall」という ADR-002 が明示的に警告するもの。
  - 提案: `handlers.integration.test.ts`（miniflare の実 R2 binding が使える）に blob を put しない variant を 1 本足す、または R2 binding スタブで `R2ObjectStorage.delete` が存在しないキーで resolve することを直接 assert する adapter テストを追加する。
- **[W-002]** sweep のデフォルト猶予 24h が境界近傍でピン留めされていない。
  - 場所: `app/core/application/media/__tests__/sweepAbandonedSourceIntakes.integration.test.ts`「skips a pending source still inside the grace window」（1h 前の行を使用）
  - 理由: swept 側は 24h+60s 前、skip 側は 1h 前なので、`DEFAULT_GRACE_SEC` が誤って (1h, 24h) の任意値（例: `2 * 60 * 60` へのタイポ）に縮んでも両テストとも pass する。猶予の縮小は「進行中 intake の誤 orphan 化 → main UoW の DataIntegrityError 化 → 24h 後の blob purge」に直結する安全側パラメータであり、spec 行「24h 未満 → スキップ」の検証としては 1h は緩すぎる。なお sec/ms 混同（cutoff 計算の `*1000` 漏れ等）は現行テストで検出できることは確認済み。
  - 提案: skip ケースの行を 24h − 1min 前に変更（または追加）し、documented default を境界でピン留めする。
- **[W-003]** prune tick が sweep / purge を**デフォルト引数で**呼んでいることを固定するテストがない。
  - 場所: `app/worker/cloudflare/__tests__/runPruneTick.test.ts`（呼び出し回数・順序のみ assert、引数は未検証）/ `app/worker/cloudflare/__tests__/handlers.integration.test.ts`（25h 前の行のみ seed）
  - 理由: `handlers.ts` が誤って `sweepAbandonedSourceIntakes(mediaContainer, { graceSec: 0 })` と配線されても現行スイートは全 green（unit は引数を見ず、integration は猶予超過の行しか置いていない）。graceSec 0 の tick は、tick と同時刻に走っている正当な commit の pending/source を orphan 化し得る（main UoW の isPending ガードで commit 自体が DataIntegrityError で落ちる）。AC-4 の本番経路（tick）での担保はこの 1 点が抜けている。
  - 提案: `handlers.integration.test.ts` の 2-tick テストに「1h 前の pending/source」を並置 seed し、両 tick 後も `pending` のままであることを assert する（tick のデフォルト猶予と AC-4 を実経路で同時に固定できる）。unit 側で `toHaveBeenCalledWith(expect.anything())`（options なし）を足すのでも可。

#### Notes

- **[N-001]** AC-2 の E2E テスト（rollback → 残存 assert → outbox の `media.*` 非漏出 → temp 保全 → 再 commit 非干渉 → sweep → purge 完走）は受け入れ根拠として模範的。strict `<` 境界に対するクロックピン留め（`withClock` + 段階的な時刻前進）で同時刻フレークを構造的に排除しており、put 失敗・temp 欠損の各テストに「順序を逆にするとこのテストが落ちる」という不変条件の説明コメントが付いているのも良い。
- **[N-002]** レイヤー分担が docs/test.md の方針に忠実。integration では作為なしに到達できない分岐（fresh `findById` ガード、行消失、per-row save 失敗分離）だけをテストローカルの `MutableFakeRepo`（変異注入フック付き）で unit に切り出し、その判断を ADR「実装時の追加決定」に記録している。クエリレベル冪等性テストに「per-row ガードはこの経路では exercise されない」と意図を明記している点も、カバレッジの錯覚を防いでいて良い。
- **[N-003]** `findAbandonedSourceIntakes` の `(updatedAt, id)` タイブレークを D1 integration テストで limit 境界越しに検証し、ポート契約として JSDoc に明文化した上で、in-memory フェイク 2 箇所（`service.test.ts` / sweep unit）が同一順序を再現している。実装間の順序ドリフトによる非決定的 sweep を防ぐ堅実な設計。
- **[N-004]** `handlers.integration.test.ts` の 2-tick テストは、tick 1 の後に blob がまだ存在することを assert しておくと「sweep は行だけを遷移させ bytes は purge が消す」という段階分離もついでに固定できる（現状は最終状態のみ検証）。軽微。
- **[N-005]** DataIntegrityError の 2 テストが UoW ラッパーで `uowRuns === 3` を明示的にピン留めしているため、将来 commit の UoW トポロジが変わった際に変異注入が黙って空振りせず、テストが明確に落ちる。モック介入型テストの脆さへの適切な手当て。
