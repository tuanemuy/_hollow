# レビュー 001 — Application 層（PR #782 / Issue #580）

観点: ユースケース・worker 配線・非同期ジョブ・認可セキュリティ。
対象: `app/core/application/tag/{enqueueTagMergeJob,runTagMergeJob,getTagMergeJob,mergeJobEventDecoders,view}.ts`, `app/core/application/dto/tagMergeJob.ts`, `app/core/application/workers/{dispatchDomainEvent,eventRelayWorker}.ts`, `app/core/application/execution/unitOfWork.ts`, 削除された `mergeTags.ts`、ドメイン `app/core/domain/tag/mergeJob/*`。

## 総評

`.issue/580/plan.md` のステップ5/6/7/9 と `.issue/580/adr.md`（ADR-001/006/008、認可 S-001/AC-8）に高い忠実度で実装されている。runner の最重要要件（事前スナップショット・検査数計数・冪等再開の Pending/Processing 分岐・total 非再 seed・前進のみ・source 先行削除の冪等 complete）はいずれも実装され、対応する integration テスト（`tagMergeJob.integration.test.ts:186/245/289`）で裏取りされている。ADR-008 のデコーダ登録バグ修正（`mergeJobEventDecoders` 新設 + `AllDomainEvents` union 追加 + `satisfies` 網羅強制 + 回帰テスト）も正しく入っている。**Blocker は無し。**

## Application

### Blockers

なし。

### Warnings

- **[W-001] 二重ジョブ並走時の note-row OCC 競合が job を terminal `failed` にし、S-003 が滑らかにしようとした AC-6 体感劣化を一部温存する** — `app/core/application/tag/runTagMergeJob.ts:90-98`（外側 catch → `failJob`）と `:228-263`（`finalize` の OCC 寛容化）の非対称。
  - 理由: ADR-006 S-003 は「固着 processing ジョブの再開中にユーザーが再 submit すると同一 source に 2 runner が並走しうる」前提で、後発側の `fail` 誤表示を防ぐと述べる。しかし冪等寛容化は **`finalize` の source-delete + complete だけ**に限定されている（`isConflictError(error) || isNotFoundError(error)` → `completeWithoutSourceDelete`）。一方、`processBatches` 内の `noteRepository.save`（ノート書き換え）が真の並走で OCC 競合すると `ConflictError` が `processBatches` から外へ伝播し、`runTagMergeJob` の外側 catch に拾われ **`failJob` で当該ジョブが恒久 `failed`** になる（`dispatchDomainEvent` は runner が握って `handled` を返すため redelivery も無い）。結果、twin の片方が実際には統合を完了させているのに、もう片方のダイアログがエラーを表示する — まさに S-003 が解消しようとした矛盾が、source 削除より手前のノート競合経路で再現する。
  - これは `ADR-007#3`（「ノート書き換えの save が真の並走で OCC 競合した場合は fail に倒す」）として**意図的に選択された**トレードオフであり、実発生確率も低い（500 件バッチ・run 内は逐次、同一ノートに同時刻ヒットが必要）。よって Blocker ではない。ただし「source-delete だけ寛容・note-save 非寛容」の非対称はレビューで明示記録すべきで、`runExportJob` と同じ blanket-catch パターンに乗っているという理由だけで見過ごすべきではない。
  - 提案: 現状維持で可だが、(a) ADR-007#3 の判断を runner の外側 catch 近傍にもコメントで明記する、または (b) 真の twin 体感劣化を嫌うなら note-save の `ConflictError` も「他 run が先行した」シグナルとして `finalize` 同様に残件再スキャン→冪等 complete へ寄せることを将来 Issue 化する、のいずれか。

- **[W-002] `getTagMergeJob` の他オーナー拒否は `BusinessRuleError(Unauthorized)` → serialized kind `business` = HTTP 422 で、plan AC-8 の「NotFound/Forbidden」文言と一致せず、存在オラクル（404 vs 422）が残る** — `app/core/application/tag/getTagMergeJob.ts:39`、`app/core/domain/tag/mergeJob/entity.ts:179-186`、`app/core/presentation/errorResponse.ts:108`。
  - 理由: `assertOwnedBy` は他オーナー時に `BusinessRuleError`（code `tag_merge_job_unauthorized`）を投げ、これは `business` → **422** にマップされる。存在しない jobId は `NotFoundError` → **404**。クライアントは 404 と 422 を区別でき「ジョブは存在するが自分のものではない」ことを推測できる（弱い存在オラクル）。**進捗・source/target タグ ID 等の機密データは `assertOwnedBy` が return 前に throw するため漏れない**ので IDOR の本丸（AC-8）は守られている。
  - これは先行 `getExportJob`（`app/core/application/export/getExportJob.ts` + `ExportJob.assertOwnedBy`）と**完全同形**であり、ADR-006/plan が「確立パターン踏襲」を明示選択した結果なので、新規欠陥ではない。よって Blocker ではない。
  - 提案: 現状維持で整合は取れている。存在オラクルまで塞ぎたいなら、所有者不一致を 404（`NotFoundError`）に倒す方針を export と揃えて将来検討（本 PR 単独で export と非対称にするのは避ける）。

### Notes

