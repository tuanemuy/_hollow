# Plan Review — Issue #580 (Round 2)

**視点:** あるべきアーキテクチャとの整合性・実現可能性・リスク
**対象:** `.issue/580/plan.md` / `.issue/580/adr.md`（Round 1 反映後）
**レビュー日:** 2026-06-26

---

## 結論（サマリー）

Round 1 の5つの要修正・改善（(a)〜(f)）はすべて実コードと突き合わせて**技術的に妥当**で、過剰修正・新たな破綻は無い。方針は export/ingestion の確立パターンに正しく載っており、依存方向（内側→外側）も維持されている。**要修正（P）はゼロ**。ただし、Round 1 の修正で `getTagMergeJob` を `findById` 単発へ簡素化した際に**オーナー認可が抜けた**点（IDOR）と、ADR-006 の冪等再開を実装に落とす際の**状態機械/進捗 total の再入セマンティクス**に未確定があり、改善提案として3点記録する。いずれも方針転換ではなく step 5/6 の精緻化で解消できる。

### Round 1 修正の検証結果（すべて妥当）

- **(a) ダイアログ内 determinate + 自ジョブ id polling:** `app/components/export/ExportJobDetail/{index.tsx,loader.ts}` の polling 機構（`actorUserId` 付きローダ + interval + `visibilityState`）が実在し、そのまま踏襲可能。1ダイアログ＝1ジョブで多重性が構造的に消える判断も妥当。**妥当。**
- **(b) ワークセット事前スナップショット + processed=検査数:** `mergeTags.ts` の `collectNotesWithTag` は「全件 read-only 読み切り（`offset += notes.length`、ミューテーション無し）→ 第2ループで変更」で、plan の snapshot 方式はこの不変条件に忠実。no-op スキップ（`if (eventDrafts.length === 0) continue`）が実在するため、S-003「検査数で数える」修正は**必要かつ正しい**（affected のみだと total 手前で停滞する）。**妥当。**
- **(c) 冪等再開（ADR-006、isProcessing ハードスキップ廃止）:** consumer 冪等性を実コードで確認 — `handlers.ts` は `hasProcessed(eventId) → dispatch → 成功時のみ markProcessed`。真のクラッシュ（worker kill / CPU timeout / 例外が runner 内 try/catch を越える）では stamp されず redelivery が dispatch に再入する。各バッチが独立 UoW でコミット済みなので「残り source 保持ノートを再スキャン」で再開できる前提は**成立する**。**妥当**（ただし再入セマンティクスに未確定 → S-002）。
- **(d) イベントデコーダ登録の削除（S-001）:** `dispatchDomainEvent` の `export.job.requested` ケースは `event.payload as {exportJobId}` キャスト + `ExportJobIdVO.create` のみでデコーダ不使用。デコーダは activity-log 投影ケース（`export.job.completed`/`ingestion.created` 等）専用。`tag.merge.requested` も1行追加で足りる、という認識は**正確。**
- **(e) export determinate デッドコード是正（S-002）:** `runExportJob` は `ExportJob.startProcessing(found.entity, 0, now)` で **total=0 を seed したまま `recordProgress` を一度も呼ばず** `assembleAndComplete` へ進む（JSDoc に「再記録する」とあるが未実装）。plan/ADR-004 の「本Issueが初の実 n/total 駆動」という位置づけは**実態どおりで正確。**
- **(f) spec 同期ステップ追加:** step 13（`spec/usecases/tag.md`/`spec/domains/tag.md` 更新）が追加され、SSOT 同期規律に沿う。**妥当。**

---

## 問題点（要修正）

**問題点ゼロ。** Round 1 の修正に過剰修正・新たな破綻・依存方向違反は検出されなかった。

---

## 改善提案（検討推奨）

- **[S-001]** `getTagMergeJob` にオーナー認可（`actorUserId` + 所有者検証）を明記すべき
  - 理由: Round 1 で `listActiveTagMergeJobs`/`findActiveByOwner` を廃し `getTagMergeJob(jobId) = findById` へ簡素化したのは妥当だが、簡素化の過程で**所有者チェックが落ちている**。先行事例の `getExportJob.ts` は `GetExportJobInput.actorUserId` を取り `ExportJob.assertOwnedBy(found.entity, actorUserId)` を必須で実行している。plan の記述（step 6「`findById(jobId)` で単一ジョブの DTO を返す」/ ドメイン設計 line 75「`getTagMergeJob` クエリは `findById` で足りる」）はこの所有者検証に触れていない。`getTagMergeJobFn({ jobId })` はクライアント state の jobId を直接受けて polling するため、所有者検証が無いと**他オーナーのジョブを id 推測で読める IDOR** になる（進捗・sourceTagId/targetTagId が漏れる）。
  - 提案: `getTagMergeJob` の入力に `actorUserId` を加え、`TagMergeJob` に `assertOwnedBy`（または同等の所有者検証）を持たせて `getExportJob` と同形にする。`getTagMergeJobFn` サーバ関数は認証アクターの id を渡す（`ExportJobDetail/loader.ts` 同様）。step 6・ドメイン設計（エンティティのメソッド）に反映。

