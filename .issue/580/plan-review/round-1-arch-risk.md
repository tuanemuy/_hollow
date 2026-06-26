# Plan Review — Issue #580 (Round 1)

**視点:** あるべきアーキテクチャとの整合性・実現可能性・リスク
**対象:** `.issue/580/plan.md` / `.issue/580/adr.md`
**レビュー日:** 2026-06-26

---

## 結論（サマリー）

非同期ジョブ化の全体方針（ADR-001/002/003/005）は、export/ingestion が確立した「判別共用体ジョブ + 進捗VO + 専用テーブル(OCC) + outbox→relay→consumer→runner + polling」パターンに正しく載っており、レイヤー内側→外側の依存順・スコープ判断も妥当。実コードと突き合わせた結果、**配線の現実認識に2点の誤り**と、**ジョブ実行の正しさ/回復性に関わる2点の要修正**を検出した。いずれも方針転換ではなく、実装ステップの精緻化で解消できる。

---

## 問題点（要修正）

#### 問題点

- **[P-001]** ページングと逐次ミューテーションの併用で、source タグを持つノートをスキップする恐れ（データ欠落）
  - 理由: 現行 `mergeTags.ts` の `collectNotesWithTag` は「**先に全件を読み切ってから**」第2ループで `replaceTags`+delete を実行しており、ミューテーション中に offset がずれる古典的バグを回避している。一方 plan.md 設計セクション（行85）/ステップ5は「ページ単位でノートを取得し `replaceTags`+save+`recordProgress` を独立 UoW でコミット」＝**取得→変更→次ページ取得（offset 加算）を交互に**回す書き方になっている。`findByOwner(tagIds:[source])` は変更後のノートが結果集合から外れるため、ページ1を処理して offset を 500 進めると、繰り上がってきたノート群がスキップされる。結果、一部ノートが source タグを保持したまま統合先へ移らず、`complete` 後に source タグだけ delete される → 参照不整合（AC-5 違反）。
  - 提案: 進捗を逐次永続化しつつスキップを防ぐため、(a) 先に **対象 NoteId 一覧を読み切って**（read-only、メモリ上の ID 配列）から固定リストをバッチ分割して各バッチを独立 UoW で処理する、または (b) 毎回 `offset=0, limit=500` で「まだ source を持つノート」を drain する（処理済みは結果から落ちる）方式にする。いずれにせよ「offset を加算しながら同時にミューテーションする」パターンは明示的に禁止と plan に書く。

- **[P-002]** crash 中断ジョブの回復性 — export の `isProcessing` スキップを踏襲すると、部分統合のまま永久に `processing` で固着し、回復導線が無い（場合により塞がれる）
  - 理由: plan は冪等性を「consumer の `processed_events` + `isProcessing` ガード（crash 後の再 dispatch は途中状態を見てスキップ）」で担保するとし（行87/219）、これは `runExportJob` を踏襲している。しかし export と異なりタグ統合は**途中で実データを変更（ノートを target へ移動済み）してコミットする**。worker が `processing` 中にクラッシュすると、再 dispatch は `isProcessing` で**スキップ**され、ジョブは `processing` のまま固着 → 一部ノートだけ移動済み・source タグは未削除・バナーは永久に「統合中」。さらに plan が任意とする「同 source の active ジョブがあれば `BusinessRuleError`」（行82）を実装すると、固着ジョブが残っている限り**ユーザーの再統合（唯一の回復導線、行32）まで塞がれる**。export では「キャンセル/再実行/期限切れ」で回収できるが、本Issueはそれらを scope 外にしている（行32）ため回収不能。AC-5（統合完了でソース消滅）/AC-6（失敗で楽観状態を壊さない）のいずれにも該当しない宙吊り状態になる。
  - 提案: タグ統合の runner は `replaceTags` が「既に target を持つノートに対し no-op（eventDrafts 空）」となるため**自然に冪等で再実行可能**。export のように `processing` を見てスキップするのではなく、`processing` から**再開（残りの source 保持ノートを処理 → source delete → complete）できる**設計にすることを推奨（これはタグ統合特有の利点で、export より優れた回復性を低コストで得られる）。併せて、active ジョブ重複抑止を入れる場合も「失効/固着ジョブは新ジョブで supersede 可能」にし、回復導線を塞がないこと。どちらの方針を採るかを ADR に明記。

