# レビュー #595 PR #746 — Test 観点

レビュー対象: PR #746（feat(admin): #595 P40 ダッシュボード 24h チャート + 最近のアクティビティ backend 新設）
レビュアー観点: Test
基準: `.issue/595/plan.md`（テスト方針 / 受け入れ基準 / C-1 / AC-9）、`.issue/595/adr.md`、`docs/test.md`

## 総評

計画の「テスト方針」に挙がった主要観点はおおむね網羅されており、層の割り当て（ドメイン/アプリは fake、アダプターは実 D1 統合）も `docs/test.md` の方針に正しく従っている。特に以下は質が高い。

- provider hourly 集計（24 バケット oldest-first・空テーブル 0 埋め・UTC バケット境界・窓外除外・partial-failure null degrade・scalar null 固定）が `usageMetricsProvider.integration.test.ts` で実 D1 上で網羅的に検証されている。partial-failure を `db.select` throw で注入する手法も適切。
- projection 冪等性が **二層**（アプリ fake の `projection.test.ts` と実 D1 の `activityLogRepository.integration.test.ts` の双方）で検証され、ADR-001 の「自然キー insert で再配信に耐える」が再現されている。
- 大量アップロード集約の境界（閾値前後・burst 冪等・窓非マージ）が `LARGE_UPLOAD_THRESHOLD` 定数ベースで書かれており、閾値変更に追従するテストになっている（マジックナンバー直書きを回避）。
- 刈り込み（`pruneOlderThan` / `pruneBurstOlderThan` で cutoff 前削除・保持内残存）が実 D1 で検証されている。
- 空状態（`getRecentActivity` が空配列を返す → 導線非表示の前提）が AC-8 / S-002-coverage に紐づけて明示されている。
- setup.ts の cleanup に `activity_log` / `ingestion_burst_log` が追加され、新規テーブルがテスト間で汚染しない（独立性担保）。`_occ_guard` の afterEach 不変検査も維持。

ただし計画のテスト方針・C-1 に列挙された観点のうち、**フロントエンドの null/0 区別・空状態+導線非表示の共存**と、**dispatcher fan-out のルーティング検証**が欠落している。後者は本 PR の最もリスクの高い変更点（ADR-005 の fan-out・取り違え防止）であるため Warning とする。

## Blockers / Warnings / Notes

### Blockers

なし

### Warnings

- **[W-001] dispatcher の新規 fan-out が「activity ハンドラへ実際にルーティングされる」ことを検証するテストが無い**
  場所: `app/core/application/workers/__tests__/dispatchDomainEvent.test.ts`
  理由: 本 PR で `dispatchDomainEvent` は (a) `ingestion.created` 既存 case への activity fan-out 追加、(b) `ingestion.failed` / `user.created` / `export.job.completed` / `instance_settings.updated` の純粋新規 case を足している。これは計画がリスク節（S-001-arch「fan-out の取り違え」）で最重要と位置づけた箇所。しかし diff を見ると、テストは `activityLogRepository` を**スタブとしてコンテナに足しただけ**で、ルーティングを検証する `it` が一つも増えていない。既存 `it("routes ingestion.created to runIngestionJob ...")` は `mockedRunIngestionJob` の呼び出ししか assert せず、`handleIngestionCreatedEvent`（recordBurst）が呼ばれることは確認していない。`ingestion.failed` / `user.created` / `export.job.completed` / `instance_settings.updated` の各新規 case が `default: skipped` から正しく `handled` に変わり、対応 activity ハンドラへ届くことの回帰防止が無い。`projection.test.ts` はハンドラ単体を直接呼ぶだけで dispatcher のルーティングは経由しない。
  影響: 将来 case ラベルの typo・case 抜け・fan-out 取り違え（別 case への二重登録でジョブ実行が壊れる、まさに計画が警告した退行）が CI で捕捉されない。
  提案: 既存の publication/export ハンドラを `vi.mock` している方式に倣い、各 activity ハンドラを mock するか、コンテナ内 `activityLogRepository.insertIfAbsent`/`recordBurst` スパイで、(1) `ingestion.created` で `runIngestionJob` と `recordBurst` の**両方**が呼ばれる、(2) `ingestion.failed`/`user.created`/`export.job.completed`/`instance_settings.updated` がそれぞれ `handled` を返し対応ハンドラへ届く、(3) `ingestion.created` を別 case に二重登録していない（`runIngestionJob` が 1 回だけ）— を assert するケースを足す。少なくとも「新規 4 case が skipped でなくなった」回帰テストは欲しい。

