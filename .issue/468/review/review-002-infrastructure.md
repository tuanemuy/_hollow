# Review 002 — Infrastructure（アダプター・worker・インフラ構成）

対象: PR #834（Issue #468: source blob のストレージ衛生）
観点: SQL の正しさとインデックス適合 / エラー翻訳規約 / worker の per-row tolerance と配線順 / テンプレート整合（wrangler env 非継承）/ DI 配線
前提: ゼロベースのフルレビュー。既知の見送り（purge スループット 100行/日上限、malformed 行での候補列挙 throw — adr.md「pruner 回収の運用強化」に記録済み）は再指摘しない。

### Infrastructure

#### Blockers

なし

#### Warnings

- **[W-001]** 手動リコンサイル runbook のコマンドが現行 wrangler に存在しない / 構文が誤っている
  - 場所: `docs/runtime_cloudflare.md:337` (`wrangler r2 object list`)、`docs/runtime_cloudflare.md:340` (`wrangler r2 object delete <objects-bucket> <key>`)
  - 理由: リポジトリ同梱の wrangler 4.90.1 の `r2 object` サブコマンドは `bulk / delete / get / path / put / upload` のみで、**`list` は存在しない**（オブジェクト列挙は wrangler CLI 非対応の既知のギャップ）。手順 1 をそのまま実行すると即座に失敗する。また手順 3 の `delete` は `<bucket>` と `<key>` を別引数に取らず、`wrangler r2 object delete <bucket>/<key>`（結合 objectPath、＋リモート実行には `--remote`）が正しい構文。ADR-002 が「必要になった場合の手動手順を残す」と約束した成果物そのものであり、実際に必要になる場面（漏れた blob の突合）で初手から詰まる runbook は目的を果たさない。S3 API の代替が括弧書きで併記されているため回復可能ではあるが、主経路として提示されたコマンドが虚構なのは運用ドキュメントとして不正確。
  - 提案: 手順 1 の列挙は S3 互換 API（`aws s3api list-objects-v2 --endpoint-url https://<account>.r2.cloudflarestorage.com --bucket <objects-bucket>` に presign 用の R2 アクセスキーを流用）または Cloudflare ダッシュボードを主経路として書き直す。手順 3 は `wrangler r2 object delete "<objects-bucket>/<key>" --remote`（または同じ S3 API の `delete-object`）に修正する。`wrangler d1 execute` にも `--remote` の明記を推奨（同ファイル 268 行の既存例は付けている）。

#### Notes

- **[N-001]** SQL・インデックス適合は良好。`findAbandonedSourceIntakes`（`app/core/adapters/d1/repositories/mediaAssetRepository.ts:176`）は既存 `findPurgeableOlderThan` と同型（`toISOString()` 文字列比較 = ISO-8601 の辞書順 ≡ 時系列、strict `<`、`updatedAt ASC, id ASC` の決定的順序、`LIMIT`）で、`idx_media_status_updated (status, updated_at)` が equality(status) + range(updated_at) で効き、`kind` は残余述語という判断（コメントにも明記）は正しい。マイグレーション不要の判断も妥当。`mapDbError` によるドライバエラー翻訳もアダプター規約どおり。D1 integration テストは境界（cutoff 同時刻の除外 = strict `<`）・kind/status フィルタ・並び順・limit を直接検証しており抜けがない。

- **[N-002]** wrangler env 非継承の罠に正しく対応している。`[env.pruner]` への `R2_OBJECT_BUCKET_NAME`（vars）と `[[env.pruner.r2_buckets]] OBJECT_STORAGE` の追加が production / staging 両テンプレート（`infra/templates/wrangler.production.toml.tmpl:216,235` / `wrangler.staging.toml.tmpl` 同等箇所）に同一内容で入っており、`${R2_OBJECTS_BUCKET}` は web / consumer で既に使われている置換変数なので render パイプラインへの追加作業も不要。欠落時の劣化モード（unavailable objectStorage → per-row catch で tick は継続、オブジェクトは残る）をテンプレートコメントに明記した点も良い。#783 由来のドリフト（本番 pruner の export purge 空振り）も同時に解消される。

- **[N-003]** `infra/src/secrets.ts` の分割（`dispatchExtras` → `llmDispatchExtras` + `r2PresignExtras`、pruner は `[...shared, ...r2PresignExtras]`）は、web / consumer の宣言集合が不変・全 worker の union も不変のため、`checkSecrets.ts`（union 比較）と CI の bulk push を壊さない。pruner に実消費分（R2 presign 3種）のみを宣言し LLM / 暗号系を付与しない方針は「documentation-only spec の正確性回復」という計画ステップ 7 の意図に合致。

- **[N-004]** worker 配線は既存パターンに忠実で健全。`runPruneTick`（`app/worker/cloudflare/handlers.ts:207-233`）は sweep → purgeOrphans を各々独立の try/catch（step 隔離）+ `readRequestServerConfig` を含めて catch 内側 + 戻り値契約不変で追加。ユースケース内の per-row try/catch（`sweepAbandonedSourceIntakes.ts` / 既存 `purgeOrphans.ts`）と合わせて「worker → root の broad catch は per-row 耐性の場所のみ」という CLAUDE.md の方針どおり。順序（sweep が先 = チェーンが tick ごとに 1 段進む）と失敗隔離は unit テストで、container → D1/R2 の実配線は `handlers.integration.test.ts` の 2-tick テスト（vitest 統合設定が OBJECT_STORAGE binding + presign vars を供給していることを確認済み）でカバーされている。`MediaAssetRepository` の全実装（D1 / `runExportJob` の read-only スタブ / テストフェイク群）に新メソッドが揃っており DI 配線漏れなし。`media.orphaned` の新規発火点も `dispatchDomainEvent` の default-skip で consumer / DLQ に波及しない。

- **[N-005]** デプロイ時の留意点（挙動は意図どおり）: `purgeOrphans` はこれまでどこからも起動されていなかったため、本 PR のマージ・デプロイが「サービス開始以来蓄積した全 orphan（note purge / overwrite / 画像 detach 由来、source に限らない）」への不可逆削除の初回活性化になる。回収されるのは refCount=0 まで落ちた行のみで spec どおりだが、初回 tick から実削除が走ることは運用側が認識しておくべき。また presign secrets / binding が欠けた環境では、これまで無害だった misconfiguration が「orphan → `deleting` 遷移後に R2 delete が失敗し続け、日次エラーログ + `deleting` 滞留」という顕在的な劣化モードに変わる（テンプレートコメントと `docs/runtime_cloudflare.md` に文書化済み。行は失われず、設定修正後に自己回復する）。

- **[N-006]** 既存ドリフトの参考情報（本 PR のスコープ外・修正不要）: ローカル `wrangler.toml` の `[env.pruner.vars]` にある `EXPORT_JOBS_RETENTION_MS` / `TAG_MERGE_JOBS_RETENTION_MS` は production / staging テンプレートに存在しない（#783 由来）。コード側デフォルトと同値のため挙動差はないが、本 PR が解消したのと同種の template ドリフトとして、いずれ棚卸しの候補。
