# 実装計画 — Issue #254: failed ジョブを所有者が再試行できるようにする

**Issue:** #254
**作成日:** 2026-05-29
**複雑度:** 中〜大規模

---

## 目的

シナリオ B1 異常系（`spec/scenario/ingest.md`）が要求する「LLM 呼び出し失敗 / タイムアウト時に owner 向け再試行を置く」を実現する。既存 `retryIngestionJob` usecase は `assertAdmin` を呼ぶ admin 専用（P46）であり、一般ユーザーが自分の failed ジョブを retry する経路が存在しない。owner 認可で retry を駆動する usecase を新設し、アップロードモーダルの failed view とキュー画面の failed カードに「再試行」動線を追加する。

## スコープ

### 含まれるもの
- owner 向け retry usecase（`ownerRetryIngestionJob`）の新設
- 対応する server function / transport schema の追加
- アップロード（プレビュー編集）モーダルの failed view に「再試行」ボタン
- `IngestionJobRow` の failed カードに owner 向け retry 動線
- usecase / フロントのテスト追加
- spec の更新（scenario / usecases / domains）

### 含まれないもの
- ドメイン `IngestionJob.retry` の変更（既に理想形。`failed → pending`、`ingestion.retryRequested` 発火、`regenerationCount` 保持を再利用）
- 再 enqueue 経路（dispatch / runIngestionJob）の変更（#253 解決済みで `ingestion.retryRequested → runIngestionJob` ルーティング済み）
- admin retry usecase（`retryIngestionJob`）の変更（P46 用途でそのまま温存）
- retry 専用の回数制限フィールド新設（手動アクションで runaway せず、per-job 上限は再アップロードで迂回可能のため実効性なし — ADR-002 参照）

## 実装ステップ

### 1. owner 向け retry usecase を新設

- **対象ファイル:** `app/core/application/ingestion/ownerRetryIngestionJob.ts`（新規）
- **変更内容:** `regenerateIngestionPreview.ts` を雛形に。`OwnerRetryIngestionJobInput = { actorUserId, jobId }` / 出力 `{ jobId }`。UoW 内で `findById` → null なら `NotFoundError("INGESTION_JOB_NOT_FOUND")` → `found.entity.ownerId !== actor` なら `ForbiddenError("INGESTION_JOB_FORBIDDEN")` → `IngestionJob.retry(found.entity, now)` → `save(entity, expectedVersion)` → `collectEvents(transition.eventDrafts)`。
- **理由:** admin retry の `assertAdmin` 認可とは別経路が必要。既存 owner usecase（regenerate/discard）と認可・エラー・命名規約を統一する。

### 2. server function / schema を追加

- **対象ファイル:** `app/components/ingestion/actions.ts`, `app/components/ingestion/schema.ts`
- **変更内容:** `schema.ts` に `ownerRetryIngestionJobSchema = z.object({ jobId: z.string().min(1) })`。`actions.ts` に `ownerRetryIngestionJobFn`（`regenerateIngestionPreviewFn` と同形、`requireCurrentUser()` から actor 取得、usecase を dynamic import、戻り値 `{ jobId }`）。
- **理由:** client から actorUserId を渡させず server 側で取得する既存規約。`errorResponseMiddleware` で BusinessRuleError / ForbiddenError を構造化シリアライズ。

### 3. UploadDialog の FailedView に「再試行」ボタンを追加

- **対象ファイル:** `app/components/ingestion/UploadDialog.tsx`
- **変更内容:**
  - 現状 `FailedView` は `<FailedView job={view.job} onClose={onClose} />` として呼ばれ、再ポーリングへ戻すコールバックを受け取っていない。`FailedView` に **`onRetried` prop を追加**し、呼び出し側（`UploadDialog.tsx` の FailedView レンダリング箇所）で既存 `onRegenerated` と**同一実装**のハンドラ（`transientFailuresRef.current = 0` リセット → `setView({ kind: "waiting", jobId, startedAt: Date.now() })`）を渡す。retry も regenerate も「pending に戻して再ポーリング」で挙動同一なので、`editing` ビューが使う `onRegenerated` をそのまま再利用してよい。
  - `FailedView` 内で `ownerRetryIngestionJobFn` を `useServerFn` で呼ぶ。アクション並びは「再試行」「キュー画面で詳細を見る」「破棄」。retry 成功時に `onRetried(jobId)` を呼ぶ。
  - 失敗（`NoTempStorageForRetry` / `InvalidStateForRetry` 等）は `displayError` でインライン表示。多重発火防止のため pending 中はボタン disable。