- **[W-002] フロントエンドの「null（取得失敗）と実データ 0（平坦線）の区別」「空状態+導線非表示の共存」テストが無い**
  場所: `app/components/admin/Dashboard/`（テストファイル不在）
  理由: 計画テスト方針が明示的に挙げた「チャート null 系列で『取得失敗』、実データ 0 件は平坦線で描き『取得失敗』と区別」「活動空状態 +『すべて見る』非表示の共存（S-002-coverage、二重表示にならない）」が、自動テストとして存在しない（`grep` で Dashboard 配下に test ファイル 0 件）。`getRecentActivity.integration.test.ts` のコメントは空配列を返すところまでしか担保せず、「空状態メッセージが出つつ導線が非表示で両立する」という UI 共存条件は backend テストでは検証できない。
  影響: AC-3（null vs 0 の区別）と AC-8（虚偽導線非表示）の UI 側回帰が、ブラウザ確認（manual-test）でしか守られない。しかも manual-test report では TC-4 が BLOCKED（agent-browser 偽陽性）で、設定変更 → 活動行の E2E は通っていない。
  軽減事情: `docs/test.md` は「Frontend: 必要最小限」を明言しており、本プロジェクトはコンポーネント単体テストを基本置かない方針。よって Blocker ではなく Warning とする。ただし計画テスト方針が「frontend」項として明記した以上、最低限の純粋関数（SVG path 生成・null/0 分岐・導線描画判定）が抽出可能ならそこだけ薄くテストする価値がある。
  提案: null/0 を分岐する描画ロジックや「rows が空なら link を描かない」判定を純関数に切り出して unit テストを 1〜2 本足す。難しければ、計画テスト方針の当該項が manual-test（しかも一部 BLOCKED）に委ねられている旨を PR に明記し、実ブラウザでの最終確認を必須とする。

### Notes

- **[N-001] adminSettings の event emit テストが 6 emit 対象 usecase 中 2 つしかカバーしていない**
  場所: `app/core/application/adminSettings/__tests__/adminSettingsEvents.integration.test.ts`
  理由: ADR-006「実装メモ B-6」で emit 対象は 9 usecase（settingKind 6 値）と棚卸しされたが、専用テストは `toggleRegistrationPolicy`（registration_policy）と `updateInstanceLimits`（instance_limits）の 2 件のみ。`updateLLMConfig` / `updateSpeechConfig` / `updatePromptTemplate` / `resetPromptTemplate` / `resetAllPromptTemplates` / `updateDesignTokens` / `resetDesignTokens` の emit と settingKind は未検証。計画 B-6 が「一部 usecase だけ emit して他が漏れる取りこぼしを構造的に防ぐ」ことを目的に掲げていたのに対し、検証は代表 2 件に留まる。
  提案: settingKind ユニオン 6 値が網羅されるよう、各 settingKind を産む usecase を最低 1 本ずつテーブルドリブンで足すと取りこぼし防止が完結する。

- **[N-002] 「no-op 時は emit しない」ガードのテストが無い**
  場所: `adminSettingsEvents.integration.test.ts`
  理由: ADR-006 B-6 表で `updatePromptTemplate` / `resetPromptTemplate` / `resetAllPromptTemplates` / `updateDesignTokens` / `resetDesignTokens` は「`next === current` の no-op 時は emit しない」と明記され、特に `resetDesignTokens` は本 PR で `next !== current` ガードを**新規追加**したと記録されている。この「変化なし → outbox に行が増えない」分岐のテストが無い。no-op でも emit してしまうと活動ログがノイズで溢れる（計画の虚偽/ノイズ回避方針に反する）退行が捕捉されない。
  提案: 「同一値で `updateDesignTokens`/`resetDesignTokens` を呼ぶと `instance_settings.updated` が 0 件」のケースを 1 本足す。

