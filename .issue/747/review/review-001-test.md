# PR #759 レビュー — Test 観点

対象 PR: #759 / Issue #747（`processed_events` 刈り込み経路の新設）
レビュー視点: テストのカバレッジ網羅性・エッジケース・モック戦略・脆さ・アサーション品質
日付: 2026-06-18

---

## サマリー判定

計画（`plan.md` テスト方針 / `testing.md`）が掲げる3層（unit / adapter integration / handler integration）は実装されており、各 AC に対応する観測点はおおむねカバーされている。特に AC-3 の **strictly-before 境界**（cutoff ちょうどの行を保持）が adapter integration で明示検証されている点、AC-4 の **戻り値 rename 非回帰**（既存 outbox テストを `outboxDeleted` に更新しつつ削除件数・条件が不変であること）が保たれている点は良い。DB 隔離は `setup.ts` の `beforeEach` TRUNCATE（`processed_events` / `outbox_events` 両方を含む）で担保されており、固定 ID・固定日付による行カットオーバーの脆さは無い。

ただし、本 PR が **新規に導入した best-effort try/catch 経路**（`pruneProcessedEvents` 失敗時に `processedEventsDeleted=0` を返し error ログを出す）が一切テストされていない。これは `testing.md` の「エッジケース・異常系」やコメント（handlers.ts の「A swallowed processed-events failure surfaces as a `0` count」）が明示的に主張する不変条件であり、観測点の欠落としては最も重い。Blocker ではなく Warning に留めるのは、既存の activity-log prune の同型 try/catch も未テストで、本 PR がそのパターンを踏襲しているため（新規退行ではなく既存ギャップの拡張）。

---

### Test

#### Blockers

なし

#### Warnings

- **[W-001]** best-effort 失敗経路（`processedEventsDeleted=0` を返す swallow）が未テスト
  - 場所: `app/worker/cloudflare/handlers.ts:88-98`（新規 `try/catch`）に対し `app/worker/cloudflare/__tests__/handlers.integration.test.ts:256-337` のいずれのケースもこの分岐を踏まない。
  - 理由: 本 PR は `runPruneTick` に「outbox prune はスローし得る／processed-events prune と activity prune は best-effort で swallow し `0` を返す」という**新しい不変条件**を導入した。handlers.ts の JSDoc（L66-70）と `testing.md`「エッジケース・異常系 2. DB エラー時の翻訳」がこの挙動を明示的な契約として謳っているのに、それを検証するテストが無い。`pruneProcessedEvents` が throw したとき (a) outbox の削除件数は保持される、(b) `processedEventsDeleted` が `0` になる、(c) error ログが1件出る、(d) tick 全体は throw しない、という4点が回帰検出できない。`prunerEnv()` は実 D1 を使うため throw を仕込みづらいが、unit 層（`pruneProcessedEvents.test.ts`）で `pruneProcessed` が reject する stub を渡せば worker が例外を伝播することは確認でき、handler 層は `createWorkerContainer` を差し替えるか、`override` 経由で注入できる stub があれば検証可能。最低でも unit 層で「adapter が reject したら `pruneProcessedEvents` も reject する（= handler 側で catch される前提が成り立つ）」を1ケース足すべき。
  - 提案: unit テストに「`pruneProcessed` が reject → `pruneProcessedEvents` も reject し、部分的なログを残さない（あるいは残す）」契約を1ケース追加。可能なら handler integration で、processed-events prune だけを失敗させて `{ outboxDeleted: 1, processedEventsDeleted: 0 }` と error ログを検証するケースを追加（注入経路が無ければ `runPruneTick` に processed-events 用の override を足すか、本 PR スコープ外として `testing.md` に「未自動化・手動 or 別Issue」と明記）。

- **[W-002]** activity prune と processed-events prune の**独立性**が未検証
  - 場所: `handlers.ts:88-103`（processed-events catch → activity catch の順次実行）。
  - 理由: 計画の依頼事項に「activity prune 失敗との独立性はテストされているか？」が含まれる。現状、processed-events prune が失敗しても activity prune が実行される（=片方の失敗が他方を巻き込まない）ことを示すテストが無い。両 catch が独立に並ぶ実装は正しいが、将来 catch を1つに統合する等のリファクタで「片方の失敗が後続を飛ばす」退行が入っても検出できない。
  - 提案: W-001 と併せて、processed-events prune が throw しても activity prune が呼ばれ tick が `0` 件で正常終了することを1ケースで担保する（モック注入が前提）。コストが高ければ Note 降格で可。