---

## 改善提案（検討推奨）

- **[S-001]** イベントデコーダ登録（ステップ7）は不要。relay はイベントを復号しない
  - 理由: 実コードを確認した結果、`relay.ts`/`runRelayTick` は outbox 行を `EVENTS_QUEUE.sendBatch` で**生の `DomainEvent` のまま転送**しており、`*EventDecoders` を一切呼ばない。デコーダ（`tagEventDecoders` 等）は `dispatchDomainEvent` 内の**activity-log 投影ハンドラ専用**で、ジョブ runner 経路（`export.job.requested`）はデコーダを使わず `payload as {exportJobId}` をキャストして VO ファクトリで構築しているだけ。よって `tag.merge.requested` のために `tag/eventDecoders.ts` に登録する作業は**余剰**で、plan の「relay がイベントを復号する箇所」という前提は誤り。加えて `DomainEvent` は `DomainEventBase` の構造的別名で**閉じた union ではない**ため、中央レジストリへの型登録も不要。
  - 提案: ステップ7はデコーダ登録を落とし、`dispatchDomainEvent` に `case "tag.merge.requested": const jobId = TagMergeJobId.create(payload.jobId); await runTagMergeJob(...)` の一行追加のみとする（既存 export ケースと同形）。

- **[S-002]** 「determinate 進捗を export から踏襲」は実態と異なる。export の逐次進捗は実質デッドコード
  - 理由: `runExportJob` は `startProcessing(found, 0, now)` で **total=0 を seed したまま `recordProgress` を一度も呼ばず** `assembleAndComplete` へ進む（precise count 再記録の JSDoc はあるが実装されていない）。`ExportJobDetailView` の determinate バー分岐は `total>0` 条件で、export では `処理待ち`（`showProcessingPending`）にしか入らない。つまり**export の n/total 逐次更新は実運用上動いていない**。タグ統合は本Issueで初めて「本物の incremental n/total」を駆動することになる。
  - 提案: plan の「踏襲」表現を改め、「`ExportJob` のエンティティ API（`recordProgress` は実在し VO もある）を**初めて実際に駆動する**新規挙動」と明記。`ProgressBar`/`role="progressbar"` の determinate 経路は export で実走していないため、フロントは end-to-end（ローダ→ポーリング→幅%反映）を新規に検証する前提でテスト方針に含めること。

- **[S-003]** 進捗の `processed` は「変更したノート」ではなく「検査したノート」で数える
  - 理由: `mergeTags` は `eventDrafts.length === 0`（既に target を持つ等の no-op）を `continue` でスキップし `affectedIds` に積まない。total を「source を持つノート総数」で seed し、processed を「変更したノート数」だけで数えると、no-op ノートがある分だけ processed が total に到達せずバーが 100% 手前で停滞する（AC-2/AC-4 の体感を損なう）。
  - 提案: `recordProgress` には「検査済みノート件数」を渡し、`affectedNoteIds`（実際に変更した集合）とは別カウンタにする。

- **[S-004]** spec ドキュメントの同期がステップに無い
  - 理由: `spec/usecases/tag.md` / `spec/domains/tag.md` は MergeTags を**同期処理**として記述（plan 調査結果 行44 も認識）。plan はデザインモック更新（ステップ12）は持つが、これら spec の更新を含んでいない。本リポジトリは spec を SSOT として同期する規律（spec-sync）があり、非同期ジョブ化はドメイン/ユースケースの記述を確実に陳腐化させる。
  - 提案: `TagMergeJob` アグリゲート追加・MergeTags の非同期化を `spec/domains/tag.md` / `spec/usecases/tag.md` に反映する作業をステップに追加。

