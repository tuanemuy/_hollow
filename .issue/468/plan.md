# 実装計画 — Issue #468: ソースファイルのストレージ衛生: 保持期間ポリシー(TTL)と孤児blobの回収

**Issue:** #468
**作成日:** 2026-07-10
**複雑度:** 中〜大規模

---

## 目的

取り込み元ソースファイル（`MediaAsset(kind='source')`）の保持ポリシーを設計判断として確定し、commit の put 成功・DB ロールバック時に発生する「`MediaAsset` 行を持たない source blob」が自動回収されるストレージ衛生機構を導入する。

## 受け入れ基準

| # | 基準（検証可能な形で） | 由来 | 対応ステップ |
|---|---|---|---|
| AC-1 | source ファイルの保持/回収ポリシー（TTL の要否・対象・猶予期間）が決定され、ADR と `spec/domains/media.md` に明文化されている | Issue 課題1「対応案: 保持/回収ポリシーを決める」 | ADR-001, ステップ 9 |
| AC-2 | commit のステージ (a) `put` 成功後に UoW がロールバックしても、残った source blob が人手の介在なく自動回収される（回収経路がテストで実証されている） | Issue 課題2 | ステップ 4, 5, 8 |
| AC-3 | 回収機構（PurgeOrphans + 新設 sweep）が cron から定期実行される配線が存在する（現状 `purgeOrphans` はどこからも起動されていない） | Issue 課題2「回収手段（pruner worker への組み込み）」 | ステップ 6, 7 |
| AC-4 | 猶予期間内の進行中 commit の blob / `pending` 行を誤って回収しない（grace window がテストで検証されている） | Issue 課題2（回収の安全性は要件に内包） | ステップ 3, 5, 8 |
| AC-5 | 既存フロー（commit 正常系 / overwrite 差し替え / note purge 経由の orphan 化 / uploadMedia 系 / 既存 purge ループ）が退行しない | 既存互換（#452 実装の維持） | ステップ 4, 8 |

## スコープ

### 含まれないもの

- **時間ベース TTL / 段階的アーカイブの実装** — 検討の結果「導入しない」を正式決定とする（ADR-001）。将来コストが顕在化した際は admin instance setting による opt-in TTL を別 Issue で設計する。
- **`kind='image' | 'video' | 'avatar'` の stale `pending` 行の掃除** — 編集中エディタで attach 待ちの正当な `pending` が存在しうるため、source と同じ基準で回収できない（ADR-004）。別 Issue とする。
- **本修正デプロイ以前に既に漏れた blob の自動回収** — キー走査を導入しない判断（ADR-002）の帰結。発生確率は極小（#452 マージ後の commit DB 失敗のみ）で、必要なら ADR-002 記載の手動リコンサイル手順で対処。
- **`ObjectStorage` ポートへの `list` 追加** — ADR-002 で不採用。
- **アプリケーションレベルの put リトライ / 補償トランザクション** — CLAUDE.md「Retry strategy」どおりアダプター内リトライに委ね、失敗時は sweep が回収する。

## 調査結果

- 関連ファイル:
  - `app/core/application/ingestion/commitIngestionPreview.ts` — commit の3段フロー。`prepareSourcePersist`（UoW 前の projection 読み + `objectStorage.put`）→ UoW 内 `MediaAsset.create`+`markAttached` → UoW 後 temp delete。put 成功・UoW ロールバックで blob が行なしで残るのが本 Issue の課題2。
  - `app/core/domain/media/entity.ts` — `MediaAsset` の状態機械。`decrementRef(pending) → orphan` が「intake 放棄」の遷移としてドキュメント込みで既に存在する。
  - `app/core/domain/media/ports/mediaAssetRepository.ts` — `findPurgeableOlderThan(before, limit)` は `status IN ('orphan','deleting')` のみ。`pending` は対象外。
  - `app/core/domain/media/service.ts` — `listPurgeCandidates` / `purge`（R2 delete → DB delete。R2 delete は「already gone = success」）。
  - `app/core/application/media/purgeOrphans.ts` — 2段 UoW の purge オーケストレータ。**呼び出し元がどこにも存在しない**（後述の乖離）。
  - `app/worker/cloudflare/handlers.ts` `runPruneTick` — 日次 pruner tick。`purgeExpiredExports` を `createRequestContainer(readRequestServerConfig(env))` で best-effort 実行する前例あり（#783 ADR-005）。
  - `app/core/adapters/d1/repositories/mediaAssetRepository.ts` — D1 実装。`idx_media_status_updated (status, updated_at)` が既存で、status 起点のクエリを支える。
  - `app/core/adapters/cloudflare/r2ObjectStorage.ts` / `app/core/domain/media/ports/objectStorage.ts` — ポートに `list` は無い。R2 binding 自体は `list({prefix})` を持つが、キーは `{ownerId}/source/{mediaId}` で **source 共通のプレフィックスが存在しない**（走査するならバケット全走査 or 全ユーザー列挙が必要）。
  - `wrangler.toml [env.pruner]` — ローカルは `OBJECT_STORAGE` binding + `R2_OBJECT_BUCKET_NAME` あり。**`infra/templates/wrangler.{production,staging}.toml.tmpl` の pruner には無い**（#783 由来のドリフト）。secrets は CI の bulk push で全 worker に配布済み（`infra/src/secrets.ts` のコメント参照）。
  - `.issue/452/adr.md` ADR-004/005, `.issue/452/progress.md` — 本 Issue の前提となる設計判断と残存課題。
