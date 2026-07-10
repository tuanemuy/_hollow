# Review 003 — Infrastructure（アダプター・worker・インフラ構成）

対象: PR #834（Issue #468: source blob のストレージ衛生）
観点: D1 アダプターの SQL・インデックス適合とエラー翻訳規約 / worker 配線（step 隔離・戻り値契約・順序）/ wrangler テンプレート整合（env 非継承）/ DI・secrets 配線 / runbook コマンドの実在性
前提: ゼロベースのフルレビュー。既知の見送り（purge スループット 100行/日上限・malformed 行での候補列挙 throw・`reconcileRefs` の構造的封鎖 — `adr.md` 記録済み）は再指摘しない。

## 受け入れ基準（Infrastructure 関連）の充足確認

| # | 検証結果 |
|---|---|
| AC-2 | 充足。metadata-first（`commitIngestionPreview.ts` `prepareSourcePersist` の小 UoW → `safeStoragePut`）で「行なし blob」が構造的に発生せず、rollback → sweep → purge の E2E と put 失敗経路（`PutThrowingObjectStorage`）の両方が integration で実証されている。`ObjectStorage.delete` の冪等性（missing key = 成功）がポート契約として JSDoc / spec に固定され、blob なし行の purge 完走テストで裏付けられている |
| AC-3 | 充足。`runPruneTick`（`app/worker/cloudflare/handlers.ts:207-233`）に `sweepAbandonedSourceIntakes` → `purgeOrphans` が各々独立の best-effort try/catch で配線され、pruner cron（`0 3 * * *` 日次）は既存。未配線だった `purgeOrphans` の spec 乖離も解消。戻り値契約 `{ outboxDeleted, processedEventsDeleted }` は不変で、失敗 swallow・他ステップ非阻害・順序（sweep < purge）が unit テスト、container → D1/R2 の実配線が `handlers.integration.test.ts` の 2-tick テストで検証済み |
| AC-4 | 充足。D1 実装は strict `<`（`lt`）で、境界一致行の除外が adapter integration（`updatedAt == cutoff` → 0件）とドメイン unit の両層で検証済み。orphan 化の `updatedAt` 再スタンプによる二重猶予も実装どおり |
| AC-5 | 充足。既存 tick ステップは無変更・新2ステップは末尾追加。`MediaAssetRepository` の全実装（D1 / `runExportJob` の read-only スタブ / テストフェイク群）に新メソッドが揃っており配線漏れなし |

### Infrastructure

#### Blockers

なし

#### Warnings

- **[W-001]** `infra/src/secrets.ts` の ADR-007 コメントから pruner を外したことで、「宣言なしで受け取る worker」の列挙が不正確になった
  - 場所: `infra/src/secrets.ts:77-81`（「relay / dlq currently receive these secrets even though they do not consume them」）
  - 理由: 分割前は「relay / pruner / dlq」だった列挙が「relay / dlq」に縮んだが、CI の bulk push は依然として単一ファイルを全 worker に配布するため、pruner は宣言から外した `SECRET_BOX_MASTER_KEY` / `ADMIN_LLM_API_KEY`（llmDispatchExtras）を**今も受け取り、消費しない**。この位置のコメントは llmDispatchExtras 直上にあり、「これらの secrets を消費せず受け取る worker」の完全な列挙として読まれる。計画ステップ 7 の目的が「documentation-only spec の正確性回復」である以上、同じファイル内に新たな不正確を作るのは目的に反する。
  - 提案: 「relay / dlq / pruner currently receive these secrets even though they do not consume them (pruner consumes only the R2 trio below)」のように、pruner が LLM/暗号系を宣言外で受け取り続ける実態を一言残す。
- **[W-002]** `runPruneTick` の JSDoc にある best-effort ステップの正規の列挙が新2ステップを含んでおらず不完全になった
  - 場所: `app/worker/cloudflare/handlers.ts:123-131`（「Every step *after* it (processed-events, activity, llm-call-log, purge, export-jobs, tag-merge-jobs) runs best-effort…」および「purge and the two job-state prunes are log-only and do not extend the returned contract」）
  - 理由: 新設パラグラフ（:114-121）は media pair の best-effort 性を述べているが、その直後の「tick の全 post-outbox ステップと戻り値契約」を規定する列挙2文が更新されておらず、media pair だけが正規の列挙から漏れている。この JSDoc は tick の構造契約を定義するライブラリレベルのドキュメントで、次にステップを足す人が参照する場所。片方のパラグラフだけ読むと「6ステップ + 契約不変」という古い全体像を得る。
  - 提案: 列挙に `source-intake sweep` / `orphan purge` を追加し、log-only ステップの文にも media pair を含める（1〜2行の修正）。

#### Notes

