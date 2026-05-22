# PR Review #001 — feat(issue-145): wire note.* / publication.* dispatch and IndexJob drainer

**PR:** #156
**Date:** 2026-05-23
**Round:** 1回目

---

## Summary

- Blockers: 1
- Warnings: 11（重複統合後）
- Notes: 多数
- Verdict: **BLOCKED → 全 12 件修正対応済み（次ラウンドで再確認）**

レビューは 5 視点（Application / Domain・Adapter / Infrastructure / Test / Spec・Docs）の並列実施。

---

## Application

### Blockers
なし

### Warnings

- **[W-A-001]** integration テスト名「skips note.trashed dispatch (regression guard)」が新仕様と矛盾
  - 場所: `app/worker/cloudflare/__tests__/handlers.integration.test.ts:563`
  - 理由: 本 PR で `note.trashed` は dispatch 表に追加され handled になる。テスト自体は ack/stamp の存在しか検証していないため新仕様でも偶然 PASS するが、テスト名と意図がコードと完全に乖離。
  - 提案: テスト名を「handles note.trashed dispatch (search delete + publication cascade) — stamp is recorded」等に変更し、コメントも更新。

- **[W-A-002]** `processIndexJobs` の per-row catch の `retried` カウンタが misleading
  - 場所: `app/core/application/workers/processIndexJobs.ts:64-80`
  - 理由: 外側 catch に到達するのは `consumeIndexJob` が想定外に throw した場合のみ。この場合 `fail` も呼ばれていないため attempts は据え置きで次 tick で同じ行が再選択される。これを `retried` と集計するのは operator にとってミスリーディング。
  - 提案: 外側 catch では別カウンタか、`logger.error` の構造に "uncountered" 等のタグを入れて識別可能にする。

- **[W-A-003]** `batch.length < batchSize` の short-circuit コメント不足
  - 場所: `app/core/application/workers/processIndexJobs.ts:83`
  - 理由: nextBatch は claim/lease 系で並走 worker がいる場合 batch.length < batchSize でもテーブルには pending 行が残る。コメントなしだと「テーブル空」と誤読されやすい。
  - 提案: コメントを `// Short-circuit: smaller batch implies either drain or a concurrent worker claimed the remainder.` 等に明示。

### Notes
- ConsumerContainer の Pick 設計が types.ts コメントで明文化されており意図が読み取りやすい
- ADR-007 trashed status guard が 3 段判定として綺麗に実装されている
- fan-out 順序固定が JSDoc で説明されている
- CONSUME_INDEX_JOB_MAX_ATTEMPTS の DRY 配線で SSOT 維持
- readIndexerTuning が zod パターンで他 tuning と一貫

---

## Domain・Adapter

### Blockers
なし

### Warnings

- **[W-DA-001]** spec/domains/search.md の `nextBatch` シグネチャが旧形のまま（**W-S-002 と統合**）
  - 場所: `spec/domains/search.md:97`
  - 理由: 本 PR で第 3 引数 `maxAttempts: number` を追加したが spec の port セクションだけ取りこぼされている。
  - 提案: `nextBatch(limit: number, now: Instant, maxAttempts: number): Promise<IndexJob[]>` に更新し、DLQ 行除外について注記。

- **[W-DA-002]** D1 アダプタの nextBatch に対する直接 integration test がない（**W-T-003 と統合**）
  - 場所: `app/core/adapters/d1/__tests__/`（`indexJobRepository.integration.test.ts` 不在）
  - 理由: `attempts < maxAttempts` 二重ガードは本 Issue の DLQ 運用の核だが、adapter 単体の境界条件は検証されていない。
  - 提案: `indexJobRepository.integration.test.ts` を新設。`attempts=maxAttempts-1` 行が pick → attempts=maxAttempts → 次 nextBatch で除外、既存 `attempts=maxAttempts` 行が pick されない、`maxAttempts <= 0` で空配列、の最低 3 シナリオ。