- あるべきアーキテクチャ: ヘキサゴナル + DDD（CLAUDE.md）。状態遷移はドメインエンティティ、cutoff 計算などのドメインルールはドメインサービス、オーケストレーションと per-row tolerance はアプリケーション層 worker ユースケース、cron 配線は `app/worker/cloudflare/` + wrangler。ポートは最小に保つ。
- 既存実装の状態（乖離）:
  1. **`purgeOrphans` が未配線**: `spec/usecases/media.md` は「PurgeOrphans（バッチ）/ Cron 起動」と定義するが、`runPruneTick` にも他のどの entry point にも組み込まれていない。#452 ADR-005 の「orphan 化して標準 purge worker に回収させる」も、本 Issue の回収経路も、この配線がなければ機能しない。本 Issue で理想形（pruner tick への組み込み）に寄せる。
  2. **infra テンプレートのドリフト**: 上記のとおり production/staging の pruner に `OBJECT_STORAGE` binding が無く、#783 の export purge も本番では unavailable storage にフォールバックする状態。purge 配線が本 Issue のスコープに入るため併せて解消する。
  3. **`uploadMediaPresigned` の JSDoc の誤り**: 「pending のまま放置された行は PurgeOrphans が回収する」と書かれているが、`findPurgeableOlderThan` は pending を対象にしない。本 Issue では source の sweep 導入に伴い、この誤記を実態に合わせて修正する（挙動変更はしない）。
- 依存関係: media ドメイン（ポート/サービス/エンティティ）、ingestion commit ユースケース、pruner worker、D1 リポジトリ、infra テンプレート、spec（domains/media, usecases/media, usecases/ingestion, testcases/media）。`media.orphaned` イベントが sweep から発火するが、`dispatchDomainEvent` は `media.*` を skip するため consumer 影響なし。

## 設計

キー走査バッチではなく「**blob は誕生時点から必ず DB 行を持つ**」という不変条件を回復する方向で設計する（ADR-002）。commit のステージ (a) を metadata-first（`pending` 行を先に永続化 → put）に変え、どの時点で失敗・ロールバックしても `pending` 行が残るようにする。残った `pending(kind='source')` 行は猶予期間後に sweep が `orphan` 化し、既存の purge 機構が blob と行を回収する。TTL は導入しない（ADR-001）。

### ドメインモデルへの影響

- **エンティティ・値オブジェクト: 変更なし。** `pending → orphan` の遷移は `MediaAsset.decrementRef`（「Abandoning a pending intake transitions directly to orphan」と既にドキュメントされている）をそのまま使う。新しい状態・イベントは増やさない。
- **ポート `MediaAssetRepository`**: `findAbandonedSourceIntakes(before: Date, limit: number)` を追加。`status = 'pending' AND kind = 'source' AND updatedAt < before` の行を `updatedAt` 昇順で返す。kind を引数にせずメソッド名に固定するのは、source 以外の pending を回収対象にしない設計判断（ADR-004）を型レベルで表明するため。
- **ドメインサービス `MediaService`**: `listAbandonedSourceIntakes(now, graceSec, repo, limit)` を追加。`listPurgeCandidates` と対称に、猶予期間（cutoff 計算）というドメインルールをサービス側に置き、アダプターは status/kind フィルタだけを担う。
- **ポート `ObjectStorage`: 変更なし**（`list` を追加しない — ADR-002）。