- **[S-002]** ADR-006 の冪等再開を実装に落とす際、`processing→processing` 再入の状態遷移と進捗 total のセマンティクスが未確定
  - 理由: エンティティは判別共用体で `startProcessing(total)` は **Pending 専用遷移**（export 同形）。一方 ADR-006 の再開は「`processing` のジョブが再 dispatch される」前提で、runner 冒頭で `runExportJob` 流の `if (!isPending) return null`（＝ハードスキップ）を**使わない**と決めている。ここで2つの未確定が残る:
    1. 再入時 runner は Pending と Processing で分岐する必要がある（Processing では `startProcessing` を呼べない／呼ぶと不正遷移）。plan/ADR はこの分岐を明示していない。
    2. 再開時の snapshot は「**まだ source を持つ残りノート**」なので件数は初回より小さい。これで total を再 seed すると total が縮み processed が 0 に戻り、ダイアログのバーが**逆行**する（例: 100中40%→残60で0/60）。crash 時のみの稀ケースとはいえ AC-4 の「実 processed/total 反映」と齟齬。
  - 提案: step 5 もしくはドメイン設計で再入セマンティクスを確定する。例:（a）初回は Pending→`startProcessing(total=全件)`、再入は Processing のまま永続 total を保持し `processed = total − 残件数` から再開して単調性を保つ、または（b）再入時も全 source 保持ノート＝残件で total を取り直すと割り切り、バー逆行を許容と明記する。エンティティに `processing` からの進捗継続 API（`recordProgress` の再入可否）があることを設計で担保。

- **[S-003]** ADR-006 が許容する「二重ジョブ同時実行」時、source タグ削除と `complete` の冪等耐性を runner に要求すべき
  - 理由: ADR-006 は重複統合のハードガードを置かず「固着ジョブを新ジョブで supersede 可能」にする方針（妥当）。ただしその帰結として、固着 `processing` ジョブが redelivery で再開している最中にユーザーが再 submit すると、**同一 source に対し2つの runner が並走**しうる。ノート書き換えは冪等（`replaceTags` no-op）で安全だが、終盤の `tagRepository.delete(sourceTagId, expectedVersion)`（OCC）と `complete` は、先に完走した側が source 行を消すと**後発側で OCC 競合 / NotFound** になる。ここを握り潰さないと後発ジョブが不要に `fail` してダイアログにエラー表示され（AC-6 の体感を損なう）、実際には統合は完了している、という矛盾が起きる。
  - 提案: step 5 の source 削除＋`complete` を「source が既に消えている＝他 run が完了済み → 自ジョブも `complete`（残件0で到達）扱い、`fail` にしない」よう冪等/寛容に設計すると明記。テスト方針（step 14 の冪等再開）に「並走/source 先行削除」のケースを含める。

---

## 良い点

- **Round 1 指摘の事実確認がすべて正しい。** export determinate のデッドコード性（`startProcessing(...,0,...)` + `recordProgress` 不発火）、デコーダ非使用（生イベント転送 + payload キャスト）、consumer の成功時のみ stamp（crash→redelivery 再入）を実コードで再確認し、いずれも plan/ADR の記述と一致。誇張も誤認も無い。
- **過剰修正が無い。** 配置をダイアログ内に閉じ（新規 UI サーフェス・常駐バナーを増やさない）、`listActiveTagMergeJobs`/`findActiveByOwner` を削るなど、Round 1 はスコープを**広げず**に解決しており、判別共用体ジョブ・進捗 VO・OCC テーブル・outbox→relay→consumer→runner の踏襲も最小差分。
- **依存方向が維持されている。** step 1（VO）→2（エンティティ/イベント/ポート）→3-4（スキーマ/リポジトリ/UoW）→5-6（runner/enqueue/query）→7-8（dispatch/DI）→9-12（presentation/モック）→13（spec）→14（テスト）の順は内側→外側で正しい。`mergeTagSets` をユースケース純関数に置く判断もレイヤー漏れを避けている。
- **冪等再開の根拠が実コードで裏付けられている。** ADR-006 の「crash で stamp されず redelivery が再入する」前提は `handlers.ts` の `hasProcessed → dispatch → 成功時 markProcessed` フローと整合。タグ統合の `replaceTags` no-op 冪等性も `mergeTags.ts` に実在し、再開設計の土台が確かにある。
- **配線の現実認識が正確。** `EVENTS_QUEUE` 再利用で `wrangler.toml` 変更不要、UoW へ1リポジトリ追加で consumer/request 両コンテナへ波及、マイグレーション `0021` 空き、という Round 1 の補足確認は今回も追検証して相違なし。

---

## 補足: P レベルに上げなかった理由

S-001（IDOR）はセキュリティ事項だが、先行事例 `getExportJob` に `assertOwnedBy` の確立パターンが既にあり、step 6 に1文追記すれば閉じる「漏れ」であって方針の破綻ではないため S とした。実装時に確実に拾えるよう、step 6 とドメイン設計（エンティティのメソッド一覧）に明記することを強く推奨する。