- **理由:** B1 異常系の「再試行」要件。regenerate と同じ「pending に戻り再ポーリング」パターンを再利用し UX/コードの一貫性を保つ。

### 4. IngestionJobRow の failed カードに「再試行」動線を追加

- **対象ファイル:** `app/components/ingestion/IngestionJobRow.tsx`
- **変更内容:** `failed` ブランチに「再試行」ボタンを「破棄」の前に追加（`onRegenerate` と同形の `onRetry` ハンドラ、`ownerRetryIngestionJobFn` を `useServerFn`、成功でルーター invalidate しカードが pending に戻る）。
- **理由:** Issue「`IngestionJobRow` の failed カードにも owner 向け retry 動線」要件。複数ファイル経路（キュー画面）からも retry 可能にする。

### 5. spec を更新

- **対象ファイル:** `spec/scenario/ingest.md`, `spec/usecases/ingestion.md`, `spec/domains/ingestion.md`
- **変更内容:**
  - `ingest.md` B1 異常系の「LLM 呼び出し失敗 / タイムアウト」行を「『再試行』『破棄』『キュー画面で詳細を見る』を提示」に更新し、ADR-007 の「別 Issue 予定」注記を「Issue #254 で実装」に置換。B2 異常系の「再試行は別 Issue 予定」該当箇所も更新。
  - `usecases/ingestion.md` に owner retry 経路を追記（入力 `{ actorUserId, jobId }`・フロー・エラー）。現状この doc に admin retry の独立節が無いため、admin/owner 2 経路の対比が成立するよう admin retry 節も最小限あわせて整備する。
  - `domains/ingestion.md` の `IngestionJob` 振る舞いに `retry(now)` を明記（`failed → pending`、`regenerationCount` 保持、temp key 喪失時はエラー）。owner retry には per-job 回数上限が無く、コスト制御はインスタンス単位の利用上限に委ねる方針（ADR-002）を不変条件として明記する。
- **理由:** spec が SSOT。owner retry を反映し実装との乖離を解消。

### 6. テストを追加

- **対象ファイル:** `app/core/application/ingestion/__tests__/ownerRetryIngestionJob.integration.test.ts`（新規）, `app/components/ingestion/__tests__/UploadDialog.test.tsx` / `IngestionJobRow.test.tsx`（追記）
- **変更内容:** usecase: 正常 retry / 他人の job で Forbidden / failed 以外で `InvalidStateForRetry` / retryRequested イベント発火。`NoTempStorageForRetry` は failed ジョブが temp key を保持する都合上、fixture で temp key を null にしたジョブを直接保存して検証する（ドメイン層テスト `entity.test.ts` で既出のため usecase 層では補助的カバレッジ）。フロント: FailedView retry → waiting 遷移、IngestionJobRow failed retry。
- **理由:** 既存 `retryIngestionJob` テストと対称のカバレッジを owner 経路にも用意。

## 設計判断

詳細は `.issue/254/adr.md` 参照。要点:

- **owner retry は別 usecase 新設**（`retryIngestionJob` への分岐追加ではない）。admin/owner で認可セマンティクスが根本的に異なるため、既存 owner usecase（regenerate/discard）と同じ個別 usecase 設計に揃える。
- **retry 専用の回数制限は新設しない**。当初想定した「regeneration キャップ・pruner の temp key 回収による自然終端」は実装に存在しないことが判明（`markFailed` は temp key 保持、`retry` は `regenerationCount` を参照しない、pruner は outbox 専用）。それでも上限を設けない判断: owner retry は手動アクションで runaway しない／per-job 上限は同一ファイル再アップロードで自明に迂回でき実効性がない／コスト制御はインスタンス単位の利用上限で扱う。
- **再 enqueue 経路は既存利用**（追加対応ゼロ）。