- **[N-001]** infra テンプレートの修正は正確で、レンダリングパイプラインまで検証済み。`R2_OBJECT_BUCKET_NAME = "${R2_OBJECTS_BUCKET}"` は `[env.pruner.vars]` 内、`[[env.pruner.r2_buckets]]` は d1_databases の後・triggers の前に置かれ TOML として妥当。`${R2_OBJECTS_BUCKET}` は `infra/scripts/renderWrangler.ts:86`（`stack.objectsBucketName`）で解決される既存変数のため Pulumi 側の追加作業は不要。production / staging / ローカル `wrangler.toml` の3者が同一構成に揃い、#783 由来の「本番 pruner の export purge 空振り」ドリフトも同時に解消される。欠落時の劣化モード（unavailable objectStorage → per-row catch で tick 継続・オブジェクト残存）のテンプレートコメントは、`serverCloudflare.ts:382-387` の all-or-nothing 条件（binding + presign 4項目が全部揃わないと `createUnavailableObjectStorage()` にフォールバック）と正確に一致することを確認した。
- **[N-002]** secrets 分割の union 不変を確認。web / consumer は `[...shared, ...llmDispatchExtras, ...r2PresignExtras]` で従来の宣言集合と同一、pruner は `[...shared, ...r2PresignExtras]`。全 worker の union は不変のため `checkSecrets.ts`（union ベースの過不足検証）と CI bulk push は影響を受けない。pruner に R2 presign 3種を宣言するのは、purge が delete（data-plane）しか使わなくても DI が `R2ObjectStorage` の構築に binding + presign 設定の全項目を要求する実装（partial-config を許さない設計）に照らして正しい「実消費」の宣言である。
- **[N-003]** 手動リコンサイル runbook（`docs/runtime_cloudflare.md`）のコマンドを同梱 wrangler 4.90.1 で実在検証した: `wrangler r2 object` のサブコマンドは get / put / delete のみで「4.x に `r2 object list` は無い」という記述は正確。`r2 object delete <objectPath>` は `{bucket}/{key}` 結合の単一 positional + `--remote` フラグ実在、`d1 execute --remote --command` も実在。S3 API 列挙（`aws s3api list-objects-v2`）は CLI が自動ページングするため 1000 件超でも一撃で列挙できる。Round 2 [W-001] は正しく解消されている。細部: 手順 3 の `r2 object delete` にだけ `--config wrangler.<stage>.toml` が無い（手順 2 は付けている）。bucket 名は objectPath で明示するため動作はする（アカウントは wrangler の認証から解決）が、手順間で揃えるとなお良い。
- **[N-004]** D1 アダプターは規約準拠。`findAbandonedSourceIntakes` は既存 `findPurgeableOlderThan` と完全に対称（`toISOString()` 文字列比較 = ISO-8601 辞書順 ≡ 時系列、strict `<`、`updatedAt ASC, id ASC` の決定的順序、`LIMIT`、`mapDbError` によるドライバエラー翻訳）で、`idx_media_status_updated (status, updated_at)` が equality(status) + range(updated_at) を担い `kind` は小さな候補集合への残余述語という判断（コードコメントにも明記）は正しく、マイグレーション不要の判断も妥当。戻り型を `PendingMedia[]` に絞り、SQL が保証する不変条件を `filter(MediaAsset.isPending)` の静的絞り込みで型に写した点も良い。
- **[N-005]** worker 統合テストが実シームを閉じている。`runPruneTick.test.ts` は sweep/purge をモックするため container → adapter の配線はそこでは見えないが、`handlers.integration.test.ts` の 2-tick テストが実 D1/R2（vitest 統合設定が `OBJECT_STORAGE` binding と presign vars `R2_ACCOUNT_ID` 等を供給していることを確認済み）で sweep → purge を通しており、プロダクションコードにテスト用の猶予上書き引数を追加しない選択（adr.md 記録）も適切。
- **[N-006]** デプロイ時の留意点（挙動は意図どおり・対応不要）: (1) `purgeOrphans` の初配線により、マージ後の初回 tick が「サービス開始以来蓄積した全 kind の orphan」への不可逆削除の初回活性化になる。(2) 回収レイテンシは docs の「~2 days」が基本だが、orphan の `updatedAt` 再スタンプ時刻（tick 内の先行ステップ所要時間に依存）と翌 tick の purge 実行時刻の関係で strict `<` を跨げず、まれに +1 日ずれる（行は失われず翌 tick で回収される）。(3) presign secrets / binding が欠けた環境では、従来無害だった misconfiguration が「`deleting` 滞留 + 日次エラーログ」という顕在的劣化に変わるが、テンプレートコメントと runbook に文書化済みで、設定修正後に自己回復する。
- **[N-007]** tick 内で sweep / purge が各々 `createRequestContainer` を使い捨て生成するのは export purge（#783）と同型のパターン反復。1 個の共有でも足りるがステップ独立性（片方の構築失敗が他方を巻き込まない）を優先した形で、`readRequestServerConfig` が try の内側にある点も含めて妥当。
