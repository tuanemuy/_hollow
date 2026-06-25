# Review 002 — Test + Adapter/Infra（#580 タグ統合の非同期ジョブ化 / Round 2 収束確認）

対象 PR: #782 / ブランチ `issue/580/tag-merge-async-progress`
レビュー対象 commit: `4f5f8d55f21a005e4f3eeadef7b8ff60dc8be887`（`gh pr view 782` の headRefOid と一致＝PR head 確定）
観点: Round 1 修正（test W-001/W-002/W-003・adapter W-001）の反映確認、リグレッション、残る穴

## 総評（重要）

**Round 2 の前提が成立していない。** タスクが「Round 1 で入った関連修正」として挙げた 3 点

- test: 複数バッチ中間進捗（AC-2）/ runner 失敗パス（AC-6, FK 違反で誘発）/ enqueue の `tag.merge.requested` outbox 発火（AC-1）の integration 追加
- test: `runTagMergeJob` の `pageSize` 注入シーム
- adapter: `idx_tag_merge_jobs_owner_status` を schema.ts と 0021 SQL から削除

は、**PR head `4f5f8d55`（PR は単一コミット）に一つも反映されていない**。fetch 済みの `origin/issue/580/...` ・`FETCH_HEAD` ・`gh` の headRefOid はすべて `4f5f8d55` で一致しており、これが現 PR の最新状態。したがって Round 1 の Warning（test 3 件・adapter 1 件）はすべて未解消のまま残っており、**収束は達成されていない**。修正コミットが push されていない可能性が高い。

スキーマ ↔ マイグレーションの相互整合・OCC・JSON ラウンドトリップ・層分割・命名規約など Round 1 で「問題なし」とした箇所に**新たなリグレッションは無い**（＝コミット自体が Round 1 時点から変わっていない）。

---

## Test

### Blockers

#### [B-001] Round 1 で約束した AC-2 / AC-6 / AC-1 の integration 追加が PR head に存在せず、収束未達 — `app/core/application/tag/__tests__/{tagMergeJob.integration,tag.integration}.test.ts`

- **事実:**
  - `tagMergeJob.integration.test.ts` のテストは Round 1 と同一の 4+1 本（`counts every inspected note` / `re-running … no-op` / `resumes a crashed processing job` / `completes idempotently when source already deleted` / ownership 1 本）のみ。**複数バッチ跨ぎ・runner 失敗・outbox 発火のテストは無い。**
  - `tag.integration.test.ts:323` の `mergeTags (async job)` describe は 5 本（merge 成功 / MergeSameTag / Forbidden / de-dup / NotFound）で、いずれも `mergeViaJob`（`tag.integration.test.ts:22` のヘルパ = `enqueueTagMergeJob` → **`runTagMergeJob` を直接呼ぶ**）で relay/outbox を迂回。`outbox_events` を select するのは renameTag のテスト（`:307,:318`）だけで、**`tag.merge.requested` を直接アサートするテストは皆無**。
  - 失敗系: integration 全体に `status === "failed"` を作る/観測するテストが存在しない（`failed` 文字列は entity 単体・DTO・TagList 描画・schema/decoder のみ）。FK 違反誘発テストも無い。
- **理由:** Round 1 test W-001（AC-2 複数バッチ中間進捗）/ W-002（AC-6 runner failed 生成経路）/ W-003（AC-1 enqueue→outbox 発火）がそのまま未解消。AC マップで「部分」だった 3 セルが一切埋まっていない。
- **提案:** Round 1 review-001-test の W-001/W-002/W-003 の各「提案」をそのまま実施してから再レビュー。最低限 (1) 2 バッチ跨ぎで `0 < processed < total` の中間 commit を `findById` で観測、(2) runner 内例外を誘発して `status==="failed"` + `errorReason` 非空を永続まで確認、(3) `enqueueTagMergeJob` 後に `outbox_events` で `type==="tag.merge.requested"` かつ `payload.jobId===job.id` を 1 件アサート。