## リスクと注意点

- **temp key 喪失 retry の UX**: wire に temp key を載せないため UI は retry 可否を事前判定できない。ボタンは常時表示し、`NoTempStorageForRetry` を `errorDisplay.ts` 経由でユーザー向け文言にマップする。**マッピングは既に存在する**（`errorDisplay.ts` に `ingestion_no_temp_storage_for_retry` /「再試行に必要なデータが見つかりません。再度アップロードしてください」と `ingestion_invalid_state_for_retry` が用意済み）— 追加不要。
- **命名衝突回避**: 新 usecase は `ownerRetryIngestionJob` / server fn は `ownerRetryIngestionJobFn`。
- **errorReason 非投影**: retry 失敗時に内部 errorReason を漏らさない既存方針を維持。エラー表示は errorCode ベースのみ。
- **二重 retry**: ポーリング中・pending 中の多重発火は OCC（`expectedVersion`）で 2 回目が conflict になり防がれる。フロントは pending 中ボタン disable で UX 補強。
- retry に確認ダイアログは不要（破棄と違い破壊的でない）— 直接実行。

## テスト方針

- `pnpm test:integration` — 新規 usecase テスト（正常 / Forbidden / 状態違反 / temp key 喪失 / イベント発火）
- `pnpm test:unit` — フロント component テスト（FailedView retry → waiting 遷移、IngestionJobRow failed retry）
- `pnpm typecheck && pnpm lint:fix && pnpm format` — 静的検査
- 手動: (a) モーダル FailedView の「再試行」→ スケルトン → previewing 復帰、(b) キュー画面 failed カードの「再試行」→ 待機中に戻る、(c) 他ユーザー job への retry が 403。admin Jobs 画面の retry が引き続き動くリグレッション確認。

## レビュー履歴

### 1周目
**修正した点**:
- [P-001 / 要件視点] ADR-002 の前提（pruner が temp key を回収して retry の自然終端が効く / regeneration キャップが retry を抑制する）が実装に存在しないことが判明。`markFailed` は temp key を保持し、`retry` は `regenerationCount` を参照も加算もせず、pruner は outbox 専用。ADR-002 を「事実上の上限は無いが、手動アクション・再アップロードで迂回可能・インスタンス利用上限で制御」という正直な根拠に全面改稿。plan.md 設計判断サマリーと domains spec 方針も同期。
- [P-002 / 要件視点・S-002 アーキ視点] `FailedView` は現状 `job` と `onClose` しか受け取らず、waiting 再突入のコールバックが無い。ステップ 3 に「`onRetried` prop 追加 + 既存 `onRegenerated` と同一実装のハンドラ配線」を明記。

**取り込んだ改善提案**:
- [S-001 両視点] `errorDisplay.ts` に `ingestion_no_temp_storage_for_retry` / `ingestion_invalid_state_for_retry` のマッピングが既存と確認。リスク節の「無ければ追加」ヘッジを削除し「追加不要」と確定。
- [S-001 要件視点] usecase テストの `NoTempStorageForRetry` は failed ジョブが temp key を保持する都合上、fixture で temp key null のジョブを直接保存して検証する旨をステップ 6 に明記。
- [S-002 要件 / S-004 アーキ] usecases/ingestion.md に admin retry の独立節が無いため、owner retry 追記時に admin 節も最小限整備して 2 経路対比を成立させる旨をステップ 5 に明記。

**見送った提案とその理由**:
- なし（指摘はすべて取り込み）。

**アーキ視点の総括**: 問題点ゼロ（owner 認可・再 enqueue 経路・ドメイン retry の各前提をコードで裏取り済み）。
