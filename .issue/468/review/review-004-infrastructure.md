# Review 004 — Infrastructure（アダプター・worker・インフラ構成）

対象: PR #834（Issue #468: source blob のストレージ衛生）
観点: D1 アダプターの SQL・インデックス適合とエラー翻訳規約 / worker 配線（step 隔離・戻り値契約・順序）/ wrangler テンプレート整合 / DI・secrets 配線 / runbook コマンドの実在性
前提: ゼロベースのフルレビュー。既知の見送り（purge スループット上限・malformed 行の listing 耐性・`reconcileRefs` の構造的封鎖 — `adr.md` 記録済み）は再指摘しない。

## 受け入れ基準（Infrastructure 関連）の充足確認

| # | 検証結果 |
|---|---|
| AC-2 | 充足。metadata-first（`commitIngestionPreview.ts` の小 UoW → `safeStoragePut`）により「行なし blob」が構造的に発生せず、rollback → 残存 pending → sweep → purge の経路が ingestion / sweep / handlers の各 integration テストで実証されている。`ObjectStorage.delete` の冪等性（missing key = 成功、`StorageNotFoundError` は投げない）がポート JSDoc と `spec/domains/media.md` の両方で契約として固定された |
| AC-3 | 充足。`runPruneTick`（`app/worker/cloudflare/handlers.ts:212-235`）に `sweepAbandonedSourceIntakes` → `purgeOrphans` が各々独立の best-effort try/catch で配線され、pruner cron（`0 3 * * *` 日次）は local / staging / production の3構成すべてに既存。未配線だった `purgeOrphans` の spec 乖離も解消。戻り値契約 `{ outboxDeleted, processedEventsDeleted }` は不変で、順序（sweep < purge）・失敗 swallow・他ステップ非阻害が `runPruneTick.test.ts` で、container → D1/R2 の実配線が `handlers.integration.test.ts` の 2-tick テストで検証済み |
| AC-4 | 充足。D1 実装は strict `<`（`lt` + `toISOString()` 辞書順比較）で、境界一致行の除外が adapter integration（`updatedAt == cutoff` → 0件）で明示的に検証されている。orphan 化の `updatedAt` 再スタンプによる二重猶予も実装・テストどおり |
| AC-5 | 充足。既存 tick ステップは無変更・新2ステップは末尾追加のみ。`MediaAssetRepository` の全実装箇所（D1 / `runExportJob` の read-only スタブ / テストフェイク）に `findAbandonedSourceIntakes` が揃っており配線漏れなし |

### Infrastructure

#### Blockers

なし

#### Warnings

- **[W-001]** 手動リコンサイル runbook の `aws s3api list-objects-v2` コマンドがリージョン未指定のため、素の環境ではそのまま実行しても失敗する
  - 場所: `docs/runtime_cloudflare.md` 「One-time manual reconcile for pre-#468 leaked blobs」手順 1
  - 理由: AWS CLI は `--endpoint-url` を指定してもリージョン解決を要求する。提示コマンドは `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` だけを環境変数で与えており、`~/.aws/config` にデフォルトリージョンが無いマシン（この手順の想定読者である「初めて S3 API を叩く運用者」がまさにそれ）では `You must specify a region` で即失敗する。R2 の公式推奨は `auto`。runbook は「コピペで動く」ことが価値であり、この1点だけ検証漏れがある（wrangler 側のコマンド実在性・フラグは正確 — N-003 参照）。
  - 提案: コマンドに `AWS_DEFAULT_REGION=auto`（または `--region auto`）を追加する1行修正。