#### [B-002] `runTagMergeJob` に `pageSize` 注入シームが無く、複数バッチ検証の前提手段が未実装 — `app/core/application/tag/runTagMergeJob.ts:13`

- **事実:** `MERGE_NOTE_PAGE_SIZE = 500` は依然モジュール定数（`runTagMergeJob.ts:13`、`processBatches` の `:173` / `collectSourceNoteIds` の `:631` 相当が参照）。引数・container 定数・環境注入のいずれの差し替え口も無い。
- **理由:** タスクは「`runTagMergeJob` の `pageSize` 注入シームを利用」して複数バッチテストを足したとするが、その**シーム自体が存在しない**。B-001(1) を実 D1 で素直に書くには 500+ 件 seed が必要となり非現実的＝シーム導入が前提。
- **提案:** `RunTagMergeJobInput` か container 経由で `pageSize?` を注入可能にし（既定 500）、テストで 2 に差し替えて 3〜4 件 = 2 バッチを跨がせる。注入口を入れたうえで B-001(1) を実装。

### Warnings

#### [W-001] リポジトリ `delete`（OCC）と malformed JSON → DataIntegrity 変換が依然未カバー — `app/core/adapters/d1/__tests__/tagMergeJobRepository.integration.test.ts:51,95,144`

- Round 1 N-003 のまま。adapter integration は `round-trips … JSON`（:51）/ `ConflictError on stale-version save`（:95）/ `returns null for a missing job`（:144）の 3 本のみ。`delete(OCC)` 経路と、`affected_note_ids_json` を壊した行からの `RehydrationError → SystemError(DataIntegrityError)` 変換（`toEntity` の catch・`parseStringArray` 非配列/非文字列）は無検証。
- `delete` は現状 runner 未使用（pruner 想定の余剰 API）だが `TransactionalRepository` 契約上は実装必須。malformed JSON 変換は防御的再検証の核なので、本 Issue で 1 本ずつ足す価値が高い（壊した `affected_note_ids_json` 行を入れて `findById` が DataIntegrityError になることを観測）。pruner 据え置きは ADR-007 整合で可。

#### [W-002] `getTagMergeJob` の jobId 不在（NotFound）分岐が未テスト — `app/core/application/tag/getTagMergeJob.ts`

- Round 1 N-002 のまま。owner / other-owner（Unauthorized, `tagMergeJob.integration.test.ts` の ownership 本）は押さえるが、「存在しない jobId → `TAG_MERGE_JOB_NOT_FOUND`」が未通過。完了プルーニング後 id をポーリングが引く経路。1 本で埋まる。

### Notes

- **[N-001]** 他オーナー拒否が `Unauthorized`（422, 存在リーク）である件（Round 1 test N-001）は **ADR-010-2 で「意図的に維持」と明文化済み**。jobId は UUIDv7 で列挙不可・機密無返却のため許容。設計判断として決着しており追加対応不要。
- **[N-002]** 不正遷移の型排除・`illegalTransition` デッドコード（Round 1 test N-004）、twin 中断 stop 分岐（N-005）、変更/no-op 混在バッチ（N-006）、frontend のポーリング停止/interval/visibility 未検証（N-007）は Round 1 と同じ位置づけ（許容 or 実装側整理候補）で変化なし。
- 層分割・fake 方針・命名規約（`TagMergeJobErrorCode` の深さ2 glob 取り込み）は Round 1 同様に適正で、`docs/test.md` 準拠。新たな逸脱は無い。

---

## Adapter / Infrastructure

### Blockers

#### [B-001] Round 1 で削除予定だった `idx_tag_merge_jobs_owner_status` が schema.ts・0021 SQL の双方に残置（修正未反映）— `app/core/adapters/d1/schema.ts:680` / `migrations/0021_tag_merge_jobs.sql:38`

