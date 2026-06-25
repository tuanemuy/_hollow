# レビュー 002（Round 2 / 収束確認）— Domain + Application 層（Issue #580 / PR #782）

Round 1 修正コミット `c4eddb3b`（進捗不変条件・pageSize シーム・テスト拡充・ADR-009/010）反映後の収束確認。

対象: `app/core/domain/tag/mergeJob/{entity,valueObject,events,errorCode}.ts`、`app/core/application/tag/{runTagMergeJob,enqueueTagMergeJob,getTagMergeJob,mergeJobEventDecoders}.ts`、`app/core/application/workers/{dispatchDomainEvent,eventRelayWorker}.ts`、関連テスト。
参照: `.issue/580/{plan.md,adr.md}`（ADR-006 S-002/S-003・ADR-008・ADR-009・ADR-010）、`review-001-domain.md`（W-001）、`review-001-application.md`（W-001/W-002）。

---

### Domain

#### Blockers

なし。

#### Warnings

なし。

#### Notes

- **[N-001]** Round 1 の `recordProgress` 前進のみガードは設計どおり正しく、正常系を誤って弾かない（W-001 解消を確認）
  - 場所: `app/core/domain/tag/mergeJob/entity.ts:133-151`、テスト `__tests__/entity.test.ts:62-89`。
  - `processed < job.progress.processed` を `BusinessRuleError(InvalidProgress)` で拒否し、ADR-006 S-002 が核に据える「バー逆行 = illegal state」をドメインへ引き上げた。`total` 保持（`job.progress.total` 再利用）も従来どおり。逆行拒否・total 超過拒否・据え置き許容（3→3）の3ケースをテストが押さえ、review-001-domain W-001 の提案（テスト明文化含む）を満たす。エラーコードは既存 `InvalidProgress` 定数を再利用（命名規約・`errorCodeNaming.test.ts` カバー済み、メッセージのみ差替えで規約逸脱なし）。過剰修正ではなく最小・妥当。

- **[N-002]** ガードは runner の `processed = baseProcessed + inspected` 算出・複数バッチ・冪等再開と矛盾しない
  - 単一 run 内では `found.entity.progress.processed` は直前バッチが保存した値（単調増加）で、`processedSoFar = min(total, baseProcessed + inspected + inspectedInBatch)` は常にそれ以上。再入時も `baseProcessed = min(total, max(progress.processed, total − remaining))` で永続 `processed` 以上から開始するため、ガードが正常系を throw する経路は無い。同一 jobId の並走は relay の lease（行単位クレーム）で排他され、twin ジョブは別行のため `recordProgress` が跨いで逆行することもない。よって Round 1 ガードは新規の失敗モードを導入していない。

- **[N-003]** 型ナローイング（`startProcessing` は Pending 限定 / `recordProgress`・`complete` は Processing 限定 / `fail` は Pending|Processing）は維持され、ADR-006 S-002 の no-reseed をコンパイル時に固定（review-001-domain N-001 の白眉が後退していないことを確認）。

---

### Application

#### Blockers

なし。

#### Warnings

なし。

#### Notes

- **[N-001]** `pageSize` シームは本番挙動を変えていない（収束確認）
  - 場所: `runTagMergeJob.ts:15-22,71`、dispatch 経路 `dispatchDomainEvent.ts:252-256`。
  - dispatch 側は `runTagMergeJob({ container, input: { jobId } })` で `pageSize` 未設定 → `input.pageSize ?? MERGE_NOTE_PAGE_SIZE`(500) に解決。本番のバッチ挙動は従来と完全同一。テストのみ `pageSize: 2` で複数バッチ・再開経路を駆動（`tagMergeJob.integration.test.ts:198-299`）。`pageSize?` は内部ディスパッチ専用の seam で、transport 境界を通らない（CLAUDE.md「`serverData` は internal-only / schemaless」と整合）。注入位置・既定値とも妥当。

- **[N-002]** `pageSize` 境界の理論的フットガン（非到達・非ブロッカー）
  - `pageSize=0` の場合 `for (i += pageSize)` は `workIds` が非空なら無限ループになりうるが、`collectSourceNoteIds` が `limit:0` で先に空集合化する（多くのドライバで0件）ため実害化しにくい。巨大値は単一バッチに畳まれ正常。いずれも本番・テストのどの経路からも渡されず（テストは2固定・dispatch は未設定）、到達不能。防御的に `Math.max(1, pageSize)` で固める余地はあるが、seam がテスト専用に限定されている現状では over-engineering 寄り。情報として記録のみ。