- **[W-002]** `docs/runtime_cloudflare.md` の purge コンテナ前提条件の列挙が不完全（`R2_OBJECT_BUCKET_NAME` が漏れている）
  - 場所: `docs/runtime_cloudflare.md` 「Media storage hygiene (Issue #468)」冒頭 —「all three presign secrets and the binding must be present or the container falls back to an unavailable objectStorage」
  - 理由: `readRequestServerConfig`（`serverCloudflare.ts:382-387`）のフォールバック条件は binding + presign 3 secrets + **`R2_OBJECT_BUCKET_NAME` var** の5点 all-or-nothing。テンプレートが var を供給するため通常は満たされるが、この節は「purge が空振りするときに何を確認するか」を定義する運用ドキュメントであり、条件を4点として提示すると、var を欠いた手編集構成（self-host 運用で現実的）のデバッグで「全部揃っているのに落ちる」という誤誘導になる。wrangler テンプレート内コメントは var を独立に言及しており、docs 側だけが不正確。
  - 提案: 「+ `R2_OBJECT_BUCKET_NAME` var」を列挙に加える1行修正。

#### Notes

- **[N-001]** infra テンプレートの修正は正確で、レンダリングパイプラインまで検証した。`R2_OBJECT_BUCKET_NAME = "${R2_OBJECTS_BUCKET}"` は `[env.pruner.vars]` 内、`[[env.pruner.r2_buckets]]` は `[[env.pruner.d1_databases]]` の後・`[env.pruner.triggers]` の前で TOML として妥当。`${R2_OBJECTS_BUCKET}` は `infra/scripts/renderWrangler.ts:86`（`stack.objectsBucketName`）で解決される既存変数のため Pulumi 側の追加作業は不要。production / staging / ローカル `wrangler.toml` の3者が同一構成に揃い、#783 由来の「本番 pruner の export purge 空振り」ドリフトも同時に解消される。欠落時の劣化モードのテンプレートコメント（unavailable objectStorage → per-row catch で tick 継続・オブジェクト残存）は DI の all-or-nothing フォールバック実装と一致する。
- **[N-002]** secrets 分割の union 不変を確認。web / consumer は `[...shared, ...llmDispatchExtras, ...r2PresignExtras]` で従来集合と同一、pruner は `[...shared, ...r2PresignExtras]`（実消費分のみ）。全 worker の union が不変のため `infra/scripts/checkSecrets.ts`（union ベースの過不足検証）と CI bulk push は影響を受けない。Round 3 [W-001] の指摘（bulk push で pruner が LLM/暗号系を宣言外で受け取り続ける実態の注記漏れ）は「relay / dlq / pruner currently receive these secrets even though they do not consume them (the pruner consumes only the R2 trio below)」として解消済み。
- **[N-003]** runbook のツールコマンドを同梱 wrangler 4.90.1 で実在検証した: `wrangler r2 object` のサブコマンドは get / put / delete のみで「4.x に `r2 object list` は無い」という記述は正確。`r2 object delete <objectPath>` は `{bucket}/{key}` 結合の単一 positional で、wrangler 内部の `isLocal()` がデフォルト local のため `--remote` 必須という記述も正確。`d1 execute --remote --command` も実在し、既存の DLQ リカバリ例と表記が揃っている。Round 3 で指摘された手順 3 の `--config` 欠落も解消済み。残る検証漏れは AWS CLI のリージョン（W-001）のみ。
- **[N-004]** D1 アダプターは規約準拠。`findAbandonedSourceIntakes` は既存 `findPurgeableOlderThan` と完全対称（ISO 文字列の strict `<`、`updatedAt ASC, id ASC` の決定的順序、`LIMIT`、`mapDbError` によるドライバエラー翻訳）で、`idx_media_status_updated` 適合とマイグレーション不要の判断は正しい。1点留意: コードコメントの「residual predicate on a tiny candidate set」という前提は、ADR-004 が回収対象外とした image / video の stale pending が蓄積するほど緩やかに崩れる（`status='pending' AND updated_at < cutoff` のインデックスレンジが非 source 行で膨らみ、source が見つからない tick はレンジ全走査になる）。走査コストのみの劣化で行の正しさに影響はなく、stale pending の掃除自体が別 Issue 扱いのためここでは Note に留める。
- **[N-005]** worker 配線とテストの分担が適切。`runPruneTick.test.ts` は sweep / purge をモックして順序・隔離・契約不変を検証し、`handlers.integration.test.ts` の 2-tick テスト（orphan 化 → `updatedAt` バックデート → purge）が実 D1 / R2（vitest 統合設定が `OBJECT_STORAGE` binding と presign vars を供給していることを確認済み）で container → adapter シームを閉じる。プロダクションコードにテスト用の猶予上書き引数を追加しない選択（adr.md 記録）も妥当。Round 3 [W-002]（`runPruneTick` JSDoc の正規ステップ列挙の欠落）は列挙・log-only 文の両方に media pair が追加され解消済み。
- **[N-006]** デプロイ時の留意点（挙動は意図どおり・対応不要）: (1) `purgeOrphans` の初配線により、マージ後の初回 tick が「サービス開始以来蓄積した全 kind の orphan」に対する不可逆削除の初回活性化になる。(2) 回収レイテンシは docs の「up to ~2 days」が基本だが、orphan 再スタンプ時刻と翌 tick の purge 実行時刻の秒単位の前後関係で strict `<` を跨げず +1 日ずれることがある（行は失われず翌 tick で回収）。(3) web / pruner のデプロイ順序に依存関係はない（pruner 先行なら sweep 対象が無いだけ、web 先行なら pending が蓄積後に回収される）。(4) presign secrets / binding 欠落は従来「presign 不可」だけの劣化だったが、今後は「`deleting` 滞留 + 日次エラーログ」として顕在化する — テンプレートコメントと runbook に文書化済みで、設定修正後は自己回復する。
- **[N-007]** tick 内で sweep / purge が各々 `createRequestContainer` を使い捨て生成するのは export purge（#783）と同型のパターン反復で、ステップ独立性（片方の構築失敗が他方を巻き込まない）を優先した形。`readRequestServerConfig` の呼び出しが try の内側にあり、構築時例外も swallow される点まで一貫している。
