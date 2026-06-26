# Review 003 — Backend（Domain / Application / Adapter / Test）— #580 タグ統合の非同期ジョブ化 / Round 3（最終収束確認）

対象 PR: #782 / ブランチ `issue/580/tag-merge-async-progress`
レビュー対象 commit: `4f5f8d55` → `c4eddb3b` → `72e2f7cc`（3コミットとも反映確認済み。`git log` head = `72e2f7cc`）
観点: Round 1（前進のみガード・index 削除・pageSize シーム・複数バッチ/失敗/outbox テスト）/ Round 2（NotFound・malformed JSON テスト）の収束確認、依存方向・UoW/outbox・認可・デコーダ網羅・OCC・命名規約の新規違反有無、AC-1〜AC-8 の実装＋テスト充足。

## 総評

**APPROVE 可。新規 Blocker・Warning なし。**

Round 2 で「PR head 未 push 起因の偽 Blocker」とされた全項目が、現 head（`72e2f7cc`）に確実に反映されていることをローカルコード直読で確認した。Round 2 の実体 Warning 2件（getTagMergeJob NotFound / malformed JSON）も `72e2f7cc` でテスト追加済み。`pnpm typecheck` クリーン。新規のリグレッション・規約逸脱は検出されなかった。

---

### Domain

#### Blockers
なし。

#### Warnings
なし。

#### Notes
- **[N-001]** 前進のみガード（Round 1 / review-001-domain W-001）は確実に反映。`recordProgress` が `processed < job.progress.processed` を `BusinessRuleError(InvalidProgress)` で拒否（`entity.ts:138-143`）。`total` は `job.progress.total` 再利用で再 seed しない。型ナローイング（`startProcessing` は Pending 限定、`recordProgress`/`complete` は Processing 限定、`fail` は Pending|Processing）も維持され、ADR-006 S-002 の no-reseed をコンパイル時に固定。
- **[N-002]** `reconstruct` の status 別不変条件（completed は completedAt 必須・error 禁止、failed は errorCode/errorReason/completedAt 必須）が網羅され、`RehydrationError` でラップ → adapter 側 `SystemError(DataIntegrityError)` 変換に正しく接続。illegal-states-unrepresentable が判別共用体で達成されている。

---

### Application

#### Blockers
なし。

#### Warnings
なし。

#### Notes
- **[N-001]** pageSize シーム（Round 1）反映確認。`RunTagMergeJobInput.pageSize?`（既定 `MERGE_NOTE_PAGE_SIZE=500`、`runTagMergeJob.ts:15-22,71`）。dispatch 経路（`dispatchDomainEvent.ts:252-256`）は未設定で `?? 500` に解決＝本番挙動不変。transport 境界を通らない内部シーム。
- **[N-002]** runner core 要件すべて充足: 事前スナップショット（`collectSourceNoteIds` をミューテーション前に読み切り `runTagMergeJob.ts:124-129,349-369`）、検査数カウント（no-op 含め `inspectedInBatch += 1` `:199`）、Pending/Processing 分岐（`:131-162`、再入で `total` 非再 seed `:148` + `baseProcessed=min(total,max(processed,total−remaining))` で前進のみ）、source 先行削除の冪等 complete（`finalize` catch を `isConflictError||isNotFoundError` に narrow `:269-271`、それ以外は rethrow）。
- **[N-003]** 認可・UoW/outbox 健全。`getTagMergeJob` は `findById` → `assertOwnedBy` 必須（`getTagMergeJob.ts:33-39`、NotFound を先に throw して機密漏洩前に遮断）。全 repo 操作・`collectEvents` が `unitOfWorkProvider.run` 内。`enqueueTagMergeJob` は source/target 存在・owner 一致・`computeMergePlan` を UoW 内事前検証し、冪等方針どおり重複ガードを置かない。
- **[N-004]** デコーダ網羅（ADR-008）反映確認。`eventRelayWorker.ts` で `AllDomainEvents` に `TagMergeJobEvent` 追加（`:73`）+ `...tagMergeJobEventDecoders` spread（`:96`）+ `satisfies DefaultEventDecoderRegistry`（`:100`）で網羅をコンパイル時強制。`dispatchDomainEvent.ts:252` に `tag.merge.requested` ケース配線。
- **[N-005]** ADR-010 の2維持判断（並走 note-save OCC は terminal failed / 認可 = Unauthorized 422）は Round 2 から変化なく、根拠（真の異常を隠さない非対称・列挙不可 UUIDv7・機密非返却）は妥当。蒸し返さない。

