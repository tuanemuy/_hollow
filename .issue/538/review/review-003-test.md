# Review 003 — Test（テスト網羅性・テスト設計・モック戦略）

対象: PR #677（Issue #538）/ 照合先: `.issue/538/plan.md`「テスト方針」「受け入れ基準」、`.issue/538/adr.md`、`docs/test.md`
ラウンド: Round 3（ゼロベース・フルレビュー）

### Test

#### Blockers

なし

#### Warnings

なし

#### Notes

- **[N-001]** Round 2 [W-001]（バッジの世代カウンタ seq ガード未検証）は解消済み。`IngestionQueueBadge.test.tsx:221-269`「discards a stale earlier response that resolves after a newer one」が、手制御 Promise 2 本（old=count 1 / new=count 4）を notify 2 連発で in-flight にし、new を先に resolve → old を後で resolve → 最終 count が 4 のまま巻き戻らないことを固定する。実装の `seq`/`mySeq` ガード（`IngestionQueueBadge.tsx:29-40`）を単純な `setCount(next)` に退化させると old=1 で上書きされて落ちるため、回帰検知が効く。加えて「caps the visible count at 99+」（`:271-278`）も追加され、`count > 99 ? "99+" : count`（`IngestionQueueBadge.tsx:67`）の境界が固定された。

- **[N-002]** バッジのテスト網羅は十分。マウント取得・notify 再取得・visible 復帰再取得・hidden ガード・unmount 後の非発火（visibility/notify 双方）・取得失敗で非表示・成功後の失敗で 0 へリセット・seq ガード・99+ キャップ・aria-label 連動（`UploadButton.test.tsx` で本番配線）まで、ADR-002 / ADR-005-1 の振る舞いが正負両面で固定されている。`resetIngestionQueueBusForTest()` ＋ `setVisibility("visible")` の afterEach で実バス利用ファイルの residue / visibilityState リークが封じられている。

- **[N-003]** 旧フローのテスト削除は妥当。`UploadDialog.test.tsx` は waiting / editing / failed / timedOut / committed / queueGuidance / 180s ポーリング / transient リトライ系・`vi.useFakeTimers` を全廃し、select / uploading / queued の 3 ビューに対応するケースのみ残る。対応実装が diff で消えているため機能ごとの削除として整合（AC-1 の「View 型・POLL 定数・IngestionPreviewForm 使用の削除」を「fire-and-forget の 2 server-fn のみ mock（`:16-37`）」「再オープンで status region 無音化（`:320`）」で間接固定）。`IngestionPreviewForm.test.tsx` 据え置き・`IngestionQueue.test.tsx` 無改変も plan どおり。

- **[N-004]** `queueBadgeBus` 残留対策は健全。実バスを購読する経路は `IngestionQueueBadge.test.tsx`（afterEach で reset）と `UploadButton.test.tsx`（ただし `subscribeIngestionQueueChanged` を `() => () => {}` でモックし購読者を残さない）の 2 つのみ。他 4 ファイル（UploadDialog / UploadForm / IngestionJobRow / IngestionJobEditDialog）は `vi.mock("../queueBadgeBus")` で module-scope の `Set` に触れない。テスト間の購読者リークは構造上起き得ない。

- **[N-005]** integration への切り替えは規約（`docs/test.md`：リポジトリ fake を置かず usecase 振る舞いは実 D1 に寄せる）に忠実。`countActiveIngestionJobs.integration.test.ts` は 6 status 投入で包含（pending/processing/previewing）と除外（saved/failed/discarded）を一括検証し owner 越境・0 件を網羅。`ingestionJobRepository.integration.test.ts` は adapter レベルで status IN・owner スコープ・空 statuses・no-match の 4 ケース。usecase（actor スコープ）と adapter（owner スコープ）で責務が分かれ冗長ではない。ADR-003 の `failed` 除外は usecase のテスト（saved/failed/discarded を投入して count=3）と JSDoc（`countActiveIngestionJobs.ts:5-12`）の両方で根拠が残る。

- **[N-006]** 軽微（Round 1/2 から継続・未取り込み）: 空 statuses の adapter テスト名「resolves 0 for an empty statuses array **without querying**」（`ingestionJobRepository.integration.test.ts:114`）は戻り値 0 のみアサートし「DB に行かない（短絡）」ことは検証していない。実装の短絡（`statuses.length === 0` で早期 0 返し）の有無はこのテストでは判別不能で、名と実が乖離する。integration 層で db spy を張る価値は薄いので、テスト名を控えめ（「resolves 0 for an empty statuses array」）にする程度で名実一致する。優先度低。

- **[N-007]** 軽微（Round 1/2 から継続・未取り込み）: 編集ボタンの非表示テスト（`IngestionJobRow.test.tsx:178`）は failed / discarded の 2 負例のみ。実装条件が `status === "previewing"` の単一等価比較なので実害は薄いが、pending / saved のような「previewing でない別状態」を 1 つ足すと、条件が `!== "failed"` 等へ退化したときの取り違えも検知できる。優先度低。

- **[N-008]** AC とテストの対応に欠落なし。AC-1/AC-2（UploadDialog: queued 着地・待機 UI 不在・続けてアップロード再送信・単一でも invalidate+notify・単一失敗で非 notify）、AC-3/AC-4（IngestionJobRow 編集導線＋EditDialog の commit→navigate / discard・regenerate→notify+invalidate+close / conflict 1 ケース / ツリー lazy load・失敗フォールバック・initial focus）、AC-5（両アップロード経路 UploadDialog・UploadForm の notify、行アクション commit/discard/regenerate/retry の notify、バッジ表示/非表示/再取得）がいずれも正負で固定されている。EditDialog の regenerate ケースで「LLM 提案中の waiting コピーが出ない」負検証（`IngestionJobEditDialog.test.tsx:269-271`）が ADR-004 の waiting 撤去を回帰から守っている点も良い。
</content>
</invoke>