- **[N-003] adminSettings の domain events.ts / eventDecoders.ts に直接の unit テストが無い**
  場所: `app/core/domain/adminSettings/events.ts`、`app/core/application/adminSettings/eventDecoders.ts`
  理由: 新規ドメインイベント定義と zod strict デコーダ（`.strict()`、settingKind enum）に対する直接テストが無く、`grep` で `adminSettingsEventDecoders` を参照するテストは 0 件。デコーダは dispatcher 経由で間接的に走るが、`projection.test.ts` はデコーダを通さずハンドラを直接叩いており、`adminSettingsEvents.integration.test.ts` は outbox payload を読むだけでデコード往復はしていない。`docs/test.md` は「domain 層（events のデコード）の不変条件」を unit の狙いに挙げており、不正 payload（未知 settingKind・余剰フィールドで `.strict()` 拒否）の round-trip 検証があると堅い。他ドメイン（ingestion 等）の eventDecoders にデコーダ単体テストの先例があるか確認のうえ、揃えるのが望ましい。
  提案: settingKind enum 外の値・余剰キーで decode が失敗し、正常 payload は往復する unit テストを `adminSettings/__tests__/eventDecoders.test.ts` として足す（低コスト・高 ROI）。

- **[N-004] `handleIngestionCreatedEvent` の「owner 解決失敗時は skip」分岐に直接テストが無い**
  場所: `app/core/application/activityLog/handleIngestionCreatedEvent.ts`（`ownerId === null` で early return）
  理由: ハンドラは job 行が消えていると `ownerId` を解決できず burst を蓄積しない設計。`handleIngestionFailedEvent`/`handleUserCreatedEvent` は raw id フォールバックするのに対し、created は skip という非対称な分岐で、テストが無い。dispatchDomainEvent.test.ts のスタブは `findById` が null を返すが（W-001 のとおり）ルーティングを assert していないため、この分岐は事実上未検証。
  提案: fake で「job 不在 → recordBurst が呼ばれない」を 1 本足すと分岐が固定される。

- **[N-005] `pruneActivityLog` worker（orchestrator）の unit テストが無い**
  場所: `app/core/application/workers/pruneActivityLog.ts`（テスト不在）
  理由: 兄弟の `pruneOutbox` は `outboxPrune.test.ts` で「cutoff = now − retention を 1 回だけ計算しリポジトリへ Date で渡す / count 転送 / 構造化ログ」を厳密に固定している。`pruneActivityLog` は同様に 2 つの cutoff（`ACTIVITY_LOG_RETENTION_DAYS` 日 / `INGESTION_BURST_LOG_RETENTION_HOURS` 時）を算出してリポジトリへ渡す薄い orchestrator だが、cutoff 計算の正しさ（日 vs 時の取り違え）を pin するテストが無い。リポジトリ層の `pruneOlderThan`/`pruneBurstOlderThan` は実 D1 で検証済みだが、worker が「どの cutoff をどちらに渡すか」は別関心。
  提案: `outboxPrune.test.ts` に倣い、fake clock で activity/burst それぞれの cutoff が `now − N日` / `now − N時` になることと count 転送・ログを assert する unit テストを足す。

- **[N-006] burst 集約の「閾値ちょうど」と「複数 owner の分離」の境界**
  場所: `activityLogRepository.integration.test.ts`
  理由: 閾値前後（`THRESHOLD-1` で出ない / `THRESHOLD` で出る）・窓非マージ・eventId 冪等はカバーされ良い。一方、複数 owner が同窓に混在したとき owner ごとに正しく分離集約される（A の N 件と B の N 件が合算されない）ケースが無い。`COUNT(DISTINCT event_id)` を owner で GROUP していることの回帰防止として有用。
  提案: 2 owner それぞれ閾値件を同窓に入れ、large_upload 行が 2 本・各 target が別ハンドルになることを 1 本足す（任意）。
