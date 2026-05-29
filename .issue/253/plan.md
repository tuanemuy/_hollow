# 実装計画 — Issue #253: regenerateIngestionPreview の実装と spec を一致させる（LLM 再駆動を復活させる）

**Issue:** #253
**作成日:** 2026-05-29
**複雑度:** 中〜大規模

---

## 目的

`regenerateIngestionPreview` usecase が現状 LLM の再駆動を行わず no-op になっている不整合を解消し、spec（`spec/usecases/ingestion.md`: 「キューに RunIngestionJob を再 enqueue」）と実装を一致させる。`/upload` の `IngestionJobRow` と #226 のプレビュー編集モーダルから「再生成」を押すと、LLM が再実行され新しい preview が生成されるようにする。

## スコープ

### 含まれるもの

- `regenerateIngestionPreview` usecase / ドメイン遷移の見直し（`previewing → pending` へ）
- `dispatchDomainEvent` に `ingestion.regenerated` ルーティングを追加（ADR-004 の意図的除外を本 Issue で覆す）
- 既存 `IngestionJobRow` の再生成ボタンの実動作確認
- #226 プレビュー編集モーダルへの「再生成」ボタン復活（ADR-006 の除外を解消）
- spec / テストの更新

### 含まれないもの

- `runIngestionJob` の `isPending` ガード緩和（案 A は不採用 — 不変条件を壊しリスク大）
- 新イベント `ingestion.regenerationRequested` の新設（案 B は不採用 — `retryRequested` と実質重複）
- #57 ADR-003 の既知の限界（`LLMRateLimitError` 時の `processing` 固着）の根本対処（本 Issue で新たに悪化しないため対象外）

## 採用方針: 案 C（二段遷移 `previewing → pending → processing`）

`regenerate` の遷移先を `processing` 直行から **`pending`** に変更し、既存の `ingestion.regenerated` イベントを dispatch → `runIngestionJob` にルーティングする。これにより admin retry（`failed → pending` + `ingestion.retryRequested` dispatch + `isPending` 通過）という**既存の理想形パターンを完全再利用**し、`isPending` ガードの不変条件を保ったまま spec の「再 enqueue」を満たす。詳細・3案比較は `.issue/253/adr.md` 参照。

## 実装ステップ

### 1. ドメイン: `regenerate` の遷移先を `processing` → `pending` に変更

- **対象ファイル:** `app/core/domain/ingestion/entity.ts`（内部 `regenerate` L166-192 / 公開 `IngestionJob.regenerate` L514-526）
- **変更内容:** 戻り型を `WithEventDrafts<ProcessingIngestionJob, …>` → `WithEventDrafts<PendingIngestionJob, …>` に変更。`next` の `status: "processing"` を `"pending"` に。`preview: null`・`regenerationCount` インクリメント・`ingestion.regenerated` event draft（`regenerationCount` 付き）は維持。`PendingIngestionJob` 型に合わせ全 nullable フィールド（`errorCode`/`errorReason`/`savedAsNoteId`）が `null` であることを確認。
- **理由:** retry と同じ「pending に戻す」semantic にし、`isPending` ガードを通過させる。

### 2. application: dispatch に `ingestion.regenerated` ルーティングを追加

- **対象ファイル:** `app/core/application/workers/dispatchDomainEvent.ts`（routing L126-139 / JSDoc L48-118 / 除外コメント L84-86）
- **変更内容:** `case "ingestion.created": case "ingestion.retryRequested":` に `case "ingestion.regenerated":` を追加し `runIngestionJob` にルーティング（payload から `jobId` を使用）。「intentionally NOT routed」コメントブロックと JSDoc の routing 説明を更新し、「ADR-004 を Issue #253 で覆した」旨を明記。
- **理由:** spec「キューに RunIngestionJob を再 enqueue」を満たす。dispatch が `pending` ジョブを `runIngestionJob` に渡し pipeline が再駆動される。

### 3. application: usecase の JSDoc / コメント更新

- **対象ファイル:** `app/core/application/ingestion/regenerateIngestionPreview.ts`（コメント L44-46 付近）
- **変更内容:** ロジックは `IngestionJob.regenerate` 呼び出し + save + `collectEvents` のまま（遷移先はドメイン変更により透過的に `pending` になる）。コメントを「`previewing→pending` に遷移し、`ingestion.regenerated` が dispatch 経由で `runIngestionJob` を再起動する」に更新。
- **理由:** ドメイン変更を usecase が透過的に反映。spec フロー L67-71 と一致。

### 4. UI: プレビュー編集モーダルに「再生成」ボタンを復活（`waiting` view 再遷移）

