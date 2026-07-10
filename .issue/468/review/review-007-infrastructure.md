# Review 007 — Infrastructure（ゼロベース・フルレビュー）

対象: PR #834（Issue #468: source blob のストレージ衛生）
観点: アダプター・worker・インフラ構成
検証方法: `gh pr diff 834` 全読 + 実装ファイル実読（`handlers.ts` の `runPruneTick` 全体、`serverCloudflare.ts` `readRequestServerConfig` L372-387 の all-or-nothing 判定、`r2ObjectStorage.ts` の `delete` 実装 L124-133、`mediaAssetRepository.ts` の `toMediaAsset` 再水和、`purgeOrphans.ts`、`infra/src/secrets.ts` / `checkSecrets.ts`、`infra/scripts/renderWrangler.ts` L86、`vitest.config.integration.ts`、3 つの wrangler toml の `[env.pruner]` セクション、`app/components/media/schema.ts` のトランスポート境界）。CI: Lint/Typecheck/Unit/Build pass、Integration 実行中（レビュー時点）。

## 受け入れ基準の充足（Infrastructure 関連）

- **AC-2（put 成功・UoW ロールバック後の自動回収）**: metadata-first 化（`prepareSourcePersist` の小 UoW → `safeStoragePut`）により「行なし blob」が構造的に発生しなくなり、残る `pending(kind='source')` 行は sweep → purge チェーンが回収。`ingestion.integration.test.ts` の rollback E2E（blob 残存 → 再 commit 非干渉 → sweep → purge 完走、生存 source 無傷）と put 失敗 E2E（blob なし行の回収、row-before-put 順序ガード）、`handlers.integration.test.ts` の実 D1 + 実 R2 binding 2-tick テストで実証。**充足**。
- **AC-3（cron 配線）**: `runPruneTick` 末尾に `sweepAbandonedSourceIntakes` → `purgeOrphans` が既存の best-effort try/catch + purge 用 `RequestContainer` パターン（#783 前例）で追加。pruner cron `0 3 * * *` は local wrangler.toml / 両テンプレートに既存で、`pruner.ts` → `runPruneTick` のエントリ配線も確認。未配線だった `purgeOrphans` の spec 乖離（「Cron 起動」）が解消。戻り値契約 `{ outboxDeleted, processedEventsDeleted }` は不変。**充足**。
- **AC-4（grace window の誤回収防止）**: strict `<` cutoff が D1 integration（cutoff 同時刻の除外・kind/status フィルタ・tie-break）、ドメインサービス unit、tick integration（デフォルト 24h grace で 1h 前の fresh pending/source が 2 tick を無傷で生存 — `graceSec: 0` 誤配線の検出ガード）の各層で検証。**充足**。
- **AC-5（既存フロー無退行）**: `runPruneTick.test.ts` が既存 7 ステップの非阻害・新ペアの順序（sweep → purge）・各失敗の分離を検証。outbox プリューン失敗時に新ペアが呼ばれないこと（fail-fast 契約）も assert。**充足**。

### Infrastructure

#### Blockers

なし

#### Warnings

なし

#### Notes

