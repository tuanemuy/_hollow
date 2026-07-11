# Review 010 — PR #834 (Issue #468)

### Infrastructure

ゼロベースのフルレビュー。差分（adapters / worker / infra / wrangler / docs）を全読し、`serverCloudflare.ts`（`readRequestServerConfig` の all-or-nothing 判定）、`r2ObjectStorage.ts`（delete の実装）、`vitest.config.integration.ts`（`OBJECT_STORAGE` binding + presign vars）、`checkSecrets.ts`（union 比較）、ローカル `wrangler.toml` / 両テンプレートの `[env.pruner]` を実ファイルで突き合わせた。CI は Build / Lint / Typecheck / Unit が pass（Integration は実行中）。

#### Blockers

なし

計画の Infrastructure 関連受け入れ基準はすべて実装で満たされている:

- **AC-2（put 成功・UoW ロールバック後の自動回収）**: `prepareSourcePersist` の metadata-first 化（小 UoW で `pending` 行 → `safeStoragePut`）により「行なし blob」が構造的に発生しなくなり、rollback / put 失敗 / temp 欠損 / VO 早期失敗 / 整合性異常（行消失・非 pending）の各経路が `ingestion.integration.test.ts` で sweep → purge の完走まで実証されている。
- **AC-3（cron 配線）**: `app/worker/cloudflare/handlers.ts` `runPruneTick` に `sweepAbandonedSourceIntakes` → `purgeOrphans` が export purge（#783）と同一の best-effort パターン（各々独立 try/catch + `createRequestContainer(readRequestServerConfig(env))`、戻り値契約 `{ outboxDeleted, processedEventsDeleted }` 不変）で追加され、日次 cron（03:00 UTC、ローカル / 両テンプレートで一致）から起動される。未配線だった `purgeOrphans` の spec 乖離（`spec/usecases/media.md`「Cron 起動」）も解消。
- **AC-4（grace window の誤回収防止）**: `handlers.integration.test.ts` の実 tick テストが 25h 前の放棄 intake と 1h 前の fresh pending/source を同居させ、デフォルト 24h grace が**プロダクション経路そのもの**（オプション上書きなしの tick）で効いていることを 2-tick + バックデートで検証。sweep integration 側も 24h±1min の境界ペアで `DEFAULT_GRACE_SEC` をピン留めしている。
- **インフラドリフト解消（ステップ 7）**: `infra/templates/wrangler.{production,staging}.toml.tmpl` の `[env.pruner]` に `R2_OBJECT_BUCKET_NAME = "${R2_OBJECTS_BUCKET}"`（web / consumer と同一プレースホルダ、render 変数の実在を確認）と `[[env.pruner.r2_buckets]] OBJECT_STORAGE` が追加され、ローカル `wrangler.toml`（#783 で追加済み）とのパリティが回復。manual-test TC-005 で render + deploy dry-run まで実証済み。
- **secrets 宣言の正確化**: `infra/src/secrets.ts` の `dispatchExtras` → `llmDispatchExtras` / `r2PresignExtras` 分割は pruner の実消費（R2 トリオのみ）を正しく反映。全 worker 横断の secrets union は不変のため、union に対して missing / extra を比較する `checkSecrets.ts` と bulk push は影響を受けない（コード確認済み）。
- **`ObjectStorage.delete` 冪等性の契約化**: ポート JSDoc の補強（「missing key は成功、`StorageNotFoundError` は投げない」+ #468 回収チェーンの構造的依存の明記）に加え、新規 `r2ObjectStorage.integration.test.ts` が実 R2 binding（miniflare）に対して「存在しないキーの delete 成功」「delete → 再 delete 成功」を固定。フェイクのみの検証だったギャップが閉じている。

#### Warnings

なし

（既知の見送り — purge スループット上限・malformed 行の listing 耐性・attach/re-stamp 経路の構造的封鎖・テンプレートパリティテスト — は adr.md「pruner 回収の運用強化」で別 Issue 対応が記録済みのため対象外。それ以外に「正しくない・壊れる・契約と実装の不一致」に該当する欠陥は、上記の突き合わせの範囲で見つからなかった。）

#### Notes

- **[N-001]** 回収チェーンの接合部ごとにテストの層が適切に選ばれている: D1 候補クエリの契約（`mediaAssetRepository.integration.test.ts` — strict `<` 境界・`updatedAt, id` タイブレークの limit 跨ぎ・kind/status フィルタ）、アプリ層チェーン（sweep integration — blob なし行の purge 完走 = delete 冪等性の経路検証を含む）、per-row 防御（unit のフェイク変異注入 — attach 遷移・re-stamp・行消失・save 失敗分離）、tick 配線（`runPruneTick.test.ts` — 実行順・失敗 swallow・戻り値契約）、実配線（`handlers.integration.test.ts` の 2-tick）。unit がモックで塞ぐ container → adapter シームを実 DB テストが明示的に補完する分担がコメントで宣言されており、良い。
- **[N-002]** ドキュメントとコメントが `readRequestServerConfig` の実挙動と正確に一致している: 「binding + presign 3 種 + bucket 名 var の 5 点 all-or-nothing で unavailable フォールバック」という記述（テンプレートコメント / `docs/runtime_cloudflare.md` / `secrets.ts`）を `serverCloudflare.ts` の `r2PresignReady` 判定と突き合わせて確認した。EC-3（manual test）が「欠落時は per-row catch でログ + `deleting` 残置 → 復旧後 tick で回収」の記述どおりの挙動を実地で裏付けている。
- **[N-003]** `runPruneTick` は 1 tick で `RequestContainer` を 3 回構築する（export purge / sweep / orphan purge で各 1 回）。sweep は objectStorage を消費しないため media ペアで 1 コンテナを共有する余地はあるが、日次 cadence ではコスト無視でき、「ステップごとに独立構築」は #783 確立のパターンに忠実。現状のままで問題ない。
- **[N-004]** ローカル `wrangler.toml` の `R2_OBJECT_BUCKET_NAME` var 直上のコメントは #783 のみの言及のまま（テンプレート側の同 var コメントは「#783 / #468」に更新済み）。挙動に影響しないコメントの微小な非対称。
- **[N-005]** `docs/runtime_cloudflare.md` の手動リコンサイル手順は運用者が実際に踏む細部（`--region auto` の落とし穴、wrangler 4.x に `r2 object list` が無いこと、`r2 object delete` の objectPath 形式と `--remote`）まで書かれており質が高い。1 点の運用上の含み: 手順は presign 用 R2 credential の再利用を案内するが、S3 API の `list-objects-v2` にはトークン側の list（Object Read）権限が必要。presign 経路は署名生成のみでトークン権限を行使しないため、仮に最小権限で発行されたトークンだと listing だけ拒否されうる。その場合は手順内に併記済みの dashboard 経由が代替になる — 手順の欠陥ではなく、実行時に気づける類のもの。
- **[N-006]** 初回デプロイ時の想定として: `purgeOrphans` は本 PR で初めて起動されるため、#452 以降に蓄積した全 kind の orphan バックログが初回 tick から 100 行/日で削除され始める。spec どおりの挙動であり、デプロイ直後の tick ログで `purged` が非ゼロになるのは正常（drain 速度の改善は既知の別 Issue の範疇）。
