# レビュー #595 PR #746 — Test 観点（Round 2 / ゼロベース再レビュー）

レビュー対象: PR #746（feat(admin): #595 P40 ダッシュボード 24h チャート + 最近のアクティビティ backend 新設）
レビュアー観点: Test
基準: `.issue/595/plan.md`（テスト方針 / 受け入れ基準 / C-1 / AC-9）、`docs/test.md`
前ラウンド: `.issue/595/review/review-001-test.md`（W-001 / W-002 / N-001〜N-006）

## 総評

前ラウンドの 2 件の Warning は両方とも解消されている。

- **W-001（dispatcher fan-out ルーティング）解消**: `dispatchDomainEvent.test.ts` に `describe("dispatchDomainEvent — activity-log fan-out routing (#595)")` ブロックが新設され、(1) `ingestion.created` が `runIngestionJob` と burst recorder の**両方**へ届き `runIngestionJob` が 1 回だけ（取り違え二重登録の退行ガード、S-001-arch）、(2) `ingestion.failed`/`user.created`/`export.job.completed`/`instance_settings.updated` がそれぞれ対応ハンドラへルーティングされ `handled` を返す、(3) `retryRequested`/`regenerated` では burst を記録しない、(4) 「新規 4 case が `default: skipped` でなくなった」回帰テスト、までカバー。activity ハンドラを `vi.mock` で隔離しルーティングのみ検証する設計も適切。
- **W-002（frontend null/0 区別・空状態+導線共存）解消**: 描画ロジックを純関数 `app/components/admin/Dashboard/chart.ts` に切り出し、`chart.test.ts` で「全 0 系列は baseline 平坦線を描く（実データ 0）」「非ゼロで曲線スケール」「空系列は空 path（caller が placeholder/null を描く）」「`hasActivityRows` で空状態と導線が排他」を検証。`index.tsx` 側も `uploadsHourly === null → 取得失敗` / 非 null → `buildSparkline`、`!hasActivityRows → 空状態メッセージ`（導線は未描画）と純関数を実際に消費しており、`docs/test.md`「Frontend は必要最小限」に沿った正しい抽出。
- **N-001/N-002 解消**: `adminSettingsEvents.integration.test.ts` が settingKind 6 値（registration_policy / llm_config / speech_config / prompt_template / instance_limits / design_tokens）を網羅し、かつ no-op ガード（`updateDesignTokens` 空 override・同一再保存、`resetPromptTemplate`/`resetAllPromptTemplates` override 不在、`updatePromptTemplate` 同一再保存）で「変化なし → outbox 0 件」を検証。
- **N-002（tag tone 網羅）解消**: `chart.test.ts` の `activityTagTone` テストが 5 ActivityKind を exhaustive にマップ検証。
- **N-004（owner 解決失敗 skip）解消**: `projection.test.ts` で `handleIngestionCreatedEvent` が job 行不在時に burst を記録しない（early return）ことを fake で検証。
- **N-005（pruneActivityLog cutoff pin）解消**: `pruneActivityLog.test.ts` が fake clock で activity=`now−N日` / burst=`now−N時` の cutoff 算出・count 転送・構造化ログを pin し、日/時取り違えガード（`activityCutoff < burstCutoff`）も入れている。`outboxPrune.test.ts` と対称。
- **N-006（per-owner 分離・閾値ちょうど）解消**: `activityLogRepository.integration.test.ts` が閾値ちょうど 1 本・複数 owner 独立集約・W-003（多数の sparse owner past でも deep window が starve しない）・sliding-window 境界跨ぎ（W-002）まで実 D1 で網羅。

層分け（domain/app は fake、adapter は実 D1）・独立性（setup.ts の cleanup に `activity_log`/`ingestion_burst_log` 追加、`_occ_guard` 不変検査維持）・閾値定数ベース（`LARGE_UPLOAD_THRESHOLD` 直書き回避）はいずれも `docs/test.md` 方針に整合。新規 4 つの sliding-window / starvation テストも検証内容は正しい（境界配置・owner 分離が意図どおり）。該当 4 ファイルの unit テスト（81 件）はローカルで全 pass を確認。

