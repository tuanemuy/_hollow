# ADR — Issue #580: タグ統合のバックグラウンド進捗バナー（非同期化前提）

## ADR-001: タグ統合を非同期ジョブ化する

### Status
Proposed

### Context

`mergeTags`（`app/core/application/tag/mergeTags.ts`）は現状 UnitOfWork 内の同期処理で、`MergeTagDialog` の進捗は `useTransition` pending を映す indeterminate のみ。Issue は **determinate（実 n/total）進捗バナー**を要求する。選択肢:

- **案A: 同期のまま進捗を出す。** 単一サーバ関数呼び出しの中で進捗を返す手段は (1) レスポンスをストリーミングして部分進捗を流す、(2) 進捗を別テーブルに書きながら処理し別経路で読む、のいずれか。(1) は SSE/streaming の新規導入が必要で TanStack Start のサーバ関数モデルから外れる。(2) は結局「進捗永続化」が要り、しかも同期リクエストが処理時間ぶんブロックし続ける（大量ノートでリクエストタイムアウト・UX 劣化）。determinate のためだけに同期を維持する利点が薄い。
- **案B: 既存ジョブ基盤へ載せて非同期化。** export / ingestion が確立した「判別共用体ジョブ + 進捗 VO + 専用テーブル(OCC) + outbox イベント → relay → consumer → runner」パターンに `TagMergeJob` を載せる。進捗はジョブ行に逐次永続化され、フロントはジョブ行を読むだけ。

### Decision

**案B（非同期ジョブ化）を採用。** determinate 進捗は「変異リクエストとは独立に読める永続進捗状態」を本質的に要求し、それを供給する基盤（export/ingestion）が既に存在する。タグ統合をその確立パターンに載せるのが最小リスク・最大整合。新規 Queue は不要で、既存 `EVENTS_QUEUE`（`hollow-local-events`）と `dispatchDomainEvent` のディスパッチ表に `tag.merge.requested` を一行足すだけで配線が完結する。

### Consequences

- 良い点: export/ingestion と構造・命名・進捗供給が揃い、認知負荷が低い。大規模統合でもリクエストをブロックせず、worker 側で複数 UoW 境界に分割でき crash 耐性も同等。進捗永続化が determinate バナーを自然に満たす。
- トレードオフ: 新テーブル `tag_merge_jobs` + マイグレーション、`UnitOfWorkContext`/`dispatchDomainEvent` への追記、UI フローの作り替え（楽観削除の整合 = ADR-005）が必要。同期版より初期コストは高いが、Issue が要求する determinate 進捗のためには不可避。

---

## ADR-002: 進捗供給は polling（SSE ではない）

### Status
Proposed

### Context

進捗をフロントへ供給する方式として **polling** と **SSE** が候補。Issue も「ポーリング or SSE」と明記し設計判断を求めている。

- 既存先行事例 = エクスポートジョブ（`app/components/export/ExportJobDetail/index.tsx`）は **polling**。`POLL_INTERVAL_MS = 3000` で `routerInvalidate(router)` を呼びローダを再取得、ジョブ行の `progress.processed/total` を再描画する。`document.visibilityState` で非表示タブの無駄打ちを抑止し、active（pending/processing）の間だけポーリングする。
- コードベースに SSE / WebSocket の実装は**存在しない**。Cloudflare Workers 上で SSE を張ると持続接続・durable な接続管理が要り、新規インフラ・運用負荷が増える。

### Decision

**polling を採用し、エクスポートの機構をそのまま踏襲する。** active 中のみ interval ポーリング + `document.visibilityState` ガード。タグ統合は `MergeTagDialog` が enqueue で受領した job id を保持し、`getTagMergeJobFn({ jobId })` で**自ジョブのみ**を polling する（オーナー単位の active ジョブ一覧取得は不要 = ADR-004）。完了時に `routerInvalidate(router)` で一覧を再取得し、消えたソースタグを反映する。

### Consequences

- 良い点: 既存パターンに完全準拠（CLAUDE.md「確立されたパターンを最大限踏襲」）。専用伝送路・サーバ常駐接続が不要で Workers と相性が良い。`routerInvalidate`/`ProgressBar` 等の既存部品を再利用できる。
- トレードオフ: 数秒の更新遅延と定期リクエストのコスト。タグ統合は通常短時間で完了するため許容範囲。リアルタイム性が要る将来要件が出れば再評価。