### ユースケース / アプリケーションロジック

- **`commitIngestionPreview` の `prepareSourcePersist` を metadata-first に変更**:
  1. job の projection 読み・temp bytes 取得（既存どおり。temp 欠損 skip 判定を行更新より前に済ませ、行だけ残る無駄を作らない）
  2. **新設の小 UoW**: `MediaAsset.create(kind='source')` で `pending` 行を save（イベントは collect しない — `uploadMedia` / `uploadMediaPresigned` の intake と同じ扱い）
  3. `safeStoragePut`（既存どおり。失敗時は rethrow — 残った pending 行は sweep が回収）
  - メイン UoW 側は `MediaAsset.create + markAttached` から **`findById(sourcePersist.mediaId)` → `MediaAsset.isPending` ガード → `markAttached` → save + collectEvents** に変更。行が見つからない / pending でない場合は同一リクエスト内では起こり得ない整合性異常なので `SystemError(DataIntegrityError 相当)` を投げる（黙って sourceFileId を落とさない）。
  - これで「put 成功・UoW ロールバック」「put 自体の失敗」「put 後のクラッシュ」のいずれでも `pending` 行が残り、回収経路（sweep → purge）に必ず乗る。
- **新規ユースケース `sweepAbandonedSourceIntakes`**（`app/core/application/media/sweepAbandonedSourceIntakes.ts`）:
  - `purgeOrphans` と同型の cron worker ユースケース。`MediaService.listAbandonedSourceIntakes(now, graceSec, repo, batch)` で候補取得 → 各行を per-row try/catch で UoW 実行: fresh を `findById` → まだ `pending` かつ `kind === 'source'` なら `decrementRef`（→ orphan、`media.orphaned` collect）→ save。
  - デフォルト: `graceSec = 24h`, `batchSize = 100`（`purgeOrphans` と同値。オプション引数で上書き可、env 配線はしない — `purgeOrphans` と同じ方針）。
  - orphan 化された行は `updatedAt` が再スタンプされるため、実際の blob 削除はさらに orphan 猶予（24h）経過後の purge sweep で行われる（誤回収に対する二重の猶予）。
- **`purgeOrphans`: 変更なし**（配線のみ追加）。

### アダプター / 永続化 / 外部連携

- `app/core/adapters/d1/repositories/mediaAssetRepository.ts` に `findAbandonedSourceIntakes` を実装。`WHERE status = 'pending' AND kind = 'source' AND updated_at < ? ORDER BY updated_at ASC, id ASC LIMIT ?`。既存 `idx_media_status_updated (status, updated_at)` が効くため**マイグレーション不要**。
- スキーマ変更なし。R2 アダプター変更なし。

### ワーカー / 配線 / インフラ

- `app/worker/cloudflare/handlers.ts` `runPruneTick`: 既存の `purgeExpiredExports` と同じパターンで、`createRequestContainer(readRequestServerConfig(env))` の purge 用コンテナを使い、**`sweepAbandonedSourceIntakes` → `purgeOrphans`** を各々独立の best-effort try/catch で追加（ログのみ。戻り値契約 `{ outboxDeleted, processedEventsDeleted }` は変えない）。日次 cron（03:00 UTC）+ 24h 猶予で十分（ADR-003）。
- `infra/templates/wrangler.{production,staging}.toml.tmpl` の `[env.pruner]` に `[[env.pruner.r2_buckets]] OBJECT_STORAGE` と `R2_OBJECT_BUCKET_NAME` var を追加（ローカル `wrangler.toml` は #783 で追加済み。このドリフト解消は #783 の export purge の本番動作も直す）。
- `infra/src/secrets.ts`: pruner が R2 presign secrets を実際に消費するようになるため、`dispatchExtras` を R2 presign 3種（`R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`）とそれ以外（`SECRET_BOX_MASTER_KEY` / `ADMIN_LLM_API_KEY`）に分割し、`names.pruner` には実消費する R2_* 3種のみを宣言する。`dispatchExtras` 丸ごとの付与は LLM / 暗号系秘密の過剰宣言になり「ドキュメントとしての正確性回復」という目的に反するため（bulk push の実態と secrets の union は不変で `checkSecrets.ts` は壊れない）。

### UI / プレゼンテーション

なし。

## 実装ステップ