残る指摘は Note レベルのみ。Blocker・Warning はなし。

## Blockers / Warnings / Notes

### Blockers

なし

### Warnings

なし

### Notes

- **[N-001] projection ハンドラ 5 本中 3 本（failed / userCreated / export）の AC-5 フォールバック分岐が直接テストされていない**
  場所: `app/core/application/activityLog/handle{IngestionFailed,UserCreated,ExportJobCompleted}Event.ts`
  理由: `projection.test.ts` が直接叩くのは `handleInstanceSettingsUpdatedEvent` と `handleIngestionCreatedEvent` の 2 本のみ。残る 3 本は `dispatchDomainEvent.test.ts` で `vi.mock` され**中身が実行されない**ため、各ハンドラ固有の「対象/詳細」列フォールバック（AC-5）— `handleIngestionFailedEvent`: job 不在で `target = jobId`・`detail = errorReason || errorCode`、`handleUserCreatedEvent`: `target = handle ?? userId`、`handleExportJobCompletedEvent`: `target = job ? "${format} エクスポート" : exportJobId` — が一切検証されていない。これらは「空文字や ID 直書きで形式的に満たすことを避ける」という AC-5 の主旨そのものに直結する分岐で、`||` と `??` の取り違え・ラベル文言の退行が CI で捕捉されない。`handleInstanceSettingsUpdatedEvent`/`handleIngestionCreatedEvent` には fake ベースの直接テストがある以上、3 本だけ空白なのは非対称。
  提案: `projection.test.ts` に、各ハンドラについて「job/user 解決成功時はハンドル/ファイル名を target に出す」「解決失敗時は raw id にフォールバックする」「detail の組み立て（特に failed の `||` と export の label）」を fake で 1〜2 本ずつ足す（low コスト・AC-5 直結で ROI 高）。

- **[N-002] adminSettings の eventDecoders（zod `.strict()` + settingKind enum）に直接の round-trip テストが無い**
  場所: `app/core/application/adminSettings/eventDecoders.ts`（テスト不在）
  理由: `adminSettingsEventDecoders` を参照するテストは 0 件（grep 確認済み）。`adminSettingsEvents.integration.test.ts` は outbox payload を `JSON.parse` で読むだけでデコーダを通さず、`projection.test.ts` はデコード後の型済みイベントを直接渡す。よって `.strict()`（余剰キー拒否）・`settingKind` enum 外拒否・`actorId` の `UserId.create` 往復が未検証。`docs/test.md` は domain 層「events のデコード不変条件」を unit の狙いに挙げており、他ドメイン（ingestion 等）の eventDecoders に先例があれば揃えたい。
  提案: `adminSettings/__tests__/eventDecoders.test.ts` を新設し、正常 payload の往復・未知 settingKind 拒否・余剰キー拒否を検証（低コスト）。

- **[N-003] `createConsumerContainer` が `activityLogRepository` を実際に wire することの DI 統合検証が無い**
  場所: `app/core/application/di/__tests__/createConsumerContainer.integration.test.ts`
  理由: 同テストの本 PR 追加分は #701（speech）向けで、#595 の `activityLogRepository` を `ConsumerContainer` に載せた配線（ADR-006）はどの DI テストでも assert されていない。`dispatchDomainEvent.test.ts` は手書きスタブコンテナを使うため、production の `createConsumerContainer` が当該 repo を欠落させても気付けない（実行時に consumer が落ちて初めて判明）。ただし他の WorkerContainer 系 repo（`indexJobRepository` 等）も同テストで個別 assert していない既存方針に倣っており、本 PR 固有の退行ではない。
  提案: 任意。`createConsumerContainer` 結果に `activityLogRepository` が存在し `insertIfAbsent`/`recordBurst` を持つことの軽い smoke assert を 1 行足すと、配線漏れが request 路の手前で捕まる。
