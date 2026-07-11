# PR #834 レビュー — Use Case 観点

対象: Issue #468（source blob のストレージ衛生）/ ブランチ `issue/468/source-storage-hygiene`
参照: `.issue/468/plan.md` / `.issue/468/adr.md`

### Use Case

#### Blockers

なし

#### Warnings

- **[W-001]** sweep の per-row UoW における fresh ガードは「候補列挙 → per-row UoW」間の遷移しか閉じられず、UoW 内の read → 書き込みフラッシュ間の競合窓は構造的に開いたまま。安全性が「時間的不変条件」に依存しているのにコード上に明文化されていない
  - 場所: `app/core/application/media/sweepAbandonedSourceIntakes.ts:86`（`findById` ガード〜`save`）
  - 理由: `D1UnitOfWorkProvider` は deferred-batch モデルで「Read-your-write within the same UoW is unsupported by design」— read は即時実行、write は `fn` 完了後に一括フラッシュされ、read と write の間にトランザクション分離はない。さらに `D1MediaAssetRepository.save` は OCC トークンなしの blind upsert（`ON CONFLICT DO UPDATE`）。したがって「sweep が `findById` で pending を読む → 並行 commit が attach をフラッシュ → sweep が orphan をフラッシュ」という順序が理論上成立すると、note に束縛済みの source が orphan → purge され `sourceFileId` が宙に浮く（データ喪失）。現実にはこの窓を踏むには「猶予（24h）を超えて pending のままの source 行が、まさにその瞬間に attach される」必要があるが、attach は行を作った同一リクエスト内（数秒）でしか起きないため到達不能 — つまり安全性の根拠は「>grace の pending source を attach するコードパスが存在しない」という時間的・経路的な議論であり、ガードの構造だけでは閉じていない。この到達不能性の根拠が JSDoc に書かれていないため、将来「古い pending source を attach する」経路（例: intake の再開/復元機能）が追加された瞬間に無言で破れる。
  - 提案: `sweepAbandonedSourceIntakes` の JSDoc に「fresh ガードは列挙→UoW 間の遷移のみ防ぐ。UoW 内の窓は『pending source は自リクエスト内でのみ attach される（grace より十分短い）』という不変条件で成立しており、猶予を超えた pending source を attach する経路を新設する場合はこの sweep との整合を再設計すること」を明記する。構造的に閉じたければ、将来的にアダプター側で `UPDATE ... WHERE status='pending'` の条件付き書き込み（affected rows 検査）に置き換える選択肢もあるが、本 PR の範囲では文書化で十分。

- **[W-002]** `uploadMedia` の JSDoc に残る「rowless blob も PurgeOrphans が回収する」という誤った主張が未修正のまま。ADR-002 の「『行なし blob』という不可視状態が構造的に発生しなくなる」という帰結の記述も、この経路を考慮すると過大
  - 場所: `app/core/application/media/uploadMedia.ts:36`（JSDoc「If metadata persistence fails, the orphan R2 object is reclaimed by the `PurgeOrphans` worker on its next sweep」）
  - 理由: `uploadMedia` は UoW の `fn` 内で `objectStorage.put`（即時実行）→ `mediaAssetRepository.save`（バッチに蓄積）の順で動くため、バッチフラッシュが失敗すると **blob はあるが行がない** 状態が image / video / avatar でも発生する。DB 駆動の `purgeOrphans` は行のない blob に到達できないので、この JSDoc の主張は偽。本 PR は plan（調査結果 3）どおり `uploadMediaPresigned` の同種の誤記を実態に合わせて修正した（`uploadMediaPresigned.ts:24` 付近）のに、同じファミリーの `uploadMedia` に残る同型の虚偽記述を見逃している。また `.issue/468/adr.md` ADR-002 の Consequences「『行なし blob』という不可視状態が構造的に発生しなくなる」は commit 経路に限れば真だが、uploadMedia 経路では従来どおり発生しうるため、読み手が「全経路で解消済み」と誤読するリスクがある。挙動修正は Issue スコープ外（#468 は source 限定）で妥当だが、「ドキュメントとしての正確性回復」は本 plan 自身が掲げた目的。
  - 提案: `uploadMedia` の JSDoc を実態（メタデータ永続化失敗時は rowless blob が残り自動回収されない — #452 以来の accepted edge。回収するなら metadata-first 化が必要）に修正し、必要なら image/video 系の metadata-first 化をフォローアップ Issue として起票する。ADR-002 の当該帰結も「commit（source）経路について」と限定を明記する。

#### Notes

- **[N-001]** commit の metadata-first 化は失敗マトリクスが完全に閉じている。(1) 小 UoW save 失敗 → 行も blob もなし、(2) put 失敗（`safeStoragePut` rethrow）→ blob なし pending 行 → sweep → purge（delete 冪等契約で完走。integration テストで実証）、(3) put 成功・main UoW ロールバック → 行 + blob → sweep → purge（`ingestion.integration.test.ts` の E2E で AC-2 を実証、job が `previewing` のまま残り再 commit 可能なことまで assert）、(4) put 後クラッシュ → (3) と同じ。さらに、main UoW の `findById → isPending ガード → markAttached` は D1 UoW が read-your-write 非対応であるにもかかわらず成立する — 行が**別の**小 UoW で先にコミット済みだからであり、metadata-first がアダプター制約と噛み合った良い設計。null / 非 pending への `SystemError(DataIntegrityError)`（`commitIngestionPreview.ts:263` 付近）も「黙って sourceFileId を落とさない」という plan の要求どおり。
- **[N-002]** sweep ユースケースは `purgeOrphans` と正確に同型: 候補列挙は `MediaService.listAbandonedSourceIntakes`（cutoff 計算をドメインサービスに置き、アダプターは status/kind フィルタのみ）、per-row try/catch は CLAUDE.md「worker → root」の唯一許容される broad catch に該当、clock は `container.clock` 経由、イベントは per-row UoW 内で `collectEvents`（ロールバック時は outbox に載らない = トランザクショナル）、`media.orphaned` の重複発火があっても at-least-once 契約内。小 UoW でのイベント非 collect も `uploadMedia` の既存判断と整合し、コメントで根拠が示されている。domain → application のエラー再翻訳もない。
- **[N-003]** plan からの逸脱 3 件（`SourcePersist` を `{ mediaId }` に縮小、per-row 失敗分離テストの unit 移設、prune tick 実DBテストの 2-tick + バックデート方式)はいずれも `.issue/468/adr.md` の「実装時の追加決定」として理由付きで記録されており、判断も妥当。特に `SourcePersist` 縮小は「真実を DB 行に一本化する」という metadata-first の趣旨に沿う改善。
- **[N-004]** `runPruneTick` で sweep / purge が各々 `createRequestContainer(readRequestServerConfig(env))` を作り直すのは一見冗長だが、`readRequestServerConfig` の失敗も per-step try/catch に閉じ込めるための意図的な分離で、`purgeExpiredExports`（#783 ADR-005）のパターンと一貫している。戻り値契約 `{ outboxDeleted, processedEventsDeleted }` も不変で、AC-3（cron 配線）は unit（呼び出し順・失敗 swallow・非阻害）と実DB integration（2-tick 回収チェーン）の両面で裏付けられている。