- **[N-003]** runner の core 要件は Round 1 後も全て充足（再確認）
  - 事前スナップショット（`collectSourceNoteIds` をミューテーション前に読み切り固定リスト処理、`runTagMergeJob.ts:108-129,349-369`）、検査数カウント（no-op 含め `inspectedInBatch += 1`、`:199`）、Pending/Processing 分岐（`:131-162`）、total 非再 seed（Processing 分岐で `job.progress.total` 保持、`:148`）、source 先行削除の冪等 complete（`finalize` の `isConflictError||isNotFoundError` → `completeWithoutSourceDelete`、`:265-273`）。multi-batch・crash-resume の integration テストが forward-only・total 保持・100% 到達を裏取り（`:205-218,289-298`）。

- **[N-004]** 認可・デコーダ網羅・UoW/outbox 規約は健全
  - `getTagMergeJob` は `assertOwnedBy` 必須で機密データ漏洩前に throw（`getTagMergeJob.ts:39`）。`enqueueTagMergeJob` は source/target 存在・owner 一致・`computeMergePlan` を UoW 内で事前検証し、冪等方針どおり重複ガードは置かない（`enqueueTagMergeJob.ts:40-66`）。ADR-008 のデコーダ登録は `AllDomainEvents` に `TagMergeJobEvent` 追加 + `...tagMergeJobEventDecoders` spread + `satisfies DefaultEventDecoderRegistry` で網羅をコンパイル時強制（`eventRelayWorker.ts:73,96,100`）+ 回帰テスト。全 repo 操作・`collectEvents` が `unitOfWorkProvider.run` 内。

- **[N-005]** review-001-application W-001/W-002 は ADR-010 で妥当に記録・維持（収束確認）
  - W-001（並走 note-save OCC は terminal `failed`／source-delete のみ冪等寛容の非対称）: ADR-010-1 + ADR-007#3 で「真の異常を握り潰さないための意図的非対称・低確率経路」と明記。`finalize` の catch は `isConflictError||isNotFoundError` に narrow され else は rethrow（`runTagMergeJob.ts:265-273`）で、握り潰しの過剰拡大は無い。
  - W-002（`getTagMergeJob` 他オーナー拒否 = `BusinessRuleError(Unauthorized)`→422、404/422 存在オラクル）: ADR-010-2 で「`getExportJob` と完全同形・jobId は UUIDv7 で列挙不可・機密データ非返却」を根拠に export との一貫性優先で維持。いずれも Round 2 で新たに格上げすべき事情なし。

- **[N-006]** Round 1 のアダプター index 削除はアプリ設計と整合（参考）
  - `idx_tag_merge_jobs_owner_status` 削除は、リポジトリが PK(`id`) クエリのみで owner+status 列挙を一切行わない（`tagMergeJobRepository.ts`）非列挙設計（ADR-002/004・review-001-domain N-008）と一致するデッドインデックス除去。getTagMergeJob/poller の経路に regression なし。

---

## サマリ

Round 1 で入った2つの関連修正はいずれも妥当で、過剰修正・リグレッションは検出されなかった。

- **domain（`recordProgress` 前進のみガード）**: ADR-006 S-002 の「バー逆行禁止」を illegal-state-unrepresentable としてドメインに正しく固定。単一 run の単調性・`max(processed, total−remaining)` 再開算出・lease による同一ジョブ排他・twin の別行性により、**正常系・複数バッチ・冪等再開のいずれも誤って弾かない**。逆行/超過拒否のテストも追加済み（review-001-domain W-001 完全解消）。
- **application（`pageSize` シーム）**: dispatch 経路は未設定で `?? 500` に解決され**本番挙動は不変**。境界（0/巨大値）は到達不能ないし正常で破綻しない。
- runner core 要件（事前スナップショット・検査数カウント・Pending/Processing 分岐・total 非再 seed・source 先行削除の冪等 complete）、認可（`assertOwnedBy`）、デコーダ網羅（`satisfies`）、UoW/outbox 規約はすべて Round 1 後も充足。
- 見送った App W-001（並走 note-save OCC）/ W-002（認可エラーコード）は ADR-010 に根拠付きで記録され、export 同形・低確率・無情報の整理は妥当。

**Domain / Application とも新規 Blocker・Warning なし。収束と判断する。**