---

## ADR-003: `TagMergeJob` を export 同形の判別共用体アグリゲートとしてタグドメイン配下に新設

### Status
Proposed

### Context

「ジョブ・進捗」という概念をどう表すか。選択肢:

- **案A: 既存 `Tag` エンティティに統合状態を持たせる。** タグ行に merge 状態列を足す。だが統合は source/target 2タグにまたがる別ライフサイクルで、タグ集約の不変条件と無関係。集約責務が肥大化し不整合。
- **案B: フラットな status enum + 進捗フィールドの単純レコード。** 不正状態（completed なのに progress 未確定、failed なのに errorReason 無し等）を型で排除できない。
- **案C: export `ExportJob` 同形の判別共用体エンティティ（`Pending|Processing|Completed|Failed`）を新アグリゲートとして追加。** 進捗は値オブジェクト `{processed,total}`、状態ごとに保持フィールドを型で固定。配置はタグ凝集を保つため `app/core/domain/tag/mergeJob/` 配下。

### Decision

**案C を採用。** export が確立した判別共用体ジョブの形に揃え、タグ統合に必要な最小限（source/target/progress/affectedNoteIds/error）へ縮約する。ノート書き換えの集合演算（現 `mergeTagSets`）はドメインの新規概念ではなくユースケースの純関数として `runTagMergeJob` に置き、`computeMergePlan`（既存ドメインサービス）は enqueue 時の事前検証で再利用する。

### Consequences

- 良い点: 不正状態を型で排除（CLAUDE.md「illegal states unrepresentable」）。export とコードリーディングが揃う。タグドメイン配下に置くことで凝集を保ちつつ独立ライフサイクルを表現。
- トレードオフ: ジョブ系アグリゲートが export/ingestion に続き 3 つ目になり、判別共用体ジョブの定型コードが重複する。共通抽象化は将来の検討事項（本Issueでは過剰抽象を避け踏襲に留める）。

---

## ADR-004: determinate 進捗を `MergeTagDialog` 内に確定し、モックを更新する

### Status
Proposed

### Context

デザインモック `spec/design/pages/P18-merge-tag-dialog.html` は **indeterminate バーのみ**を持ち（ダイアログの `<form>` 内、line 375/391）、コメントで「統合進捗バナー(D)のみ非同期ジョブ基盤を要するため別Issueへ引き渡し継続（本モックでは持たせない）」と D を明示的に先送りしている。一方 Issue チェックリスト D は「**`MergeTagDialog` の** determinate 進捗バナー追従」と明記。CLAUDE.md ではデザインモックが SSOT。

**配置の論点（レビュー coverage P-001）:** プラン初稿は「ダイアログを閉じ、ナビをまたいで残るページ/オーナースコープの常駐バナー（新規 `TagMergeProgressBanner.tsx`）」へ倒していたが、これは Issue チェックリスト D の文言（`MergeTagDialog` 限定）・モック（進捗ブロックはダイアログ内）と矛盾し、かつモックに無い新規 UI サーフェスでスコープ膨張になる。

**「export から determinate を踏襲」の誤り（レビュー arch S-002）:** `runExportJob` は `startProcessing(found, 0)` で `total=0` を seed したまま `recordProgress` を呼ばず進むため、`ExportJobDetailView` の determinate 分岐（`total>0`）に入らず、export の逐次 n/total バーは**実質デッドコード**。本Issueのタグ統合が初の本物 n/total 駆動になる。

### Decision

**determinate 進捗は `MergeTagDialog` 内のバーに確定する（ページ全体バナーは作らない）。** ダイアログは submit 後も開いたまま自ジョブを job id で polling し、`processed/total` で幅を動かす determinate な `role="progressbar"`（`aria-valuenow/min/max`）を表示、完了で閉じる。視覚言語は既存 indeterminate（`.progress-track` / `--radius-pill` / `--color-surface` / accent バー）を土台にし、`app/components/tag/styles.ts` の `progressTrack` を流用、`progressBar`（width 反映 + transition）定数を追加。モックはダイアログ内 determinate へ更新し、D 先送りコメントを解消する（`spec/design/review/` で確認）。