- **対象ファイル:** `app/components/ingestion/IngestionPreviewForm.tsx`（アクションバー L334-363）、`app/components/ingestion/UploadDialog.tsx`（view machine）
- **変更内容:**
  - `IngestionPreviewForm`: `regenerateIngestionPreviewFn` を `useServerFn` で取得。アクションバーの「破棄」と「登録」の間に「再生成」ボタン（`RefreshCw` アイコン）を追加。`onRegenerate` ハンドラで `regenerate({data:{jobId}})` を呼び、成功したら親へ `onRegenerated(jobId)` で通知する。
  - `UploadDialog`: `onRegenerated` を受けて view を `editing` → `waiting`（`setView({ kind: "waiting", jobId, startedAt, transientFailures: 0 })`）へ再遷移させる。これにより既存の `waiting` view のポーリングループ（L206-267）が `pending → processing → previewing` を監視し、`previewing` 復帰時に自動で `editing` view へ戻って新しい preview を表示する。**再生成後の体験がモーダル内で完結する**（閉じてキュー画面に委ねる方式は採らない — 編集モーダルの目的と整合しないため）。
  - **非同期性の注意:** `runIngestionJob` 再駆動は dispatch 経由の非同期。`regenerate` usecase 戻り時点ではまだ `pending`。`waiting` view のポーリングが状態反映を担う。
  - **既存パターン踏襲:** `onRegenerate` ハンドラは既存の `onSubmit`/`runDiscard`（`useTransition` の `isPending` で二重押下を抑止し全アクションボタンを `disabled`、try/catch でエラー処理）と同じパターンで実装する。`waiting` 再遷移でモーダル内完結するが、背後の `/upload` 一覧も `previewing → pending` に変わるため `routerInvalidate(router)` を呼んで一覧も更新する（`runDiscard` と同様）。
- **理由:** Issue「#226 モーダルに再生成ボタンを復活させる」。ADR-006 の除外を本 Issue で解消。`waiting` view 再利用は既存機構との整合性が高い（詳細は adr.md ADR-003）。

### 5. UI: `IngestionJobRow` の再生成ボタンの実動作確認（コード変更なし想定）

- **対象ファイル:** `app/components/ingestion/IngestionJobRow.tsx`（L105-115, 163-171）
- **変更内容:** 既に `regenerateIngestionPreviewFn` 配線済み。バックエンド修正後に実際に LLM 再駆動 → `previewing` 復帰、`routerInvalidate` で状態が `pending/processing` に更新されることを確認。
- **理由:** Issue「既存 IngestionJobRow の再生成ボタンの実動作確認」。

### 6. テスト: dispatch の regression guard を反転

- **対象ファイル:** `app/core/application/workers/__tests__/dispatchDomainEvent.test.ts`（L561-570）
- **変更内容:** 「skips ingestion.regenerated」テストを「routes ingestion.regenerated to runIngestionJob and returns handled」に変更（`ingestion.created`/`retryRequested` のテストと同型）。
- **理由:** ADR-004 の除外を覆したことの新しい regression guard。

### 7. テスト: regenerate integration を `pending` 遷移に更新

- **対象ファイル:** `app/core/application/ingestion/__tests__/ingestion.integration.test.ts`（L423-455）
- **変更内容:** `expect(rows[0]?.status).toBe("processing")` → `"pending"`。**テスト名も `returns the job to processing` → `returns the job to pending` に更新**（テスト名に "processing" を含むため）。`regenerationCount` インクリメント・`previewJson` null・`ingestion.regenerated` emit の assertion は維持。limit/invalid-state テストは変更不要。このテストは usecase 単体実行で dispatch を経由しないため最終 status は `pending` が正。
- **理由:** ドメイン遷移変更の反映。

### 8. テスト: entity 単体テスト / property テストの walk ロジックを再構成

- **対象ファイル:** `app/core/domain/ingestion/__tests__/entity.test.ts`（`upToPreviewing` ヘルパー L164-169 / cap ループ L204-225）、`app/core/domain/ingestion/__tests__/entity.property.test.ts`（regenerate サイクル L124-160）
- **変更内容:** `regenerate` の戻り型が `PendingIngestionJob` になるため、現状 `regenerate → attachPreview` を直接連結している箇所が **型エラー＋ロジック破綻**する（`attachPreview` は `ProcessingIngestionJob` を要求, entity.ts L500-512）。単なる status assertion の置換では不足。**`regenerate → startProcessing → attachPreview` の3段に組み替える**（本番フローと同じく pending を `startProcessing` で processing に上げてから preview を attach）。`regenerate` 単体の結果 status assertion は `processing` → `pending` に。**`entity.test.ts` L171 のテスト名 `... transitions to processing` → `... transitions to pending` も更新**（テスト名に "processing" を含むため、ステップ7と同種の漏れを防ぐ）。event type `ingestion.regenerated` の assertion は維持。
- **理由:** ドメイン変更の型安全な伝播。両レビュアーが指摘した必須の構造改修。

### 9. spec 更新

- **対象ファイル:** `spec/usecases/ingestion.md`（L67-73）、`spec/domains/` の ingestion 状態遷移、`spec/testcases/ingestion/index.md`（`#RegenerateIngestionPreview` セクション）
- **変更内容:** 「`job.regenerate` → save → キューに RunIngestionJob を再 enqueue」を「`previewing→pending` に遷移し `ingestion.regenerated` を outbox 発火 → dispatch が `runIngestionJob` にルーティングして再処理」と明確化。状態遷移図に `previewing → pending`（regenerate）エッジが無ければ追加。testcases spec に「pending 遷移 + ingestion.regenerated dispatch → runIngestionJob 再駆動」の期待が記載されているか確認し、乖離があれば同期。
- **理由:** spec を実装の理想形に同期。integration テスト L420 が testcases spec を参照しているため波及確認が必要。