### Notes
- 「defense in depth」設計が JSDoc で明示
- ADR-006 への参照が JSDoc に明記
- CONSUME_INDEX_JOB_MAX_ATTEMPTS の参照経路が SSOT
- mapDbError による error mapping は全メソッドで維持
- IndexJob entity / IndexJobAttempts は変更不要

---

## Infrastructure

### Blockers
なし

### Warnings

- **[W-I-001]** `docs/runtime_cloudflare.md` のワーカー数表現が古いまま
  - 場所: `docs/runtime_cloudflare.md:32`
  - 理由: 「The main app and **four** sibling Workers」と書かれているが、本 PR で indexer が追加されて **5** つになっている。Worker matrix テーブルは正しく更新されているがリード文だけ取り残されている。
  - 提案: 「The main app and **five** sibling Workers ...」に修正。

- **[W-I-002]** `infra/src/secrets.ts` の indexer の `shared` のみ設定の根拠説明不足
  - 場所: `infra/src/secrets.ts:70-78`
  - 理由: indexer は Better Auth / Google OAuth を読まないため "parity" のみで shared を含めている運用。relay / pruner / dlq と同様だが、indexer 追加時にこの根拠が説明されていないと将来の secrets 整理時の判断材料が薄くなる。
  - 提案: ADR-007 (#110) の "documentation-only until per-worker filtering lands" 記述を参照するコメントを追加。

### Notes
- indexer.ts が relay / pruner と完全に対称
- runIndexJobTick のロギングが運用観点で適切
- readIndexerTuning が zod の coerce.number().int().positive() で一貫
- wrangler.toml [env.indexer] のバインディング最小化（D1 のみ）
- deploy:*:all の順序が docs の deploy ordering と整合
- WORKER_INDEXER の renderWrangler 注入が一貫

---

## Test

### Blockers
なし

### Warnings

- **[W-T-001]** `processIndexJobs.test.ts` に DLQ outcome カウントの直接検証がない
  - 場所: `app/core/application/workers/__tests__/processIndexJobs.test.ts`
  - 理由: `processIndexJobs.ts:69` の `else dlq += 1;` を踏むケースが unit test に存在しない。
  - 提案: `searchIndex.upsert` で非 transient エラーを throw して `consumeIndexJob` が dlq 判定する経路を 1 ケース追加し、`result.dlq` が正しいことを検証。

- **[W-T-002]** `processIndexJobs.test.ts` の「per-row try/catch tolerance」が未検証
  - 場所: `app/core/application/workers/__tests__/processIndexJobs.test.ts`
  - 理由: 外側 catch 分岐（consumeIndexJob が想定外に throw した場合のフォールバック）が未テスト。
  - 提案: `consumeIndexJob` を vi.mock して 2 jobs ある batch の 1 件目だけ throw するケースを追加。後続 row が drain 続行し `logger.error` が呼ばれることを確認。

- **[W-T-003]** D1 adapter nextBatch の maxAttempts フィルタを実 D1 に対して検証する integration test がない（**W-DA-002 と統合**）

### Notes
- dispatchDomainEvent.test.ts の網羅性が plan ステップ 2 のチェックリストとほぼ完全に対応
- モック戦略がクリーン（unitOfWorkProvider.run の fake、findByIdResult per-test 切替）
- Note 不在 / trashed / empty snapshots の 3 ケースを別 it に分離
- integration test の UUID shape が既存 describe block と衝突しない
- batch 短絡パスと maxBatches 打ち切りのテストが flake 対策として堅実
- ADR-007 E2E が integration test に含まれる
- 既存 search ユニットテストへの影響なし

---

## Spec・Docs

### Blockers

- **[B-S-001]** `spec/domains/index.md` の event 購読表が壊れている
  - 場所: `spec/domains/index.md:66-69`
  - 理由: ヘッダーが 4 列（`イベント | 物理 event 名 | 発火元 usecase | 購読する usecase / ドメイン`）になったが、`media.uploaded` / `user.deleted` / `tag.deleted` / `directory.deleted` の 4 行は 3 セルしかない。Markdown では発火元の値が「物理 event 名」列にずれて表示され、購読側の情報が消える。
  - 提案: 4 行とも「物理 event 名」セルを `\| \`<同名>\` \|` で埋める。例: `\| \`media.uploaded\` \| \`media.uploaded\` \| Media.UploadMedia/FinalizeUpload \| Media 自身の TTL ベース孤児監視 \|`

### Warnings

- **[W-S-001]** `spec/domains/search.md:50` の旧記述が PR 修正と矛盾
  - 場所: `spec/domains/search.md:50`
  - 理由: 「NoteSnapshot は Note ドメイン側のユースケースが Outbox イベントとして発火し」と書かれているが、line 109 では「event payload には NoteSnapshot を含めず dispatcher が再構築」と明示。同じファイル内で両立している状態。
  - 提案: line 50 を書き直すか line 109 に統合。

- **[W-S-002]** spec/domains/search.md の nextBatch シグネチャ表記が旧形（**W-DA-001 と重複**）

- **[W-S-003]** DLQ recovery のサンプル D1 名が他箇所と不整合
  - 場所: `docs/runtime_cloudflare.md:197, 201`
  - 理由: PR で `hollow-staging-d1` を使っているが、line 81 では `tanstack-start-template-d1-staging`。実体は `${appName}-${stage}-d1` 形式（`hollow-staging-d1` が正しい）だが、表記混在で運用者混乱。
  - 提案: 新規追加箇所を `<your-d1-database-name>` プレースホルダにするか、「Pulumi が生成する `<appName>-<stage>-d1`（例: `hollow-staging-d1`）」と注記。

- **[W-S-004]** `INDEXER_BATCH_SIZE` / `INDEXER_MAX_BATCHES` の docs 説明不足
  - 場所: `docs/runtime_cloudflare.md`（Secrets and vars 周辺、または Worker matrix）
  - 理由: 新規導入したチューニング変数が docs で説明されていない。OUTBOX 系は説明あり。
  - 提案: 「The indexer tuning variables (`INDEXER_BATCH_SIZE`, `INDEXER_MAX_BATCHES`) live in `[vars]` and are parsed by `readIndexerTuning`. Unset values fall back to the defaults in `app/core/application/workers/processIndexJobs.ts`.」のように 1 行追加。

### Notes
- spec/usecases/search.md の修正が ADR-004 方針に忠実
- deploy 順序節が運用観点で過不足ない
- DLQ 運用節の SQL 例が具体的
- Worker matrix / Cron triggers / Deployment スクリプト一覧の三箇所に indexer 行追加

---

## Design Decisions

このラウンドで見つかった新規設計判断は特になし。既存の ADR-001〜007 で説明されている。

W-A-002（`retried` カウンタの命名）は将来の operator UX に関わるが、ADR 化するほどの設計判断ではなく、ロギング詳細の改善で対応する。

---

## 統合後の修正対象一覧

11 個の Warning + 1 個の Blocker。重複を統合した順序:

1. **B-S-001**: `spec/domains/index.md` の event 購読表セル数修正（最優先）
2. **W-S-001**: `spec/domains/search.md:50` の NoteSnapshot 説明書き直し
3. **W-DA-001 = W-S-002**: `spec/domains/search.md:97` の nextBatch シグネチャ更新
4. **W-S-003**: DLQ recovery のサンプル D1 名修正（プレースホルダ化）
5. **W-S-004**: INDEXER_* tuning vars の docs 説明追加
6. **W-I-001**: docs/runtime_cloudflare.md の "four sibling Workers" → "five"
7. **W-I-002**: infra/src/secrets.ts の indexer コメント補足
8. **W-A-001**: integration test 名修正（"skips" → "handles"）
9. **W-A-002**: processIndexJobs の per-row catch カウンタ命名改善
10. **W-A-003**: batch short-circuit コメント追加
11. **W-T-001**: processIndexJobs.test.ts に dlq outcome テスト追加
12. **W-T-002**: processIndexJobs.test.ts に per-row tolerance テスト追加
13. **W-DA-002 = W-T-003**: indexJobRepository.integration.test.ts 新設

全て修正対象として着手する。