---

### Adapter / Infrastructure

#### Blockers
なし。

#### Warnings
なし。

#### Notes
- **[N-001]** index 削除（Round 1 / review-001-adapter W-001）反映確認。`idx_tag_merge_jobs_owner_status` は schema.ts・0021 SQL の双方から削除済み（`grep` で残存ゼロ）。残るのは `idx_tag_merge_jobs_updated_at`（将来 pruner 用、ADR-007 明文化、コメント付き）のみ＝非列挙設計と整合。
- **[N-002]** schema.ts ↔ 0021 SQL の相互整合維持。列・型・default・CHECK（`pending|processing|completed|failed`）・FK（`owner_id` cascade / `source_tag_id`・`target_tag_id` は FK なし opaque text = ADR-007-1）が一致。新規ドリフトなし。
- **[N-003]** OCC（`save`/`delete` の `addOcc` + `ConflictError`、`insert` は OCC なし `add`）、JSON ラウンドトリップ、`RehydrationError → SystemError(DataIntegrityError)` 変換が健全。

---

### Test

#### Blockers
なし。

#### Warnings
なし。

#### Notes
- **[N-001]** Round 1 で「未 push 偽 Blocker」とされた3テスト群がすべて存在:
  - AC-2 複数バッチ中間進捗（`tagMergeJob.integration.test.ts:154`、pageSize 2 × 5 ノート = 3 バッチ、中間 commit 観測）
  - AC-6 失敗パス（`:302`、runner 内例外 → `status==="failed"` + `errorCode==="tag_merge_run_failed"` を永続まで確認）
  - AC-1 outbox 発火（`tag.integration.test.ts:362`、`tag.merge.requested` を 1 件アサート + decoder で payload デコード検証）
- **[N-002]** Round 2 実体 Warning 2件も反映:
  - getTagMergeJob NotFound（`tagMergeJob.integration.test.ts:529`、`TAG_MERGE_JOB_NOT_FOUND`）
  - malformed JSON → DataIntegrityError（`tagMergeJobRepository.integration.test.ts:158-179`、壊れた `affected_note_ids_json` 行で `findById` が `SystemErrorCode.DataIntegrityError`）
- **[N-003]** 冪等再開（`:387` total 非再 seed・前進のみ）、twin source 先行削除の冪等 complete（`:446`、failed にならない）、IDOR ownership（`:490`）、dispatch ルーティング（`dispatchDomainEvent.test.ts:732`）を網羅。`docs/test.md` のレイヤー分割（unit/integration）に準拠。
- **[N-004]** 残見送り（adapter `delete`(OCC) 未カバー = pruner 据え置きで現状未使用）は ADR-007 で記録済み。蒸し返さない。

---

## 受け入れ基準 × 収束状況（Round 3）

| AC | 実装 | テスト | 収束 |
|---|---|---|---|
| AC-1 enqueue→outbox→relay デコード→dispatch→runner | ✓（デコーダ登録 ADR-008・dispatch 配線） | ✓（outbox 発火 + decoder + dispatch ルーティング） | 収束 |
| AC-2 進捗 n/total 逐次更新 | ✓（recordProgress 逐次 save） | ✓（複数バッチ中間 commit） | 収束 |
| AC-5 source 消滅・参照更新 | ✓（finalize source delete + replaceTags） | ✓（100% 到達 + source 削除） | 収束 |
| AC-6 失敗 → failed | ✓（catch → failJob） | ✓（failed + errorCode 永続） | 収束 |
| AC-7 既存グリーン + 新規ジョブ検証 | ✓ | ✓（typecheck クリーン） | 収束 |
| AC-8 IDOR（assertOwnedBy 必須） | ✓ | ✓（other-owner 拒否 + NotFound） | 収束 |

（AC-3/AC-4 はフロント観点のため本バックエンドレビュー対象外。供給側 `getTagMergeJob` は充足。）

## 結論

**APPROVE 可。** Round 1・2 の全指摘（前進のみガード・index 削除・pageSize シーム・複数バッチ/失敗/outbox テスト・NotFound/malformed JSON テスト）が現 head に確実に反映され、依存方向・UoW/outbox・認可・デコーダ網羅・OCC・命名規約に新規違反なし。AC-1〜AC-8 は実装＋テストで充足。新規 Blocker/Warning は無い。
