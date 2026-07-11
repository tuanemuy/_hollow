# PR #834 レビュー — Infrastructure（アダプター・worker・インフラ構成）

対象: Issue #468（source blob のストレージ衛生）/ 実装計画 `.issue/468/plan.md` / ADR `.issue/468/adr.md`

検証した観点: SQL の正しさ（インデックス利用・oldest-first・limit・strict cutoff）、D1/R2 の制約、adapter → application のエラー翻訳規約、worker の per-row tolerance、infra テンプレートドリフト、DI 配線、wrangler env 非継承の罠。

## 受け入れ基準（Infrastructure 関連）の充足確認

| # | 検証結果 |
|---|---|
| AC-2 | 充足。`ingestion.integration.test.ts` の rollback → sweep → purge E2E（クロックピン留め + strict `<` cutoff 通過を明示的に作る）で実証。metadata-first の小 UoW（`commitIngestionPreview.ts` `prepareSourcePersist`）で「行なし blob」が構造的に発生しなくなっている |
| AC-3 | 充足。`runPruneTick`（`app/worker/cloudflare/handlers.ts:204-231`）に sweep → purgeOrphans が best-effort try/catch で配線され、pruner cron（`0 3 * * *`）は既存。未配線だった `purgeOrphans` の乖離も解消 |
| AC-4 | 充足。D1 実装は `lt`（strict `<`）で、境界一致行の除外が adapter integration test（`updatedAt == cutoff` → 0件）とドメイン unit test の両方で検証済み |
| AC-5 | 充足。`runPruneTick` の戻り値契約 `{ outboxDeleted, processedEventsDeleted }` は不変。既存ステップは無変更で、新2ステップは末尾に独立 try/catch で追加。unit test で失敗 swallow・他ステップ非阻害を確認 |

### Infrastructure

#### Blockers

なし

#### Warnings

- **[W-001]** `purgeOrphans` の回収スループットが「100 行/日」で頭打ちになる（tick 1回につき 1 バッチのみ、drain ループなし）
  - 場所: `app/worker/cloudflare/handlers.ts:224` / `app/core/application/media/purgeOrphans.ts:23`
  - 理由: 本 PR で `purgeOrphans` が初めて実配線されたが、呼び出しは日次 tick 1 回 × `batchSize` デフォルト 100 のみ。`purgeOrphans` は sweep 由来の source 残骸（稀）だけでなく、**overwrite 差し替え・note purge 由来の全 kind の orphan** を一手に回収する。ノート一括削除などで 1 日 100 件を超える orphan が発生し続けると、バックログは単調増加する（oldest-first + 再試行で行は失われないが、追いつかない）。ADR-003 の「回収対象は稀な異常系の残骸」という頻度前提は sweep には正しいが、purgeOrphans 全体には当てはまらない。
  - 提案: tick 側で「候補がバッチ満杯（`purged + failed === batchSize` 相当）の間は上限付きで繰り返す」drain ループを入れるか、tick からの呼び出しにより大きな `batchSize` を渡す。少なくとも、日次 100 件のキャパシティ上限とバックログ観測方法（`status IN ('orphan','deleting')` の件数監視）を `docs/runtime_cloudflare.md` の運用ノートに明記しておくこと。現行でも回収は最終的に進むため Blocker とはしない。
  - → 見送り: 別Issueで対応（adr.md 参照）

- **[W-002]** 不正な `media_assets` 行が 1 件あると sweep / purge の候補列挙自体が throw し、当該ステップが恒久的に空振りする（per-row tolerance が listing を守らない）
  - 場所: `app/core/adapters/d1/repositories/mediaAssetRepository.ts:197`（`rows.map((row) => this.toMediaAsset(row))`）
  - 理由: 再水和（`toMediaAsset`）は行単位ではなく list 全体の map で行われるため、候補ウィンドウ内に 1 件でも malformed 行（手動 seed・運用 SQL・データ破損）があると `findAbandonedSourceIntakes` / `findPurgeableOlderThan` が `SystemError(DATA_INTEGRITY_ERROR)` で丸ごと失敗する。tick は独立 try/catch で生き残るが、**該当ステップは以後の全 tick で失敗し続け、回収が止まる**。本 PR の manual test（TC-002 手順2）でまさにこの挙動が実地観測されている。アプリ生成 id は常に UUIDv7 なので通常運用では起きないが、runtime doc が手動 SQL 操作（リコンサイル手順）を案内している以上、運用ミス→衛生機構全停止という経路は現実的。既存 `purgeOrphans` と共通の特性ではあるが、本 PR で回収チェーンがこの listing に構造的に依存するようになった。
  - 提案: 本 PR での修正は必須ではない。フォローアップ Issue として (a) 候補列挙の再水和を行単位 try/catch にして malformed 行を skip + error ログにする、または (b) 少なくとも「sweep/purge が DATA_INTEGRITY_ERROR で失敗し続ける場合は手動投入行の id 形式を疑う」を runtime doc のトラブルシュートに追記する、のいずれかを起票すること。
  - → 見送り: 別Issueで対応（adr.md 参照）

