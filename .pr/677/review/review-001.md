# PR Review #001 — feat(ingestion): アップロード導線を「投げっぱなし＋キューで編集・保存」に再設計

**PR:** #677
**Date:** 2026-06-13
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 2（いずれも ADR 明記済みの意図的トレードオフ）
- Notes: 12
- Verdict: **APPROVED**（条件: W-001/W-002 は設計判断として許容。厳密整合が要件なら任意改修）

---

## Backend

### Blockers
なし

### Warnings
なし

### Notes
- **[N-001]** 新ポート `countByOwner` のシグネチャ・配置はレイヤー規約に完全準拠。`IngestionJobCountOpts` は `readonly IngestionStatus[]` の `statuses`、read-only であることを JSDoc 明示、空配列は「0、DB を叩かない」とポート契約で規定。
  - 場所: `app/core/domain/ingestion/ports/ingestionJobRepository.ts:86`, 型 `:12-14`
- **[N-002]** `countActiveIngestionJobs` は既存 read-only usecase と同一 UoW パターン。owner スコープは `UserId.create(input.actorUserId)` で構造的に絞られ他人のジョブをカウント不能。`ACTIVE_INGESTION_STATUSES = [pending, processing, previewing]` は PR 説明と一致、`failed` 除外理由も JSDoc に記録。
  - 場所: `app/core/application/ingestion/countActiveIngestionJobs.ts:33-38`
- **[N-003]** D1 adapter の `countByOwner` は drizzle `count()` + `eq(ownerId)` + `inArray(status, ...)` でパラメータバインド（インジェクションなし）。空配列短絡、`mapDbError` 変換、`noteRepository.countByOwner` と同型。
  - 場所: `app/core/adapters/d1/repositories/ingestionJobRepository.ts:413-428`
- **[N-004]** server-fn `getIngestionQueueCountFn` は input-less GET で actor をサーバー側解決（`requireCurrentUser`）。`inputValidator` 省略は既存パターンと一致。
  - 場所: `app/components/ingestion/actions.ts:164-176`
- **[N-005]** usecase / adapter 両層のテストカバレッジ十分。`pnpm typecheck` クリーンパス。

---

## Frontend

### Blockers
なし

### Warnings
なし

### Notes
- **[N-001]** 編集ダイアログは preview 行のローカル state でマウントされるため、クロスタブ commit/discard でジョブがリストから外れると未保存編集が消える。plan S-001 / ADR-001 で許容済みの既知挙動。同一タブ操作では発生しない。
  - 場所: `app/components/ingestion/IngestionJobRow.tsx:313-319`
- **[N-002]** バッジ件数を CTA の `aria-label` に載せるため、連続更新時に一部 SR がフォーカス中要素のラベルを再アナウンスする可能性。更新頻度低く実害小。
  - 場所: `UploadButton.tsx:40`, `IngestionQueueBadge.tsx:79`
- **[N-003]** `Dialog` は `!open` で `null` 返却・子アンマウントするため再オープン時にフォーム state リセット。`closeOnBackdropClick` off との整合あり、意図的な割り切りとして妥当。
  - 場所: `IngestionJobEditDialog.tsx:53-71`, `IngestionPreviewForm.tsx:155-164`

確認した堅牢性: `UploadDialog` の `cancelledRef` ガードが全 post-await `setView` に張られ stale closure 書き込みを防止。`IngestionQueueBadge` の `seq` 単調カウンタで out-of-order レスポンスを破棄、`visibilitychange`/購読の cleanup 漏れなし、fetch 失敗時は前回値保持。`queueBadgeBus` は unsubscribe + test reset でリーク対策。Styling は utility-first・`data-*`・トークン遵守。a11y は `role="status" aria-live="polite"`、フォーカス移譲、`uploading` 中 `closable=false` まで一貫。テスト全 PASS。

---

## Test

### Blockers
なし

### Warnings
なし