### 1. `MediaAssetRepository` ポートに `findAbandonedSourceIntakes` を追加 + `ObjectStorage.delete` の冪等性契約を補強

- **対象ファイル:** `app/core/domain/media/ports/mediaAssetRepository.ts`、`app/core/domain/media/ports/objectStorage.ts`（JSDoc のみ）
- **変更内容:**
  - `findAbandonedSourceIntakes(before: Date, limit: number): Promise<readonly MediaAsset[]>` を追加。JSDoc に「commit のステージ (a) で作られたまま attach されなかった source intake の回収用。`pending` かつ `kind='source'` のみ。他 kind の pending は正当に attach 待ちの可能性があるため対象外（#468 ADR-004）」を明記。
  - `ObjectStorage.delete` の既存 JSDoc（「already gone は成功として扱う」）に、#468 の回収チェーンがこの冪等性に構造的に依存する旨を補強する — put 失敗時は「blob なし `pending` 行」が定常的に purge 経路へ流入するため、missing key を `StorageNotFoundError` にするアダプターが将来書かれると blob なし行が `deleting` で永久 stall する（ADR-002）。`MediaService.purge` の JSDoc「`StorageNotFoundError` を含め伝播する」が delete も NotFound を投げうるという誤読を誘わないよう表現を整える。
- **理由:** 回収候補の抽出をポート契約として定義する（設計はドメイン内側から）。delete 冪等性は回収チェーンが暗黙に踏む前提であり、#468 で初めて構造的に依存されるため契約として固定する。

### 2. `MediaService.listAbandonedSourceIntakes` を追加

- **対象ファイル:** `app/core/domain/media/service.ts`、`app/core/domain/media/__tests__/service.test.ts`
- **変更内容:** `listPurgeCandidates` と対称の `listAbandonedSourceIntakes(now, graceSec, repo, limit = 100)`（cutoff = now − graceSec を計算して repo に委譲）。unit test で cutoff 計算と委譲を検証。
- **理由:** 猶予期間はドメインルール。アダプターに漏らさない。

### 3. D1 リポジトリに `findAbandonedSourceIntakes` を実装

- **対象ファイル:** `app/core/adapters/d1/repositories/mediaAssetRepository.ts`、`app/core/adapters/d1/__tests__/`（既存の media リポジトリ integration test に追加）
- **変更内容:** `status='pending' AND kind='source' AND updated_at < cutoff` を `updatedAt ASC, id ASC LIMIT n` で返す実装。integration test: 古い pending/source は返る・新しい pending/source は返らない・古い pending/image は返らない・attached/orphan の source は返らない。
- **理由:** ポート実装。既存インデックスで賄えるためマイグレーション無し。

### 4. `commitIngestionPreview` を metadata-first に変更

- **対象ファイル:** `app/core/application/ingestion/commitIngestionPreview.ts`
- **変更内容:**
  - `prepareSourcePersist`: temp bytes 取得成功後、`put` の**前に**小 UoW で `MediaAsset.create`（pending, イベント collect なし）を save。
  - メイン UoW: `MediaAsset.create + markAttached` を `mediaAssetRepository.findById` → `MediaAsset.isPending` ガード → `markAttached` → save + collectEvents に置換。null / 非 pending は `SystemError`（データ整合性異常）。
  - ステージ (a) のコメント（「blob is orphaned with no MediaAsset row … accepted edge」）を新しい契約（pending 行が先に存在し sweep が回収する）に書き換え。
- **理由:** 「行なし blob」という回収不能状態を構造的に作れなくする（AC-2 の前段）。

### 5. `sweepAbandonedSourceIntakes` ユースケースを新規作成