**export については「ジョブ構造（判別共用体・進捗 VO・専用テーブル OCC・outbox→relay→consumer→runner・ポーリングループ）は踏襲するが、実 n/total を供給する determinate バーは本Issueが初実装」**と位置づける。`recordProgress` API・VO 自体は実在するため、駆動するのが新規挙動。フロントは end-to-end（クエリ→ポーリング→幅%反映）を新規に検証する。

### Consequences

- 良い点: Issue チェックリスト D の文言・モックの配置と一致。新規 UI サーフェスを増やさずスコープを最小化。1ダイアログ＝1統合＝自ジョブのみ参照のため、複数同時統合のバナー多重性（旧 S-005）が構造的に発生しない。既存トークンを再利用しリテラル px の新規持ち込みを避けられる。
- トレードオフ: 純粋な「モック追従」ではなく実装側が determinate デザインを一部新規定義するため、デザイン意図のレビューが追加で必要。ダイアログを開いたまま待たせるため、長時間統合では離脱しづらい体感がある（完了で自動的に閉じることで補う）。

---

## ADR-005: enqueue 時の即時楽観削除を廃し、ジョブ完了駆動で一覧へ反映する

### Status
Proposed

### Context

現状 `TagList` の `onMerge` は #607 ADR-003 に従い、統合実行と同時にソースタグを楽観削除（`applyOptimistic remove`）し、同期 `mergeTagsFn` の完了後 `routerInvalidate` で確定する。非同期化すると統合は後続の worker 実行になり、enqueue 直後にソースを消すと「失敗してもタグが消えたまま」になり、進行中の実体（まだ存在するタグ）と表示が乖離する。

### Decision

**enqueue 時の即時楽観削除をやめ、ジョブ完了の `routerInvalidate` でソースタグを消す。** 統合中はソース行に「統合中」状態を示し（任意で操作を抑止）、`MergeTagDialog` のポーリングが完了を検知 → ダイアログを閉じて `routerInvalidate` でソースが消える。失敗時はタグが残りダイアログ内表示がエラーを伝える。`TagList` の `useOptimistic` 投影は壊さない（削除トリガを完了検知に移すのみ）。

### Consequences

- 良い点: 非同期の実体と UI が一致し、失敗時の不整合がない。`useOptimistic` の構造は維持。
- トレードオフ: 統合完了まで（数秒〜）ソースタグが一覧に残るため、即時消滅の体感は失われる。ダイアログ内の「統合中」表示で補う。リネーム/削除との同時操作時の状態管理に注意が要る。

---

## ADR-006: クラッシュ中断ジョブを冪等再開可能にする（`isProcessing` ハードスキップを採らない）

### Status
Proposed

### Context

`runExportJob` は再配信冪等性を「consumer の `processed_events` + `isProcessing` ガード（`processing` を見て再 dispatch をスキップ）」で担保している。プラン初稿はこれを踏襲していた。だが export と異なり**タグ統合は途中で実データを変更（ノートを target へ移動済み）してコミットする**。worker が `processing` 中にクラッシュすると、`handleQueue` の redelivery が再 dispatch に入っても `isProcessing` で**スキップ**され、ジョブは `processing` のまま固着 → 一部ノートだけ移動済み・source タグ未削除・ダイアログは永久に「統合中」。本Issueはキャンセル/再実行/期限切れ UI を scope 外にしているため（plan スコープ）、export 流の回収導線が無く宙吊りになる（AC-5/AC-6 のいずれにも該当しない状態）。さらに「同 source の active ジョブを `BusinessRuleError` で抑止」を入れると固着ジョブが唯一の回復導線（ユーザーの再統合）まで塞ぐ。

### Decision

**`isProcessing` ハードスキップを採らず、`processing` のジョブを冪等再開可能にする。** タグ統合の `replaceTags` は「既に target を持つノートに対し no-op（eventDrafts 空）」となるため**自然に冪等で再実行可能**。再 dispatch されたら、まだ source を持つ残りのノートを再スキャン → 処理 → source delete → `complete` へ**再開**する（スナップショット再取得を「まだ source を持つノート」対象にすれば残りだけを自然に拾う）。consumer の `processed_events` 冪等性（同一 outbox 行の二重 dispatch 抑止）とは層が異なり矛盾しない。重複統合のハードガード（`BusinessRuleError`）は置かず、固着・部分統合を新ジョブで supersede 可能にして回復導線を塞がない。

