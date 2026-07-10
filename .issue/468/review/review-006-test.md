# PR #834 レビュー（Round 6）

## 対象

- PR: #834（Issue #468: source blob のストレージ衛生 — 保持ポリシー明文化と孤児 blob 回収）
- 観点: Test（テスト網羅性・テスト設計）。ゼロベースのフルレビュー（前ラウンドの結果は前提にしない）
- 検証: 追加・変更されたテストを全て精読し、ローカルで実行して green を確認
  - unit: `sweepAbandonedSourceIntakes.test.ts` / `service.test.ts` / `runPruneTick.test.ts` — 43 passed
  - integration: `sweepAbandonedSourceIntakes.integration.test.ts` / `r2ObjectStorage.integration.test.ts` / `mediaAssetRepository.integration.test.ts` — 16 passed
  - integration: `ingestion.integration.test.ts` / `handlers.integration.test.ts` — 69 passed
  - CI: Lint / Format / Typecheck / Unit tests は SUCCESS を確認

## 受け入れ基準とテストの対応

| AC | 担保 | 判定 |
|---|---|---|
| AC-1（保持ポリシー明文化） | ADR-001 + `spec/domains/media.md` 保持ポリシーセクション + `docs/runtime_cloudflare.md` の手動リコンサイル手順（ドキュメントのみ、テスト対象外） | 充足 |
| AC-2（put 成功・UoW ロールバック → 自動回収） | `ingestion.integration.test.ts`「reclaims the source blob after a commit rollback via sweep → purge」— 残存 assert → outbox 非漏出 → temp 保全 → 再 commit 非干渉 → sweep(swept:1) → purgeOrphans 1回で blob+行消滅まで実 DB/実(in-memory R2)ストレージで実証 | 充足 |
| AC-3（cron 配線） | `runPruneTick.test.ts`（呼び出し・sweep→purge 順序・失敗 swallow・他ステップ非阻害・outbox 失敗時の非実行・戻り値契約不変）+ `handlers.integration.test.ts` の 2-tick 実経路（container → D1 候補クエリ → 実 R2 delete） | 充足 |
| AC-4（grace window の誤回収防止） | sweep integration の 24h−1min 境界スキップ（デフォルト猶予のピン留め）、domain unit / D1 integration の strict `<` 境界（cutoff 同値の除外）、handlers 2-tick テストの 1h fresh 行並置（tick デフォルト猶予の実経路検証）、per-row fresh ガード 3 アーム（attached 遷移・行消失・`updatedAt` 再スタンプの cutoff 再検査）の unit 変異注入 | 充足 |
| AC-5（既存フロー退行なし） | #452 正常系（L713: attached / sourceFileId 束縛 / temp 削除）・overwrite 差し替え（L1574: 旧 source orphan 化）が metadata-first 化後も green。temp 欠損 skip の check-before-insert 順序、put 失敗の row-before-put 順序も新テストが不変条件として固定。`uploadMedia` 系は型変更のみ（transport の zod enum は元から source 非許容） | 充足 |

`spec/testcases/media/index.md` の SweepAbandonedSourceIntakes 全 8 行、`spec/testcases/ingestion/index.md` の新 4 行（main UoW ロールバック / put 失敗 / 行消失 / 非 pending 遷移）は、いずれも実装テストと 1:1 で対応していることを確認した。

Round 5 の Test 指摘 3 件はすべて是正済みであることを個別に確認した:

- W-001 → `r2ObjectStorage.integration.test.ts`（新規）が実 R2 binding（miniflare）で `delete` の missing-key = 成功（初回・再削除の両方）をピン留め
- W-002 → sweep integration の skip ケースが 24h − 1min に変更され、swept 側 24h + 1min と対で `DEFAULT_GRACE_SEC` を境界でピン留め
- W-003 → `handlers.integration.test.ts` の 2-tick テストに 1h 前の pending/source を並置 seed し、両 tick 生存を assert（`graceSec: 0` 級の誤配線を実経路で検出）

### Test

#### Blockers

なし

#### Warnings

なし

#### Notes

- **[N-001]** AC-2 の E2E テストは受け入れ根拠として引き続き模範的。ロールバック残骸の assert に加え、outbox への `media.*` 非漏出（stage (a) 非 collect + main UoW discard の裏取り）、temp 保全による再 commit 可能性、再 commit と放棄行の非干渉、put 失敗・temp 欠損の各テストに付く「順序を逆にするとこのテストが落ちる」という不変条件コメント、strict `<` に対する段階的クロック前進によるフレーク排除まで一貫している。DataIntegrityError の 2 テストが `uowRuns === 3` でトポロジをピン留めしているため、変異注入の黙った空振りも起きない。
- **[N-002]** レイヤー分担が docs/test.md の方針に忠実。integration で作為なしに到達できない分岐（fresh `findById` ガード 3 アーム・per-row save 失敗分離）だけをテストローカルの `MutableFakeRepo`（変異注入フック付き）で unit に切り出し、判断根拠を ADR「実装時の追加決定」に記録。クエリレベル冪等性テストの「per-row ガードはこの経路では exercise されない」という意図明記もカバレッジの錯覚を防いでいる。
- **[N-003]** tick のデフォルト猶予の担保は「sweep integration がオプションなし呼び出しで `DEFAULT_GRACE_SEC` を 24h 境界でピン留め」×「handlers 2-tick テストの 1h fresh 行が tick 経由の危険域（graceSec < 1h）を検出」の合成で成立している。理論上は handlers.ts に明示的な `{ graceSec: 2h }` のような誤配線が入っても全 green のままだが、commit の attach は同一リクエスト内（秒オーダー）なので 1h 以上の猶予であれば誤回収は構造的に起きず、安全性は既にピン留めされている。さらに固めたければ `runPruneTick.test.ts` に `expect(mocks.sweepAbandonedSourceIntakes.mock.calls[0]).toHaveLength(1)`（オプション引数なしの固定）を足すだけで済む — 任意の軽微改善。
- **[N-004]** `handlers.integration.test.ts` の 2-tick テストは tick 1 の後に blob の残存を assert すると「sweep は行だけを遷移させ、bytes は purge が消す」という段階分離もついでに固定できる（現状は最終状態のみ）。前ラウンド N-004 と同じく軽微。
- **[N-005]** temp 欠損 skip の新テスト（「commits without a source binding and leaves no pending row ...」）は check-before-insert の順序不変条件を固定する良いテストだが、対応する行が `spec/testcases/ingestion/index.md` に無い（`spec/usecases/ingestion.md` のステップ 5(a) には記載あり）。spec を testcase の SSOT として保つなら 1 行追加が望ましい。実装・テストは正しく、ドキュメント側の網羅性のみの話。
- **[N-006]** `findAbandonedSourceIntakes` の `(updatedAt, id)` 順序契約は D1 integration の limit 境界越しタイブレークテストが真のピンで、in-memory フェイク 2 箇所（`service.test.ts` の InMemoryRepo / sweep unit の MutableFakeRepo）は同一順序をコメント付きで再現している。フェイクが将来ドリフトしても sweep unit の検証対象（ガード・失敗分離）は順序に依存しないため実害は限定的だが、フェイクが 2 箇所に重複していることは把握しておくとよい。