- **[S-005]** 複数同時統合時のバナー多重性が未決
  - 理由: `listActiveTagMergeJobs(ownerId)` は配列を返すが、Issue は「進捗バナー」を単数で要求。plan はリスクとして列挙（行216）するが UI 仕様としては未決のまま。ステップ10/11 の実装前に「単一集約バナー or 複数スタック」を決めないと手戻りが出る。
  - 提案: ADR もしくは plan の UI セクションで多重時の挙動（最新1件のみ表示／件数集約／スタック）を確定させる。モック更新（ステップ12）と整合させること。

---

## 良い点

- **内側→外側の依存順が正しい。** ステップ1（VO）→2（エンティティ/イベント/ポート）→3-4（スキーマ/リポジトリ/UoW）→5-6（runner/enqueue/クエリ）→7-8（dispatch/DI）→9-12（presentation/モック）→13（テスト）と、ドメインから presentation へ依存方向どおりに並んでいる。ジョブ・進捗のドメインロジックは判別共用体エンティティ＋VO に閉じ、集合演算 `mergeTagSets` をユースケース純関数に置く判断（ADR-003）はレイヤー漏れを避けており妥当。
- **#607 楽観削除との衝突を正しく特定・解消（ADR-005）。** `TagList.onMerge` が `applyOptimistic({type:"remove"})` を enqueue 同期で打つ実コードを確認。非同期化すると失敗時にタグが消えたまま不整合になるため、完了駆動へ変える ADR-005 は**必須かつ的確**。`useOptimistic` 構造を壊さない方針も妥当。
- **`EVENTS_QUEUE` 再利用（ADR-001）が実コードで裏付けられている。** `RelayEnv.EVENTS_QUEUE: Queue<DomainEvent>` でキューは汎用 `DomainEvent` を運ぶため、新イベント型は既存キューに相乗りでき `wrangler.toml` 変更不要、という判断は正しい。
- **total 算出の実現可能性が担保されている。** `NoteRepository.countByOwner(ownerId, { tagIds })` が実在し、`startProcessing(total)` への投入が現実に可能。
- **スコープ判断が堅実。** ジョブ履歴 UI（P15/P16 相当）・SSE・cancel/retry UI を明示的に scope 外にし、Issue 要件（P18 上の determinate バナー）に集中している。理想形（共通ジョブ抽象化）を追わず「踏襲に留める」判断（ADR-003 Consequences）も過剰設計を避けていて良い。
- **polling 機構の先行事例が実在し再利用可能。** `ExportJobDetailView` の `POLL_INTERVAL_MS` + `routerInvalidate(router)` + `document.visibilityState` ガード + active 中のみ interval、という構造は確立済みで、そのまま踏襲できる（ADR-002 は妥当）。

---

## 補足分析: マイグレーション/配線の現実確認

- **マイグレーション番号:** `migrations/` 最新は `0020_llm_call_log.sql`。`0021_tag_merge_jobs.sql` は空きで衝突なし（plan 行45 の認識どおり）。手書き連番 SQL で drizzle journal 依存は無く、番号衝突リスクは低い。
- **UoW 配線:** `UnitOfWorkContext`（`execution/unitOfWork.ts`）に `exportJobRepository` 等が並んでおり、`tagMergeJobRepository` を1行追加 → D1 実装に注入すれば consumer/request 両コンテナが `unitOfWorkProvider.run` 経由で取得できる（plan ステップ4/8 の認識は正しい）。
- **consumer 二重実行境界:** `handleQueue` は post-dispatch スタンプ（`markProcessed`）で、crash 時は redelivery が再 dispatch に入る。runner 側の冪等ガードが効くことが前提 → P-002 の「processing 固着」はこの境界の盲点なので要対応。
