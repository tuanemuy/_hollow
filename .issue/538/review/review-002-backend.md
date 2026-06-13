# PR #677 レビュー（Round 2・ゼロベース）— Backend

対象レイヤー: ポート `countByOwner` / `IngestionJobCountOpts`、d1 adapter、usecase `countActiveIngestionJobs`、server-fn `getIngestionQueueCountFn`。

## Backend

### Blockers

- なし

### Warnings

- **[W-001]** `count(*)` の戻り値型を未検証の `sql<number>` キャストで断言している / 場所: `app/core/adapters/d1/repositories/ingestionJobRepository.ts:417` / 理由: 本リポジトリの他の全 count 系（`noteRepository` / `userRepository` / `shareLinkRepository` / `publicationStateRepository`）は Drizzle の `count()` ヘルパーを使っており、これは適切に number 型を返す確立パターン。新規 `countByOwner` だけが生の `` sql<number>`count(*)` `` を使っている。これは型アサーションであり、ドライバが集約値を文字列で返した場合 `rows[0]?.total` は文字列のまま number として通過し、`{ count }` 以降を汚染する。**同じファイルの直下** `sumByteSizeByOwnerSince`（446–449 行）は `SUM()` の戻り値に対し `typeof raw === "string"` を明示的にハンドリングしており、D1 が数値集約を文字列で返し得ることをこのコード自身が前提にしている。統合テストが `toBe(3)` で通るのは Miniflare の D1 が number を返すためで、本番 D1 の挙動を保証しない。提案: 確立パターンに合わせ `import { count } from "drizzle-orm"` して `.select({ total: count() })` に置き換える（最も低リスク）。やむを得ず生 SQL を保つ場合は `sumByteSizeByOwnerSince` と同様に string→number の防御的変換を入れる。

### Notes

- **[N-001]** ポート JSDoc（`ingestionJobRepository.ts:69-86`）が read-only / write-intent なし契約、`statuses` 複数包含 vs `findByOwner` の `status`/`excludeStatuses` 語彙差の理由、空配列で DB に触れず 0 を返す契約まで明記されており、plan ステップ1・ADR-003 の要求を満たしている。ただし 28 行目の `IngestionJobCountOpts` 用 JSDoc が、直前の `IngestionJobListOpts` 用 JSDoc ブロック（6–27 行）の**直後に連続**しており、6–27 のブロックが宙に浮いている（型宣言の直前に来ていない）。動作・型に影響はないが、JSDoc と対象型の対応が読み取りづらい。
- **[N-002]** usecase `countActiveIngestionJobs.ts` は `ACTIVE_INGESTION_STATUSES` を usecase 内定数に閉じ込め、`failed` 除外理由を JSDoc に明記（ADR-003 準拠）。`UserId.create` による VO 境界検証、`unitOfWorkProvider.run` 経由の read アクセスも既存 read usecase と整合。presentation に status 集合が漏れていない点も良い。
- **[N-003]** server-fn `getIngestionQueueCountFn`（`actions.ts:164`）は input-less GET で `inputValidator` を意図的に省略し、その根拠（`getEffectiveIngestionPromptsFn` / `getDirectoryTreeFn` と同じ確立パターン、actor はサーバ側 `requireCurrentUser` で解決）をコメントに記している。入力検証 2 点ルールに反しない（外部入力なし）。エラーは `errorResponseMiddleware` で構造的にシリアライズされる契約も踏襲。
- **[N-004]** 統合テスト（usecase / adapter とも実 D1）が status IN フィルタ・owner スコープ越境不可・空 statuses・0 件をカバーし、ADR-005 の「フェイクを追加せず実 D1 で検証」の方針どおり。owner 越境を数えないテストが両層にある点は良い。なお adapter の「空 statuses で DB に触れない」テスト（114 行）は戻り値 0 のみ検証で、DB スキップ自体（クエリ未発行）はアサートしていない。契約の本質は「0 を返す」ことなので許容範囲だが、スキップ保証まで担保したいなら spy で確認の余地あり（任意）。
- **[N-005]** ADR-006（Review 001 対応の invalidate 分離）は presentation 寄りの判断だが、backend 契約（enqueue 成功＝結果確定）と整合しており、usecase / adapter 側に影響なし。