### Notes
- **[N-001]** `UploadDialog.test.tsx` の 1299 行削除は妥当。削除 33 ケースを merge-base `cafc2864` と全列挙照合した結果、消えたのは `waiting`/`editing`/`committed`/`failed`/`timedOut` ビュー・180秒タイムアウト・poll 失敗フォールバック等、実装ごと削除された経路のみ。残すべき select/uploading/queued は新テストに移管・網羅。カバレッジ後退なし。
- **[N-002]** バッジテストはエラー非表示・transient 失敗時の前回値保持・stale response の seq ガード・unmount 後の無反応・hidden 時非 refetch・99+ キャップを実装と一致して検証。`resetIngestionQueueBusForTest()` を afterEach で実行。
- **[N-003]** flaky リスク低。削除されたポーリング経路ごとタイマー依存消滅。残る `requestAnimationFrame` は `act` ラップ済み、非同期は手制御 deferred で決定論的駆動。
- **[N-004]** `countByOwner` / `countActiveIngestionJobs` の integration は status フィルタ集合・owner スコープ・空配列短絡・0件境界を両層で検証。
- **[N-005]** 過剰モック/実装 details 依存なし。EditDialog の discard/regenerate が `invalidateMock` を assert するのは「二重 invalidate しない」設計契約の regression guard として正当。
- 実走: `pnpm test:unit`（3681 件）/ `pnpm test:integration`（675 件）すべて green。

---

## Cross-cutting

### Blockers
なし

認可・整合性・パフォーマンスの主要観点を確認した結果、ブロッカー級欠陥なし。`countByOwner` は `idx_ij_owner_status (owner_id, status, updated_at DESC)` でカバーされ `count(*)` 1クエリ・N+1 なし（`schema.ts:528`）。owner 越境は integration テストで実証。`seq` ガードで連続操作時の件数固着なし。

### Warnings
- **[W-001]** バッジはサーバー側状態遷移（processing→previewing 等）を放置タブで拾えない。更新点は (1)マウント (2)visibilitychange visible (3)`notifyIngestionQueueChanged()`（操作起点のみ）の3つ。`/upload` の `IngestionQueue` は 4s/16s でジョブ一覧をポーリングするが状態遷移検知時に notify を呼ばないため、`/upload` 滞在中でもバッジがキューと乖離し続ける。**ADR-002 で許容済み**・spec P13（操作後＋画面復帰時に更新）と一致のため後退ではない。
  - 場所: `app/components/ingestion/IngestionQueueBadge.tsx:25-56`, `IngestionQueue.tsx`
  - 提案（任意）: `IngestionQueue` のポーリング tick が active 件数減少を検知したら `notifyIngestionQueueChanged()` を1行発火 → `/upload` 滞在中はバッジとキューが収束。
- **[W-002]** バッジはタブ間で同期しない（`BroadcastChannel` 不使用、`queueBadgeBus` はモジュールスコープ）。別タブの操作は visibilitychange 復帰まで反映されない。**ADR-001/ADR-002 で許容済み**。
  - 場所: `app/components/ingestion/queueBadgeBus.ts:14`
  - 提案（任意）: 厳密なタブ間整合が要件なら `BroadcastChannel("ingestion-queue")` で notify をブロードキャスト。

### Notes
- **[N-001]** visibilitychange に debounce なし。タブ復帰時は基本1発・`seq` ガードで競合無害・`count(*)` 軽量のため実害小。
- **[N-002]** マルチファイルアップロード送信途中でダイアログを閉じると `cancelledRef` early return でループ後の `notifyIngestionQueueChanged()`（`UploadDialog.tsx:255`）に未到達。visibilitychange/次操作で収束、ADR 許容範囲。
- **[N-003]** 仕様・ADR 整合良好。ADR-002/003/004、spec `pages/index.md` P13、PR 説明の「常時ポーリングなし」「visible 復帰時再取得」いずれも実装と一致。
- **[N-004]** 回帰なし。`#upload` ハッシュ開閉、カスタムプロンプト（16 KiB DoS ガード維持）、既存行アクション（全 notify 発火）、OCC（version 一致）すべて従来通り。

---

## Design Decisions

W-001 / W-002 はいずれも `.issue/538/adr.md`（ADR-001 / ADR-002）で「バッジは概数・eventual consistency、操作起点＋画面復帰時に収束」という設計判断として明示的に意思決定済み。本レビューで新たな ADR 追記は不要。厳密なリアルタイム整合・タブ間同期を要件に追加する場合のみ、上記の任意改修（poll→notify 1行 / BroadcastChannel）を検討する。