- **対象ファイル:** `app/core/application/media/sweepAbandonedSourceIntakes.ts`（新規）、`app/core/application/media/__tests__/sweepAbandonedSourceIntakes.integration.test.ts`（新規）、`app/core/application/media/__tests__/sweepAbandonedSourceIntakes.test.ts`（新規・unit）、`app/core/application/media/uploadMediaPresigned.ts`（JSDoc のみ）
- **変更内容:**
  - `purgeOrphans` と同じシグネチャ様式（`RequestContainer` + options `{ graceSec = 24h, batchSize = 100 }`、戻り値 `{ swept, failed }`）。候補ごとに UoW: fresh `findById` → まだ pending/source なら `decrementRef` → save + collectEvents。per-row try/catch でログ + failed 計上。
  - integration test: ①古い pending/source が orphan 化され `media.orphaned` が outbox に載る ②猶予内はスキップ ③pending/image は触らない ④二重実行はクエリレベルで冪等（2回目は候補が空 — orphan 行は `findAbandonedSourceIntakes` に載らないため、この経路では per-row の fresh ガードは exercise されない点をテストの意図として明記） ⑤orphan 化後、`purgeOrphans`（猶予 0）で blob + 行が消える（回収チェーンの接続確認。候補条件は strict `<` なのでクロックを前進させてから実行し、同時刻フレークを避ける） ⑥put 失敗相当（blob を置かずに pending/source 行のみ作成）→ sweep → `purgeOrphans` で行が消える（blob なし行でも `ObjectStorage.delete` の冪等性により purge が完走する — ステップ 1 の契約の検証）。
  - unit test: fresh `findById` ガード（候補列挙と per-row UoW の間の遷移に対する防御）をフェイク repo で検証 — 候補返却後に該当行を attached に変異させ、sweep がその行を `decrementRef` せずスキップすることを確認する（integration では orphan 行が候補クエリに載らずガードを通せないため unit で担保）。
  - `uploadMediaPresigned` の「PurgeOrphans worker reclaims it」JSDoc を実態（pending は現状回収対象外。source intake のみ #468 の sweep が回収）に修正。
- **理由:** 回収の実行本体（AC-2）。orphan 化以降は既存 purge 機構に一本化（#452 ADR-005 と同じ原則）。

### 6. `runPruneTick` に sweep + `purgeOrphans` を配線

- **対象ファイル:** `app/worker/cloudflare/handlers.ts`、`app/worker/cloudflare/__tests__/runPruneTick.test.ts`、`app/worker/cloudflare/__tests__/handlers.integration.test.ts`
- **変更内容:** `purgeExpiredExports` と同様に purge 用 `RequestContainer` で `sweepAbandonedSourceIntakes` → `purgeOrphans` を順に実行。各々独立の try/catch + `logger.error`（swallow）。成功時は件数を `logger.info`。戻り値契約は不変。JSDoc の tick 説明に2ステップを追記。unit test: 呼び出し順・失敗 swallow・他ステップ非阻害をモックで検証。実 DB の `handlers.integration.test.ts` は既存が green のままであることを確認し、prune tick 経由の sweep → purge ハッピーパス1本を追加する（tick のステップが増える変更の実DB経路での裏付け）。
- **理由:** AC-3。`purgeOrphans` が spec どおり Cron 起動になる（既存乖離の解消）。日次 + 24h 猶予で回収要件を満たす（ADR-003）。

### 7. infra: pruner に OBJECT_STORAGE を配線

- **対象ファイル:** `infra/templates/wrangler.production.toml.tmpl`、`infra/templates/wrangler.staging.toml.tmpl`、`infra/src/secrets.ts`
- **変更内容:** 両テンプレートの `[env.pruner]` に `[[env.pruner.r2_buckets]] binding = "OBJECT_STORAGE"` と `R2_OBJECT_BUCKET_NAME` var を追加（ローカル `wrangler.toml` と同じコメントを付ける）。`secrets.ts` は `dispatchExtras` を `r2PresignExtras`（`R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`）と `llmDispatchExtras`（`SECRET_BOX_MASTER_KEY` / `ADMIN_LLM_API_KEY`）に分割し、pruner エントリは `[...shared, ...r2PresignExtras]`（実消費分のみ）、web / consumer は従来どおり全種を宣言する。コメントは pruner が purge で R2 presign config を実消費する実態に更新。secrets の union は不変のため `checkSecrets.ts` と bulk push は影響を受けない。
- **理由:** これが無いと本番 pruner の `objectStorage` が unavailable フォールバックになり purge が空振りする（#783 のドリフトも同時解消）。

### 8. commit ロールバック → 回収の E2E 経路テスト

