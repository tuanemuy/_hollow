# Review 008 — PR #834 (Issue #468)

### Infrastructure

#### Blockers

なし

計画の Infrastructure 関連受け入れ基準はすべて実装で満たされていることを確認した:

- **AC-2（自動回収）**: metadata-first（`commitIngestionPreview` の小 UoW → `safeStoragePut`）により「行なし blob」が構造的に発生しなくなり、rollback / put 失敗 / temp 欠損の各経路が `app/core/application/ingestion/__tests__/ingestion.integration.test.ts` で sweep → purge まで実証されている。
- **AC-3（cron 配線）**: `app/worker/cloudflare/handlers.ts` `runPruneTick` に `sweepAbandonedSourceIntakes` → `purgeOrphans` が export purge と同一の best-effort パターン（独立 try/catch + `createRequestContainer(readRequestServerConfig(env))`、戻り値契約不変）で追加され、`app/worker/cloudflare/pruner.ts` の日次 cron（03:00 UTC、`wrangler.toml` / 両テンプレートで一致）から起動される。未配線だった `purgeOrphans` の spec 乖離も解消。
- **AC-4（誤回収防止）**: デフォルト 24h grace が `handlers.integration.test.ts` の実 tick テストで境界込み（25h 前は orphan 化、1h 前の pending/source は両 tick を無傷で生存）で検証されている。tick へのオプション貫通を追加せず 2-tick + バックデートで実経路を通した判断も妥当。
- **インフラドリフト解消**: `infra/templates/wrangler.{production,staging}.toml.tmpl` の `[env.pruner]` に `R2_OBJECT_BUCKET_NAME` var と `[[env.pruner.r2_buckets]] OBJECT_STORAGE`（`${R2_OBJECTS_BUCKET}` — web/consumer と同一プレースホルダ）が追加され、ローカル `wrangler.toml` とのパリティが回復。#783 の export purge の本番動作もこれで直る。
- **secrets 宣言の正確化**: `infra/src/secrets.ts` の `dispatchExtras` → `llmDispatchExtras` / `r2PresignExtras` 分割は pruner の実消費（R2 トリオのみ）を正しく反映し、全 worker の secrets union は不変（`checkSecrets.ts` は union 比較なので影響なし — 検証済み）。

#### Warnings

なし

（purge スループット上限・malformed 行の listing 耐性・attach/re-stamp 経路の構造的封鎖・テンプレートパリティテストは adr.md「pruner 回収の運用強化」で別 Issue 対応が記録済みのため対象外とした。）

#### Notes

- **[N-001]** 回収チェーンの各接合部がそれぞれ最適な層でテストされている点が良い: D1 候補クエリ（`mediaAssetRepository.integration.test.ts` — strict `<` 境界・id タイブレーク・kind/status フィルタ）、アプリ層チェーン（sweep integration — blob なし行の purge 完走を含む）、container → adapter → D1/R2 の実配線（`handlers.integration.test.ts` の 2-tick テスト）、そして `ObjectStorage.delete` の冪等性契約を実 R2 binding（miniflare）に対して固定する新規 `r2ObjectStorage.integration.test.ts`。回収チェーンが構造的に依存する「missing key = success」がフェイクだけでなく実アダプターで pinned されており、将来の adapter 回帰を検知できる。
- **[N-002]** `runPruneTick` の配線は既存パターン（#783 の export purge）の忠実な反復で、戻り値契約 `{ outboxDeleted, processedEventsDeleted }` を変えず、sweep 失敗 → purge 続行の分離も `runPruneTick.test.ts` でモック検証されている。テンプレート / `wrangler.toml` / `docs/runtime_cloudflare.md` / `secrets.ts` のコメントが「binding + presign 3 種 + bucket 名 var の all-or-nothing で unavailable フォールバック」という `readRequestServerConfig` の実挙動（`serverCloudflare.ts` で確認）と正確に一致している。
- **[N-003]** 運用上の注意（デプロイ時の想定として共有）: `purgeOrphans` は今回初めて起動されるため、#452 以降に蓄積した**全 kind の orphan バックログ**（note purge / overwrite / detach 由来の image・video・avatar 含む）が初回 tick から 100 行/日で削除され始める。spec どおりの挙動だが、デプロイ直後の tick ログで `purged` / `failed` が非ゼロになるのは正常。バックログが 100 件を超えている場合の drain 速度は既知の別 Issue（スループット上限）の範疇。
- **[N-004]** 別 Issue（drain ループ設計）への引き継ぎ材料: バッチ上限を引き上げる際は Cloudflare Workers の per-invocation サブリクエスト上限（有料プラン 1000。D1 クエリ・R2 操作の双方が計上される）を考慮すること。現行のフルバッチ（sweep 100 + purge 100 = R2 delete 100 + 数百の D1 文）+ tick の他ステップで、上限の相当部分を既に消費しうる。
- **[N-005]** `docs/runtime_cloudflare.md` の手動リコンサイル手順は、metadata-first（行が blob より先）と purge の削除順序（storage → DB）の両方の帰結として #468 以後は race-safe（listing に載って行が無い blob = pre-#468 の残骸のみ）になっており、手順として安全。`--region auto` の落とし穴や wrangler 4.x の `r2 object delete` の objectPath 形式など、実際に運用者が踏む細部まで書かれているのも良い。
