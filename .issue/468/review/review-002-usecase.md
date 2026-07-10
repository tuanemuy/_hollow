# Review 002 — Use Case（アプリケーション層）

- 対象: PR #834（Issue #468: source blob のストレージ衛生）
- 観点: metadata-first フローの失敗パス網羅 / sweep の冪等性・per-row tolerance・fresh ガード / UoW・outbox・イベント規約 / エラー翻訳規約 / broad try/catch の妥当性
- 実施日: 2026-07-11（ゼロベースのフルレビュー）

検証した受け入れ基準（Use Case レイヤー関連）:

| AC | 判定 | 根拠 |
|---|---|---|
| AC-2（put 成功・UoW ロールバック後の自動回収） | 充足 | `commitIngestionPreview` の metadata-first 化 + `ingestion.integration.test.ts` のロールバック → sweep → purge E2E、put 失敗 → blobless 行回収の両テスト |
| AC-3（cron 配線） | 充足 | `runPruneTick` に sweep → purgeOrphans を独立 best-effort try/catch で配線。pruner cron（`0 3 * * *`）は既存。`purgeOrphans` 未配線の乖離も解消 |
| AC-4（猶予内の誤回収防止） | 充足 | strict `<` cutoff（domain unit / D1 integration / app integration の3層）+ per-row fresh `findById` ガード（unit の変異注入で検証） |
| AC-5（既存フロー無退行） | 充足 | commit 正常系・overwrite・temp delete の既存テスト維持、tick 戻り値契約不変、`runPruneTick.test.ts` で他ステップ非阻害を検証 |

## Use Case

### Blockers

なし

### Warnings

- **[W-001]** sweep の並行安全性論証（JSDoc の不変条件）に穴がある — `reconcileRefs` 経由で猶予超過の `pending(kind='source')` を attach できる経路が実在する
  - 場所: `app/core/application/media/sweepAbandonedSourceIntakes.ts:22`（JSDoc「This is safe today because no code path attaches a pending source past the grace window: attach happens only inside the commit request that created the row」）
  - 理由: この主張は厳密には成立していない。`MediaService.reconcileRefs`（`app/core/domain/media/service.ts:44-54`）は `orphan` / `deleting` のみを拒否し、**pending は kind・経過時間を問わず `incrementRef` で attached に遷移させる**。呼び出し元は `saveNote` / `createNote` / `restoreNoteRevision` / `duplicateNote` / `attachMediaToNote` と多数あり、mediaRefs はユーザーが制御するノート HTML から抽出される。さらに `listMediaByOwner`（`app/core/application/media/listMediaByOwner.ts:34`）は status / kind でフィルタしないため、放棄された pending/source 行の id は owner 本人に露出しており「id を知り得ない」という前提も立たない。したがって「猶予超過の pending/source を attach する経路は存在しない」ではなく「sweep の fresh 読み → batch flush の残余窓（deferred-batch UoW、OCC なし upsert）に attach がコミットした場合、attached 行が orphan で上書きされ、24h 後に生きたノート参照の blob が purge される」が正確な残余リスク。実際の発生確率は極小（日次 tick × ミリ秒窓 × 故意の埋め込み操作が必要）だが、安全性の根拠として書かれた不変条件が偽である点は、将来この JSDoc を信頼して経路を追加する開発者を誤導する。
  - 提案: いずれかを実施する。(a) 最小: JSDoc の論証を実態に合わせて修正する（「commit リクエスト内の attach のみ」ではなく「reconcileRefs 経由の attach は可能だが、損害には fresh 読み → flush の残余窓との一致が必要で、確率は無視できる」と記述し、`.issue/468/adr.md` にも残余として追記）。(b) 構造的: `reconcileRefs` の added パスで `kind === 'source'` かつ pending の資産を orphan / deleting 同様に `IllegalTransition` で拒否する — source の pending は commit 内部の transient であり、ノート本文の mediaRefs から参照される正当なユースケースが存在しないため、これで JSDoc の不変条件が型・実行時の両面で真になり、`listMediaByOwner` の露出も無害化される。(b) はドメイン変更を伴うため別コミット / 別 Issue でもよいが、少なくとも (a) は本 PR 内で行うべき。
  - → JSDoc 正確化のみ本PRで対応、構造的封鎖は別Issue（adr.md 参照）

### Notes

- **[N-001]** metadata-first フローの失敗パス網羅が優れている。①main UoW ロールバック（pending 行 + blob 残存 → sweep → purge 完走、temp 保全・job 不変・再 commit 可能性まで assert）、②put 失敗（blobless pending 行 → delete 冪等性契約による purge 完走 — `ObjectStorage.delete` のポート契約補強と対）、③クラッシュ相当は②と同型でカバー、④tick 実 DB 経路（container → adapter seam の 2-tick 検証）。temp 欠損 skip 判定を行 insert より前に済ませて stray 行を作らない点、`SourcePersist` を `{ mediaId }` に縮小して真実を DB 行に一本化した点も計画・ADR どおり。
- **[N-002]** `commitIngestionPreview` main UoW の `findById → isPending ガード → markAttached` で null / 非 pending を `SystemError(DataIntegrityError)` で fail-loud にしたのは正しい（黙って `sourceFileId` を落とさない）。commit 成功後の再 commit は job の `InvalidStateForCommit` が先に立ち、二重 commit は job OCC で敗者がロールバックして残骸が sweep に乗るため、このガードが正常運用で発火する経路はないことを確認した。
- **[N-003]** sweep のオーケストレーションは `purgeOrphans` と正確に同型: 候補列挙（cutoff 計算はドメインサービス側）→ per-row UoW（fresh ガード → `decrementRef` → save + collectEvents）→ per-row try/catch でログ + failed 計上。broad catch は worker の per-row tolerance と `runPruneTick` の step-level swallow のみで、CLAUDE.md の「worker → root」規約の範囲内。エラー翻訳も規約どおり（`safeStoragePut` のポートエラー → `SystemError` 翻訳は adapter → application 相当の境界、domain エラーの再翻訳なし）。
- **[N-004]** イベント規約の遵守を確認: 小 UoW の pending 行はイベント collect なし（`uploadMedia` / `uploadMediaPresigned` と同型・意図コメントあり）、sweep の `media.orphaned` は同一 UoW 内 collectEvents による transactional outbox 経由で、行遷移と原子的。`dispatchDomainEvent` は `media.*` を skip するため consumer 影響なしという計画の前提も現行コードで成立している。orphan 化の `updatedAt` 再スタンプ + strict `<` により同一 tick 内で sweep → purge が連鎖しない（二重猶予）ことも tick の配線順（sweep 先行）と整合。
- **[N-005]** クエリレベル冪等性（orphan 化済み行は候補クエリに載らない）を integration で、候補列挙後の遷移（attached 化 / 消失）と per-row 失敗分離を unit の変異注入で検証する分担は、実 DB で作為なしに再現できない挙動の検証手段として適切（`purgeOrphans` の既存テスト分担とも整合）。
- **[N-006]** `uploadMedia` / `uploadMediaPresigned` の JSDoc を実態（bytes-first 経路の行なし blob は回収不能、pending の非回収は source 限定 sweep の対象外）に正した点は、誤った回収保証の主張を除去する良い修正。既知の見送り（purge スループット上限・malformed 行の listing 耐性）は adr.md に記録済みのため本レビューでは再指摘しない。