## 設計判断

詳細は `.issue/253/adr.md` を参照。

- **遷移先は `pending`（案 C）** を採用 — retry パターン再利用、`isPending` ガード不変、リスク最小。
- **既存 `ingestion.regenerated` event を流用**（新 event を作らない）。
- **ADR-004（#57）を本 Issue で覆す** — 除外理由（`isPending` no-op）が遷移先変更で消えるため整合的。

## リスクと注意点

- **ADR-004 を覆す:** dispatch の意図的除外を解除。除外理由は遷移先変更で消えるが ADR に明示記録する。
- **#57 ADR-003 の既知の限界:** regenerate も `pending→processing` 後に `LLMRateLimitError` が出ると redelivery が `isPending` で no-op 縮退し `processing` 固着。retry と同じ既存の限界を引き継ぐ（本 Issue で新たに悪化しない、スコープ外）。
- **OCC/version:** usecase は UoW 内で `findById`→`regenerate`→`save(expectedVersion)` の 1 トランザクション。retry と同パターン、新たな OCC リスクなし。
- **冪等性:** `ingestion.regenerated` が at-least-once で複数配信されても、2 回目は `runIngestionJob` 内で job が既に `processing` なら `isPending` で no-op。安全。
- **`MAX_REGENERATIONS = 5` 整合:** 定数は維持。`regenerationCount` 引き継ぎで cap バイパス防止。
- **型の網羅性:** `regenerate` 戻り型を `PendingIngestionJob` に変えると消費箇所の型が変わる。typecheck で確認。
- **UI の再生成後遷移:** preview が消えるため `editing` → `waiting` view へ再遷移し、既存ポーリングで `previewing` 復帰を待つ（ADR-003）。`UploadDialog` の view machine 実装を読んで整合させる。

## テスト方針

- **単体/integration:** `pnpm test:unit` `pnpm test:integration`。dispatch が `runIngestionJob` を呼ぶこと、regenerate が `pending` + `regenerated` emit すること、cap/invalid-state が従来通り弾くこと。
- **型/lint:** `pnpm typecheck && pnpm lint:fix && pnpm format`。
- **手動/ブラウザ:** `/upload` で previewing ジョブの「再生成」ボタン（`IngestionJobRow` とモーダル両方）を押し、`pending→processing→previewing` を辿り新しい preview が付くこと、`regenerationCount` が増えること、上限超過で `regeneration_limit_exceeded` が表示されることを確認。

## レビュー履歴

### 1周目

**修正した点（要修正）**:
- **P-001（両視点）**: ステップ8を「status assertion の置換」から「`regenerate → startProcessing → attachPreview` の3段に walk ロジックを組み替える」に修正。`attachPreview` が `ProcessingIngestionJob` を要求するため、遷移先 `pending` 化で型エラー＋ループ破綻が必至。対象を `entity.test.ts` の cap ループに加え `entity.property.test.ts` の regenerate サイクルも明記。
- **P-002（要件カバレッジ）**: ステップ7に「テスト名 `returns the job to processing` → `returns the job to pending` も更新」を追記。

**取り込んだ改善提案**:
- **S-001（両視点）**: モーダル再生成後の view 遷移を「`waiting` view 再遷移」に確定（ADR-003 新設）。「閉じて処理中表示に戻す」という曖昧表現を排除し、`onRegenerated(jobId)` → `UploadDialog` が `waiting` へ再遷移する具体方針に。
- **S-002（要件カバレッジ）**: ステップ9の spec 更新対象に `spec/testcases/ingestion/index.md#RegenerateIngestionPreview` を追加（integration テストが参照しているため）。
- **S-002/S-003（アーキ）**: ステップ4に再駆動の非同期性（usecase 戻り時点では `pending`、ポーリングが状態反映を担う）を明記。

**見送った提案とその理由**:
- なし（全提案をスコープ内として取り込み）。

### 2周目

両視点とも **問題点ゼロ** で終了。1周目で反映した P-001/P-002/S-001/S-002/S-003 がコードと照合して妥当と確認された。残った軽微な改善提案を取り込んで明確化:

**取り込んだ改善提案**:
- **S-001（要件）/ S-001（アーキ系）**: ステップ8に「`entity.test.ts` L171 のテスト名 `transitions to processing` → `transitions to pending` も更新」を追記（P-002 と同型の漏れ防止）。
- **S-101（アーキ）**: ステップ4に `routerInvalidate(router)` を呼ぶ旨を明記（`waiting` 再遷移でモーダル内完結するが背後の一覧も更新が必要）。
- **S-102（アーキ）**: ステップ4に `useTransition` の `isPending` で二重押下抑止＋全ボタン disabled の既存パターン踏襲を明記。

**見送った提案とその理由**:
- なし（全提案を明確化として取り込み）。