**(S-002) Pending/Processing 再入セマンティクスの確定。** エンティティは判別共用体で `startProcessing(total)` は **Pending 専用遷移**、`recordProgress(processed)` は **Processing からの再入で呼べ既存 `progress.total` を保持**する（実コードの export `recordProgress` が `job.progress.total` を再利用する形と同じ）。runner 冒頭で Pending / Processing を**分岐**する:

- **Pending**: `startProcessing(total = 全 source 保持ノート件数)` で total を初回確定。
- **Processing（再入）**: **total を再 seed しない**（最初に確定した永続 total を保持）。再入時の snapshot は「まだ source を持つ残りノート」なので件数は初回より小さく、ここで total を取り直すと total が縮み processed が 0 へ戻ってバーが**逆行**する。これを避けるため total を保持し、`processed = total − 残件数` から `recordProgress` で**前進のみ**させ単調性を保つ（AC-4「実 processed/total 反映」と整合）。

**(S-003) 二重ジョブ並走時の source 削除 + complete の冪等耐性。** 本 ADR が重複ガードを置かず固着ジョブを新ジョブで supersede 可能にする以上、その帰結として固着 `processing` ジョブの再開中にユーザーが再 submit すると、同一 source に対し 2 つの runner が並走しうる。ノート書き換えは冪等で安全だが、終盤の `tagRepository.delete(sourceTagId, expectedVersion)`（OCC）と `complete` は、先に完走した側が source 行を消すと後発側で **OCC 競合 / NotFound** になる。これを**失敗ではなく冪等な完了として扱う**（source が既に消えている＝他 run が完了済み → 自ジョブも残件0で `complete` 到達扱い、`fail` にしない）。握り潰さないと後発ジョブが不要に `fail` してダイアログがエラー表示する一方で統合は実際に完了、という矛盾が起き AC-6 の体感を損なう。

### Consequences

- 良い点: crash 後も残りを処理して complete に到達でき、部分統合の宙吊りが起きない。export より優れた回復性をタグ統合特有の冪等性で低コストに得られる。回復導線（再統合）を塞がない。再入で total を保持するため progress バーが逆行せず（S-002）、二重ジョブ並走で source が先に消えても後発ジョブが冪等に complete するため誤った `fail` 表示が出ない（S-003）。
- トレードオフ: 「途中状態を見てスキップ」より runner のループが残ノート再スキャンを許容する分やや冗長。runner が Pending / Processing を分岐し、source 削除の OCC 競合 / NotFound を寛容に扱う追加分岐を要する。二重ジョブが同時に走る可能性は残るが、結果は冪等で同一。`tag.deleted`/`note.saved` イベントの at-least-once 配信に対し consumer 側が idempotent である前提に乗る。

---

## ADR-007: 実装時の付随的な設計判断（Issue #580 実装ログ）

### Status
Accepted（実装で確定）

### Context / Decision

実装中に下した非自明な判断を記録する。

1. **`tag_merge_jobs.source_tag_id` / `target_tag_id` は FK なしの opaque text。** source タグは統合完了時に delete されるが、completed ジョブは完了後もダイアログがポーリングで読めねばならない。タグへの cascading FK を張ると source 削除でジョブ行ごと消えてしまう（ポーリングが NotFound 化）。export が note ids を `target_note_ids_json` に値として持つのと同じ方針で、タグ id を値として保持し owner のみ cascade FK にする。

2. **`mergeJob/errorCode.ts` は専用モジュールとして新設（TagErrorCode へ混ぜない）。** export 同形のジョブ独立アグリゲートとして凝集を保つため。当初 `errorCodeNaming.test.ts` の glob (`domain/*/errorCode.ts`) は単一階層のみ拾い `tag/mergeJob/errorCode.ts`（深さ2）が検査対象外だったが、**glob に `domain/*/*/errorCode.ts` を追加し `EXPECTED_ERROR_CODE_NAMES` に `TagMergeJobErrorCode` を加えて命名ガードのカバー範囲に取り込んだ**（深さ2の errorCode は現状これのみ）。key PascalCase / value lower_snake_case を自動検査で担保。

3. **runner の OCC 寛容化はジョブ完了経路（source delete + complete）に限定。** ノート書き換えバッチの save が真の並走で OCC 競合した場合は `fail`（→ redelivery）に倒す。plan が冪等耐性を明示要求したのは終盤の source 削除 + complete のみで、ノート書き換えは「冪等で安全」と整理されているため、ここを握り潰すと真の異常まで隠す。