- **対象ファイル:** `app/core/application/ingestion/__tests__/ingestion.integration.test.ts`（追加）
- **変更内容:** previewing job に対し `modifications.directoryId` を実在しない ID にして commit → メイン UoW が `NotFoundError` でロールバック。この時点で ①source blob が object storage に存在 ②`MediaAsset` 行が `pending/source` で存在、を assert。続けて `sweepAbandonedSourceIntakes`（grace 0）→ orphan 化を assert し、クロックを前進（または `updatedAt` をバックデート）させた上で `purgeOrphans`（age 0）を**1回**実行し、markDeleting → purge まで同一呼び出し内で完走して blob と行の両方が消えることを assert する。「再実行」は不要（`purgeOrphans` は候補1件につき UoW1: markDeleting → UoW2: purge を同一イテレーションで完走する。再実行が要るのは前回 R2 失敗で `deleting` に stall した行の再開パスだけ）。候補条件は strict `<`（`updatedAt < now − ageSec`）のため、sweep の orphan 化と同時刻のまま呼ぶと候補に載らずフレークする — 既存 `purgeOrphans.integration.test.ts` のクロックピン留め（`container.clock` 差し替え）/ `updatedAt` バックデートのヘルパーパターンを踏襲する。併せて commit 正常系（attached / sourceFileId 束縛）と overwrite 差し替えの既存テストが green であることを確認。
- **理由:** AC-2 の受け入れ根拠となる「put 成功・DB ロールバック → 自動回収」の実証。

### 9. spec 更新

- **対象ファイル:** `spec/domains/media.md`、`spec/usecases/media.md`、`spec/usecases/ingestion.md`、`spec/testcases/media/index.md`、`spec/testcases/ingestion/index.md`、`docs/runtime_cloudflare.md`
- **変更内容:**
  - `domains/media.md`: 保持ポリシーの明文化 —「source blob に時間ベース TTL は設けない。保持は Note のライフサイクルに連動し、参照が外れた時点（overwrite / note purge / commit 不成立の intake 放棄）で orphan 化 → purge 回収（#468 ADR-001）」。`MediaService.listAbandonedSourceIntakes` とポートメソッドを追記。
  - `usecases/media.md`: `SweepAbandonedSourceIntakes（バッチ）` セクション追加、`PurgeOrphans` に「pruner tick から日次起動」を明記。
  - `usecases/ingestion.md`: commit ステージ (a) を metadata-first（pending 行 → put）に更新。
  - `testcases/media/index.md`: sweep のテーブル（古い pending/source → orphan、猶予内スキップ、他 kind 非対象、冪等）を追加。
  - `testcases/ingestion/index.md`: Commit に「メイン UoW ロールバック時は `pending/source` 行と blob が残存し、sweep → purge の回収経路に乗る」の行を追加（ステップ 4 で変わる観測可能挙動と、ステップ 8 のテストに対応する spec 行）。
  - `docs/runtime_cloudflare.md`: ADR-002 が約束する手動リコンサイル手順（本修正のデプロイ以前に漏れた blob の一回限りの突合削除: `wrangler r2 object` / S3 API で `*/source/*` キーを列挙 → `media_assets.storage_key` と突合 → 差分を削除）を運用ノートとして追記する。運用時に参照される場所（運用ガイダンスの置き場）から辿れるようにし、ADR の宣言と成果物を一致させる。
- **理由:** AC-1 の明文化と spec-実装整合。ADR-002 の運用ノートの出力先を確定させる。

## 設計判断

詳細は `adr.md` を参照。

- **ADR-001**: 時間ベース TTL は導入しない。保持ポリシーは「Note のライフサイクル連動」を正式化（対象: source 全件、猶予: orphan/intake とも 24h、再検討トリガーを明記）。
- **ADR-002**: 孤児回収はキー走査バッチではなく「metadata-first + abandoned-intake sweep」（DB 駆動）。`ObjectStorage` ポートに `list` を足さない。
- **ADR-003**: 回収バッチは新規 worker ではなく既存 pruner tick へ組み込む。未配線だった `purgeOrphans` もここで配線する。
- **ADR-004**: sweep の対象は `kind='source'` の pending に限定する。

## リスクと注意点

- **メイン UoW の read-modify-write 化**: `markAttached` が `findById` の結果に依存するようになる。同一リクエスト内で直前に自分が挿入した行なので実質確定だが、null / 非 pending への防御（SystemError）を必ず入れる。既存の commit 正常系テストで退行を検知する。
- **猶予期間の妥当性**: source の pending は commit リクエスト内で数秒後に attach されるため 24h は十分安全側。逆に回収完了までは最悪 約2日 + purge 猶予（sweep 24h → orphan 24h → purge）かかるが、稀な異常系の掃除なので許容。
- **`media.orphaned` イベントの新規発火点**: sweep 起点で outbox に載るが、`dispatchDomainEvent` は `media.*` を skip するため consumer 側影響なし（確認済み）。
- **pruner の RequestContainer**: presign secrets / binding が欠けると `objectStorage` が unavailable フォールバックになり purge の R2 delete が失敗し続ける（per-row catch でログに落ち、行は `deleting` のまま次回再試行）。ステップ 7 のテンプレート修正が本番動作の前提。
- **デプロイ順序**: ステップ 4（metadata-first）以前に漏れた blob は回収されない（スコープ外・ADR-002 に手動手順）。デプロイ後に発生する分はすべて回収経路に乗る。
- **`runPruneTick` の肥大化**: ステップが増えるが、既存の「独立 best-effort try/catch を並べる」パターンを踏襲し、戻り値契約を変えないことで既存テスト・呼び出し元への影響を遮断する。

