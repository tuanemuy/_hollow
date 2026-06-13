# Round 3 バックエンドレビュー — Issue #538 / PR #677

ゼロベースで Backend 担当レイヤー（ポート `countByOwner`/`IngestionJobCountOpts`・d1 adapter・usecase `countActiveIngestionJobs`・server-fn `getIngestionQueueCountFn`）を検証した。受け入れ基準のうち本レイヤーが担う AC-5（バッジ件数取得の application/adapter 経路）は満たされている。ヘキサゴナル＋DDD 規約（依存方向・検証2点・エラー契約・UoW・JSDoc）への違反は見つからなかった。Blocker はなし。

## Backend

### Blockers

- なし

### Warnings

- なし

### Notes

- **[N-001]** JSDoc の付与先がずれている / `app/core/domain/ingestion/ports/ingestionJobRepository.ts:6-44` / `IngestionJobCountOpts`（34行目）を `IngestionJobListOpts`（38行目）の直前に挿入した結果、元々 `IngestionJobListOpts` を説明していたリスト用 JSDoc（6-27行目: `status` / `excludeStatuses` の組み合わせ契約）が `IngestionJobCountOpts` の上に取り残され、肝心の `IngestionJobListOpts` には doc コメントが付かなくなった。診断系には影響しないが、ドキュメントの結合先が壊れている（リスト契約コメントが count 型に係っているように読める）。/ 提案: リスト用 JSDoc ブロック（6-27行目）を `IngestionJobListOpts`（38行目）の直前へ移し、count 用 JSDoc（28-33行目）は `IngestionJobCountOpts` の直前に残す。

- **[N-002]** read-only count を `unitOfWorkProvider.run` で実行している / `app/core/application/ingestion/countActiveIngestionJobs.ts:33` / 単一の read クエリにトランザクション境界を張るのはやや過剰に見えるが、`getIngestionJob` / `getIngestionJobs` など既存の read usecase も同様に `unitOfWorkProvider.run` 経由で repository にアクセスしており、本リポジトリには read 専用 provider が存在しない。確立パターンへの忠実な踏襲であり、是正不要（記録のみ）。/ 提案: なし。

## 良かった点（確認事項）

- ポート契約（空 `statuses` は DB に行かず 0、owner スコープ、multi-include `statuses`）が JSDoc に明文化され、d1 実装（`ingestionJobRepository.ts:413-428` の早期 return ＋ `inArray` ＋ `mapDbError` 包含）と完全に一致。
- adapter は `mapDbError` で driver エラーを共有契約へ翻訳しており、adapter → application のエラー契約を遵守。
- usecase は「active = pending/processing/previewing、failed 除外」の業務的 status 集合を定数＋JSDoc として application 層に閉じ込めており、presentation へ漏らしていない（ADR-003 どおり）。
- server-fn `getIngestionQueueCountFn` は input-less GET（`getEffectiveIngestionPromptsFn` と同型）＋ `requireCurrentUser` ＋ `errorResponseMiddleware` で、transport 境界の検証2点ポリシーに整合（入力なしのため `inputValidator` 不要）。actorUserId はセッション由来で外部入力を素通ししていない。
- テストカバレッジが厚い: usecase integration（status 集合・owner 越境不可・0 件）と d1 integration（IN フィルタ・owner スコープ・空 statuses 非クエリ・無マッチ 0）の両方で、ポート契約の各分岐を網羅。