4. **`MergeTagDialog` の初回ポーリングは `setTimeout(0)` でなく即時 `void tick()`。** export の `ExportJobDetail` はローダ再取得ベースで 3s 間隔だが、本ダイアログは enqueue 直後に自ジョブを直接 polling する専用クエリ（`getTagMergeJobFn`）を使うため、受付直後に即 1 回読む方が体感が良く、テストでも fake timer を要さず検証できる。以降は `POLL_INTERVAL_MS`（1500ms）間隔 + `visibilityState` ガード。

5. **`tag_merge_jobs.status` の CHECK は 4 状態のみ**（`pending|processing|completed|failed`）。export と異なり `cancelled` / `expired` はスコープ外（キャンセル/期限切れ UI なし）。

### Consequences

- 良い点: 完了ジョブが source 削除後も読め、ポーリングが完結する。ジョブアグリゲートが export と構造的に揃いつつタグ凝集を保つ。
- トレードオフ: completed/failed 行の蓄積に対する pruner 連携は当面未実装（リスクとして据え置き、`idx_tag_merge_jobs_updated_at` で将来の保持期間プルーニングに備える）。

---

## ADR-008: `tag.merge.requested` のイベントデコーダ登録は必須（plan arch S-001 の訂正）

### Status
Accepted（実機ブラウザ検証で判明し訂正）

### Context

plan のレビュー Round 1（arch S-001）で「イベントデコーダ登録は不要 — relay は生の `DomainEvent` を `EVENTS_QUEUE.sendBatch` で転送し復号しない。デコーダは activity-log 投影専用」と判断し、実装でもデコーダを登録しなかった。

しかし Phase 2 のブラウザ検証で、タグ統合ジョブが永久に `pending` のまま処理されないことが判明。outbox 行の `last_error` は `No decoder registered for event type "tag.merge.requested"`。

実態: relay 処理（`app/core/application/workers/eventRelayWorker.ts` の `processOutboxEvents`、ローカル inline dev 経路を含む）は、行を dispatch する前に `defaultEventDecoderRegistry` で**必ずデコードする**（`decodeEntry`）。デコーダ未登録の型は per-row failure になり quarantine され、`dispatchDomainEvent`（= runner 起動）に到達しない。`export.job.requested` を含む全ジョブイベントも `exportEventDecoders` 経由でデコードされており、デコーダ登録は確立済みの必須手順だった。arch S-001 のレビュー判断は誤り。

### Decision

`tag.merge.requested` のデコーダを registry に登録する:

- `app/core/application/tag/mergeJobEventDecoders.ts` を新設（`export/eventDecoders.ts` 同形。zod `.strict` スキーマ + `TagMergeJobId.create` で復元）。
- `eventRelayWorker.ts` の `AllDomainEvents` union に `TagMergeJobEvent` を追加し、`defaultEventDecoderRegistry` に `...tagMergeJobEventDecoders` を spread。
- `AllDomainEvents` にイベント型を加えたことで `satisfies DefaultEventDecoderRegistry` が**デコーダ網羅をコンパイル時に強制**する（型を union に入れ忘れたまま emit していたのが、satisfies の網羅検査をすり抜けた真因）。
- 回帰テスト `app/core/application/tag/__tests__/mergeJobEventDecoders.test.ts` を追加し、`defaultEventDecoderRegistry["tag.merge.requested"]` が enqueue payload をデコードできることを assert（実機で踏んだ穴をユニットで捕捉）。

### Consequences

- 良い点: enqueue → relay デコード → dispatch → `runTagMergeJob` の経路が繋がり、ジョブが実際に処理される。型フェンス（satisfies）＋回帰テストで同種の登録漏れを二重に防止。
- トレードオフ: なし（確立済みパターンへの整合。当初「1行追加のみ」と見積もった worker 配線が、デコーダ1ファイル + relay registry 2行に増えた程度）。
- 教訓: 「relay が復号するか否か」はレビューの机上判断ではなく、`eventRelayWorker.decodeEntry` の実コードで確認すべきだった。非同期ジョブ機能は runner 単体テストだけでなく outbox→relay→dispatch の経路を1本通すテスト/検証が要る。