## テスト方針

- **ドメイン unit** (`service.test.ts`): `listAbandonedSourceIntakes` の cutoff 計算・limit 委譲。
- **アダプター integration** (D1): `findAbandonedSourceIntakes` の status/kind/cutoff フィルタと並び順。
- **アプリケーション unit** (`sweepAbandonedSourceIntakes.test.ts`): fresh `findById` ガード（候補列挙後に行が遷移していた場合のスキップ）をフェイク repo の変異注入で検証。
- **アプリケーション integration**:
  - `sweepAbandonedSourceIntakes`: orphan 化・イベント収集・猶予内スキップ・他 kind 非対象・クエリレベル冪等性・blob なし行（put 失敗相当）の purge 完走・per-row 失敗分離。
  - `commitIngestionPreview`: 正常系（pending → attached、sourceFileId 束縛、temp delete）の退行確認と、ロールバック → pending 残存 → sweep → purge の E2E 回収経路（ステップ 8）。
- **worker unit** (`runPruneTick.test.ts`): 新ステップの呼び出し・失敗 swallow・他ステップ非阻害・戻り値契約不変。**worker integration** (`handlers.integration.test.ts`): 既存 green 確認 + tick 経由の sweep → purge ハッピーパス1本。
- **時刻の扱い**: grace / age 0 でも候補条件は strict `<` のため、fake clock をピン留めし cutoff 通過を明示的に作る（クロック前進 or `updatedAt` バックデート）。既存 `purgeOrphans.integration.test.ts` のパターンを踏襲し、同時刻フレークを排除する。
- 変更後に `pnpm typecheck && pnpm lint:fix && pnpm format` および `pnpm test:unit` / `pnpm test:integration`。

## レビュー履歴

### 1周目

両視点とも問題点ゼロ。改善提案7件（両視点の S-001 は同一指摘のため1件として扱う）をすべて反映して終了。

**取り込んだ改善提案**:
- coverage S-001 / arch-risk S-001（同一指摘）: ステップ 8 の `purgeOrphans` 動作記述を実装挙動（1回の呼び出しで markDeleting → purge 完走。「再実行」不要）に修正。strict `<` 境界による同時刻フレーク対策（クロックピン留め / `updatedAt` バックデート）をステップ 5 テスト⑤・ステップ 8・テスト方針に明記。
- coverage S-002: `secrets.ts` の pruner 宣言を `dispatchExtras` 丸ごとではなく実消費の R2_* 3種のみに修正（`dispatchExtras` を `r2PresignExtras` / `llmDispatchExtras` に分割する方式を採用）。設計セクションとステップ 7 に反映。
- coverage S-003: ADR-002 の手動リコンサイル手順の出力先を `docs/runtime_cloudflare.md` に確定し、ステップ 9 の成果物に追加。
- coverage S-004: commit ロールバック → `pending/source` 残存の新挙動を `spec/testcases/ingestion/index.md` にも追記するようステップ 9 を修正。
- arch-risk S-002: ステップ 6 の対象に `handlers.integration.test.ts` を追加（既存 green 確認 + tick 経由の sweep → purge ハッピーパス1本）。
- arch-risk S-003: `ObjectStorage.delete` の冪等性（missing key = 成功）への構造的依存をポート契約として補強するようステップ 1 を拡張し、put 失敗相当（blob なし行）→ sweep → purge 完走のテストをステップ 5 に追加。ADR-002 にも契約化を追記。
- arch-risk S-004: ステップ 5 テスト④の意図を「クエリレベルの冪等性確認」に書き直し、fresh `findById` ガードは unit テスト（フェイク repo の変異注入）で別途検証するよう変更。

**見送った提案とその理由**:
- なし。