- **[W-003]** unit テストの cutoff 計算で 14日 retention を使うが、`DEFAULT_PROCESSED_EVENTS_RETENTION_MS` を直接参照していない
  - 場所: `app/core/application/workers/__tests__/pruneProcessedEvents.test.ts:854`（`const retentionMs = 14 * 24 * 60 * 60 * 1000;`）。
  - 理由: マジックナンバーを再記述しているため、`DEFAULT_PROCESSED_EVENTS_RETENTION_MS` の値が将来変わっても unit テストは追従せず、定数とテストが乖離しても気付けない。AC-1 の「既定値が14日（CF 上限）」という不変条件を pin したいなら、export 済みの定数を import して `expect(DEFAULT_PROCESSED_EVENTS_RETENTION_MS).toBe(14 * 24 * 60 * 60 * 1000)` のような明示アサーション、または cutoff 計算ケースで定数を渡す方が堅い。`serverCloudflare.test.ts` は定数を import して default を検証しており（良い）、unit 側だけリテラル直書きで非対称。
  - 提案: cutoff 計算ケースの `retentionMs` を `DEFAULT_PROCESSED_EVENTS_RETENTION_MS` 由来にするか、定数値そのものを1行で pin するテストを足す。

#### Notes

- **[N-001]** adapter integration の strictly-before 境界検証は良質。`app/core/adapters/d1/__tests__/idempotencyStore.integration.test.ts:99-131` で cutoff ちょうど（`onCutoff`）の行が保持されることを `deleted=1` と残存 ID 集合の両面で検証しており、`lt`（`<`）の境界仕様（AC-3「cutoff 以降は削除しない」）を意味あるレベルで pin している。`deleted=0` ケースも別 it で分離されていて網羅的。

- **[N-002]** モック戦略は妥当。各既存テストの inline `idempotencyStore` モックに `pruneProcessed: vi.fn(async () => ({ deleted: 0 }))` を追加した変更（`inlineRelayTrigger` / `consumeIndexJob` / `handleEvents` / `outboxPrune` / `processIndexJobs` の各 makeContainer）は、ポート拡張に伴う型充足のための最小変更で正しい。stub の戻り値 `{ deleted: 0 }` は当該テストで観測されないため現実的な値で問題ない。`serverCloudflare` のインライン mock（`inlineRelayTrigger.test.ts:41,82`）への追加も `serverData` 経由ではなくモジュール export 識別の文脈で整合。

- **[N-003]** unit テストの stub `makeStubIdempotencyStore` に `pruneSpy` を仕込んで「adapter に渡る `Date` のインスタンスと値」を直接アサート（`received?.getTime()` === `now - retentionMs`）している設計は、`outboxPrune.test.ts` と対称で、worker が薄いオーケストレータである契約（cutoff を一度だけ計算して転送）を的確に pin している。ログアサーション（`/pruned 5/` + `meta.deleted/retentionMs/cutoff`）も実装の message・meta 形と一致しており偽陽性リスクは低い。

- **[N-004]** handler integration の固定 ID（`0193e7d0-9001…` 等）は `beforeEach` の TRUNCATE で毎テスト初期化されるため衝突しない。`nextEventId()`（カウンタ採番）系とは別の固定リテラルを使っているが、テーブルが空になる前提なので問題なし。ただし他テストが将来同じリテラル ID を別テーブルへ使い回す場合に備え、採番ヘルパへ寄せると一貫性が増す（必須ではない）。

- **[N-005]** `serverCloudflare.test.ts` の `readPruneTuning` 拡充（default 両方・両 var 数値強制・独立 default・0/非数値 reject を outbox/processed 両方で）は env var 上書き経路の境界を網羅しており、AC-1 の「env var で上書きできる」を DI 層で十分に担保している。`PROCESSED_EVENTS_RETENTION_MS` 単独設定時に outbox が default に落ちる対称ケースは無いが（outbox 単独設定の逆方向のみ）、`pruneTuningSchema` の構造上リスクは低く Note 止まり。

- **[N-006]** `testing.md` の「2. DB エラー時の翻訳」は「コードで確認」と記すのみで自動テストを伴わない。`mapDbError` ラップ自体は他 adapter テストで間接的にカバーされる前提だが、W-001 の swallow 経路と合わせ「失敗系は手動確認に委ねている」点は明示されているので透明性はある。