- **[N-001] 冪等再開時の `complete(affectedIds)` はクラッシュ前に merge 済みノートを含まない** — `app/core/application/tag/runTagMergeJob.ts:249`。Processing 再入では `workIds` が「まだ source を持つ残りノート」のみで、`affectedIds` も当該 run 分のみ。よって `affected_note_ids_json` にはクラッシュ前 run の更新分が記録されない。`TagMergeJobDTO`（`dto/tagMergeJob.ts`）は `affectedNoteIds` を露出しておらず、ダイアログも参照しないため**機能的に無害**だが、永続値の正確性は欠ける。export 由来の踏襲構造なので許容範囲。

- **[N-002] `prepareProcessing` の `startProcessing` OCC 競合（pending→processing race）は専用ハンドリングが無く `dispatchDomainEvent` の `retry` に落ちる** — `runTagMergeJob.ts:67`（`prepareProcessing` の await は try の**外**）→ `dispatchDomainEvent.ts:451-467`（`ConflictError` は最終 `return { kind: "retry" }`）。twin が先に pending→processing した場合 OCC で `ConflictError` が伝播し、メッセージは retry → 再配信で「今度は Processing 分岐で resume」する。機能的には正しい（冪等再開に合流）。ただし redelivery 前提であり、PR 説明にある inline dev relay 経路（`pnpm dev`）では再配信挙動が本番 Queue と異なる点は留意。

- **[N-003] 「検査ノート数で計数（no-op 含む）」のロジックは正しいが、本 workset では no-op 経路が実質空振り** — `runTagMergeJob.ts:202`（`if (eventDrafts.length === 0) continue;`）。`workIds` は `collectSourceNoteIds`（source タグ保持ノート）に限定されるため、`replaceTags` は常に source を除去＝必ず変更が発生し `eventDrafts` は空にならない。よって `inspected` は事実上 `affected` と一致し、no-op 防止の counting（arch S-003 が懸念した「100% 手前停滞」）は本ケースでは発生しない。計数式（`baseProcessed + inspected + inspectedInBatch` を `min(total, …)` でクランプ）自体は二重計上なく正しく、resume 時も単調前進（`baseProcessed = min(total, max(processed, total-remaining))`）。害は無く、防御的コードとして妥当。

- **[N-004] 規約準拠（良い点）**:
  - UoW 内でのみ repo 操作・`collectEvents`：enqueue（`enqueueTagMergeJob.ts:38-80`）、各バッチ・finalize・failJob すべて `unitOfWorkProvider.run` 内。複数 UoW 境界の切り方（prepare / batch×N / finalize）は `runExportJob` 同形で長時間トランザクションを開かない。
  - ドメインロジック漏れなし：状態遷移（`startProcessing`/`recordProgress`/`complete`/`fail`/`assertOwnedBy`）は全てエンティティ側。ユースケースに残るのは集合演算 `mergeTagSets`（純関数、`mergeTags.ts` から verbatim 移設）とオーケストレーションのみで、ADR-003 の「ノート書き換え集合演算はユースケース純関数」方針に整合。
  - broad try/catch の濫用なし：runner 外側 catch は worker 境界の partial-failure 許容（export 同形・規約で許可される唯一の場所）、`finalize` の catch は `isConflictError||isNotFoundError` に**narrow** され else は rethrow。エラー再翻訳なし（domain `BusinessRuleError` はそのまま流れ、`dispatchDomainEvent` で kind 別に handled/retry 判定）。
  - 認可：`getTagMergeJob` は `actorUserId` + `assertOwnedBy` 必須（AC-8）、`getTagMergeJobFn`（`actions.ts:74-90`）は `requireCurrentUser()` の id を `actorUserId` に渡しクライアント jobId を信用しすぎていない。`enqueueTagMergeJob` は source/target の存在・owner 一致・`computeMergePlan`（source≠target）を事前検証し、**重複抑止ガードは置いていない**（冪等方針 coverage S-002 準拠）。
  - worker/decoder：`dispatchDomainEvent.ts:252-257` に `tag.merge.requested` ケース（VO 構築 → `runTagMergeJob`）。`mergeJobEventDecoders.ts` を新設し `eventRelayWorker.ts:73`（`AllDomainEvents` に `TagMergeJobEvent`）+ `:96`（`...tagMergeJobEventDecoders` spread）+ `:100`（`satisfies DefaultEventDecoderRegistry` で網羅強制）。ADR-008 のバグ修正が型フェンス＋回帰テスト（`mergeJobEventDecoders.test.ts`）の二重で入っている。
  - UoW 配線：`UnitOfWorkContext.tagMergeJobRepository`（`execution/unitOfWork.ts:48`）+ D1 実装注入（`adapters/d1/unitOfWork.ts:94/185`）。consumer/request 両コンテナが UoW 経由で自動取得（追加配線不要）。

## 受け入れ基準トレース（Application 関連）

- AC-1（非同期化 enqueue→outbox→relay→consumer→runner）: 充足。配線一式 + デコーダ登録あり。
- AC-2（進捗 n/total 永続化）: 充足。`recordProgress` を各バッチ UoW で逐次 save。
- AC-5（データ欠落なし）: 充足。`collectSourceNoteIds` で read-only 事前スナップショット → 固定リスト処理。offset+ミューテーション交互は不採用。
- AC-6（失敗は failed・楽観状態を壊さない）: 概ね充足。ただし twin note-save OCC で誤 fail し得る（W-001、ADR-007#3 で意図的）。
- AC-8（IDOR 防止）: 充足。`assertOwnedBy` で機密データ漏洩を阻止。存在オラクルは export 同形で残存（W-002）。