- **[N-001]** infra ドリフト解消の作りが正確: 両テンプレートの `[env.pruner]` に `R2_OBJECT_BUCKET_NAME`（`[env.pruner.vars]` テーブル内、`[[env.pruner.d1_databases]]` より前 — TOML 構造として正しい位置）と `[[env.pruner.r2_buckets]] OBJECT_STORAGE` が追加され、プレースホルダ `${R2_OBJECTS_BUCKET}` は `renderWrangler.ts` L86 で供給済み（web / consumer と同一変数）。コメントの「binding + presign secrets 3 種 + bucket name var の all-or-nothing で欠けると unavailable フォールバック」は `readRequestServerConfig` の実装（L383-387 の 5 条件 AND）と一致する。手動テスト TC-005 で render + `deploy:staging:pruner:dry` の完走も確認済み。
- **[N-002]** `infra/src/secrets.ts` の `dispatchExtras` → `llmDispatchExtras` / `r2PresignExtras` 分割は、pruner の宣言を実消費（R2 trio のみ）に正確化しつつ secrets の union を不変に保っており、`checkSecrets.ts`（union 比較）と CI bulk push に影響しない。web / consumer の宣言集合も分割前と同一。「ドキュメントとしての正確性回復」という計画ステップ 7 の意図どおり。
- **[N-003]** `ObjectStorage.delete` の冪等性契約（missing key = success、`StorageNotFoundError` を投げない）が三層でピン留めされている: ポート JSDoc（#468 チェーンの構造的依存を明記）、実 R2 アダプター（`bucket.delete` は missing key で throw しない — 実装 L124-133 で確認）、新設 `r2ObjectStorage.integration.test.ts`（miniflare の実 binding に対する never-existed / repeat-delete の 2 ケース）。加えて sweep integration の blobless-row purge 完走テストがアプリ層経路でも契約を検証しており、fake-vs-real の隙間がない。
- **[N-004]** 回収レイテンシの記載が Round 6 [W-001] の指摘どおり実態化されている: `docs/runtime_cloudflare.md` は「~2–4 days」+ tick 量子化・strict `<`・orphan 再スタンプの理由込み、`.issue/468/adr.md` ADR-003 も「約2〜4日」で整合。運用者が正常な遅延を異常と誤認する材料が除去された。
- **[N-005]** 手動リコンサイル runbook（`docs/runtime_cloudflare.md`）は「S3 listing → D1 突合 → 差分削除」の順で、metadata-first（行が blob より先に存在）と組み合わさって in-flight commit の blob を誤削除しない安全な順序になっている。`grep '/source/'` はキーレイアウト `{ownerId}/source/{mediaId}` の kind セグメントに正しく一致し、export artifact 等の他キーを拾わない。`--region auto` の注記も AWS CLI の実際の failure mode に対応。
- **[N-006]** R2 設定欠落時の劣化モードが「安全側」であることを確認: sweep は objectStorage を使わないため misconfig 下でも orphan 化は進み、purge は per-row catch で `deleting` に残して次周期に再試行（`markDeleting` の再スタンプで 24h 後の候補窓に再入。手動テスト EC-3 で復旧 → 回収まで実地確認済み）。行が失われる経路はない。
- **[N-007]** sweep の放棄判定の安全前提（pending source は commit フロー内でのみ誕生）について: `uploadMedia` / `uploadMediaPresigned` の `kind` を `UploadableMediaKind`（source 除外）に絞る型レベル封鎖が入ったが、トランスポート境界の `mediaKindSchema`（`app/components/media/schema.ts`）は元々 `["image", "video", "avatar"]` で source を受け付けていない。つまり本 PR 以前の本番 DB に「正当な pending source」が存在する経路はなく、デプロイ直後の初回 sweep が legacy 行を誤回収する懸念はない。デプロイ順序も安全（旧 web は pending source を単独残ししないため pruner 先行でも空振りするだけ）。
- **[N-008]** 初回デプロイ後の最初の pruner tick から、これまで未配線で溜まっていた orphan / deleting バックログ（source 以外の media も含む）の purge が始まる点は運用上意識しておくとよい（設計上正当な削除であり、日次 batch 100 が事実上のスロットル。スループット上限自体は既知の別 Issue）。

## 既知の見送り（再指摘しない）

`.issue/468/adr.md`「pruner 回収の運用強化」に記録済みの purge スループット上限（100 行/日次 tick）、malformed 行による候補列挙の全体 throw、attach / re-stamp 経路（`reconcileRefs` / `updateProfile` / `finalizeUpload`）の構造的封鎖、テンプレート↔ローカル wrangler.toml の binding パリティテストは、別 Issue 対応の合意済み見送りとして本レビューの対象外とした。