- **事実:** `idx_tag_merge_jobs_owner_status` は schema.ts（:680, `(owner_id, status, desc(updated_at))`）と 0021 SQL（:38, `(owner_id, status, updated_at DESC)`）の**両方に依然存在**（各ファイル 1 個ずつ確認）。Round 1 adapter W-001 で「現状リーダ不在・『owner 列挙はしない』というポート設計と逆方向＝削除（YAGNI）」と指摘し、タスクも削除済みと記載していたが、削除は**適用されていない**。
- **理由:** リーダ（owner+status 絞り込み or updated_at ソートのクエリ）は `enqueue/get/run` のいずれにも無く、ポート JSDoc（`app/core/domain/tag/ports/tagMergeJobRepository.ts`）も「owner-scoped listing を持たない」と明記。write 増幅コストだけ払う投機インデックスのまま。Round 1 の合意修正が反映されていない。
- **提案:** schema.ts:680-684 と 0021 SQL:38 から `idx_tag_merge_jobs_owner_status` を削除。`idx_tag_merge_jobs_updated_at`（schema.ts:686 / SQL:39, 将来 pruner 用＝ADR-007 明文化）は残置で正しい。残すなら schema/SQL に「現状リーダなし・export 対称性の先行定義」コメントを付す（Round 1 提案どおり）。

### Warnings

なし（B-001 を除けば、スキーマ ↔ マイグレーションの相互整合は保たれている。下記参照）。

### Notes

- **[N-001] schema.ts ↔ 0021 SQL の相互整合は維持。** 列・型・default・CHECK（`tag_merge_jobs_status_enum` = `pending|processing|completed|failed`）・FK（`owner_id` cascade、`source_tag_id`/`target_tag_id` は FK なし opaque text＝ADR-007-1）・2 本のインデックス定義は両ファイルで一致しており、**新たなスキーマドリフトは無い**。問題は「両者一致のまま削除すべき index が両方に残っている」点（＝B-001）で、不一致ではない。
- **[N-002] OCC / JSON ラウンドトリップ / ドライバエラー翻訳は Round 1 同様に正しい。** `save`/`delete` の `addOcc` + `ConflictError(OPTIMISTIC_LOCK_FAILURE)`、`insert` の OCC なし `add`、`affected_note_ids_json` の `null → '[]' → [] → null` ラウンドトリップ、`isRehydrationError → SystemError(DataIntegrityError)` 変換、UoW 配線（`ctx.tagMergeJobRepository`）はいずれもコミット不変で健全。integration（OCC stale / round-trip / missing）で裏取り済み。ただし `delete` と malformed JSON のテストは未追加（test W-001 と同根）。

---

## 受け入れ基準 × 収束状況（Round 2）

| AC | Round 1 状態 | Round 2 状態 | 収束 |
|---|---|---|---|
| AC-1 enqueue→outbox→relay→dispatch→runner | 部分（outbox 発火未アサート, test W-003） | **変化なし（未反映）** | 未収束 |
| AC-2 進捗 n/total 逐次更新 | 部分（複数バッチ中間未検証, test W-001） | **変化なし（pageSize シーム無し）** | 未収束 |
| AC-6 失敗 → failed | 部分（runner failed 生成経路未検証, test W-002） | **変化なし（failed 系 integration 無し）** | 未収束 |
| AC-5 / AC-7 / AC-8 | 充足 | 充足（変化なし） | 維持 |
| adapter index 整理（Round 1 W-001） | 指摘 | **未削除（schema.ts:680 / SQL:38 残置）** | 未収束 |

## 結論

**APPROVE 不可。** Round 2 の目的（Round 1 修正の収束確認）に対し、対象修正が PR head に一切反映されておらず収束を確認できない。Round 1 の合意修正コミットが push されているかを確認のうえ、test B-001/B-002・adapter B-001 を反映して再提出を要する。コード本体（スキーマ整合・OCC・冪等再開ロジック）に新規の破綻は無いため、修正は「未反映分の追加」であり再設計は不要。