#### Notes

- **[N-001]** D1 SQL は正しい。`WHERE status='pending' AND kind='source' AND updated_at < ?` + `ORDER BY updated_at ASC, id ASC` + `LIMIT` は既存 `findPurgeableOlderThan`（`mediaAssetRepository.ts:155-174`）と完全に対称で、既存インデックス `idx_media_status_updated (status, updated_at)`（`schema.ts:581` / migration 0014 で再作成済み）が status 等値 + updated_at 範囲を効かせ、`kind` は小さな候補集合への residual predicate という設計コメントも実態と一致する。ISO-8601 文字列比較（固定桁 ms + Z）の辞書順 = 時系列順も既存パターン踏襲でマイグレーション不要の判断は妥当。
- **[N-002]** adapter → application のエラー翻訳規約を遵守。新メソッドも `mapDbError` 経由で driver エラーを `ConflictError` / `SystemError(DatabaseError)` に翻訳しており、application 層に provider-native エラーが漏れない。`runExportJob.ts` のインライン null-object リポジトリへのポートメソッド追加漏れもない。
- **[N-003]** infra テンプレートの修正は wrangler env 非継承の罠に正しく対処している。`R2_OBJECT_BUCKET_NAME` は `[env.pruner.vars]` 内、binding は `[[env.pruner.r2_buckets]]` として**明示的に**追加され（top-level からの継承に依存しない）、production / staging / ローカル `wrangler.toml` の3者が同一構成（bucket 名のみ環境差）に揃った。`${R2_OBJECTS_BUCKET}` は `renderWrangler.ts:86` で解決される既存変数。#783 由来の export purge 本番ドリフトも同時に解消される。
- **[N-004]** `infra/src/secrets.ts` の `dispatchExtras` → `llmDispatchExtras` / `r2PresignExtras` 分割は妥当。pruner は実消費する R2 presign 3種のみ宣言し（LLM/暗号系の過剰宣言を回避）、web / consumer は従来どおり全種宣言のため secrets の union は不変 — `checkSecrets.ts`（union ベース検証）と CI bulk push は影響を受けないことを確認した。「binding + presign 3種が全部揃わないと unavailable objectStorage にフォールバックする」という all-or-nothing 条件（`serverCloudflare.ts:382-387`）がテンプレートコメントに正確に文書化されている。
- **[N-005]** worker 配線は確立パターンに正しく乗っている。sweep → purgeOrphans は既存ステップの後に各々独立の best-effort try/catch（swallow + `logger.error`）で追加され、CLAUDE.md「worker → root」の broad catch 許容範囲に収まる。sweep が purge の**前**に走る順序は、orphan 化の `updatedAt` 再スタンプにより同一 tick 内での即時 purge を防ぐ「二重の猶予」設計と整合。`RequestContainer` を tick 内で使い捨て生成するのは #783 の export purge と同型（純粋な構築で後始末不要、失敗しても try/catch 内）。sweep/purge で container を 2 個作るのは 1 個共有でも足りるが、ステップ独立性のパターン反復として許容。
- **[N-006]** sweep から新規発火する `media.orphaned` は `dispatchDomainEvent` が `media.*` を skip すること（`dispatchDomainEvent.ts:108-109`）を確認済みで、consumer 影響なしという計画の主張は正しい。per-row tolerance（fresh `findById` ガード + 個別 save 失敗の分離）は unit（フェイク変異/失敗注入）、D1 経路は integration、container → adapter → D1/R2 の実配線は `handlers.integration.test.ts` の 2-tick テストと、検証の分担も適切。
- **[N-007]** `ObjectStorage.delete` の冪等性（missing key = 成功、`StorageNotFoundError` は投げない）をポート契約として JSDoc + spec に固定し、blob なし pending 行 → sweep → purge 完走の integration test で検証した点は良い。put 失敗時に「blob なし行」が定常的に purge 経路へ流入する本設計では、この契約がないと将来のアダプターが `deleting` 永久 stall を作り得た。
