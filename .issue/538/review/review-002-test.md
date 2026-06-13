# Review 002 — Test（テスト網羅性・テスト設計・モック戦略）

対象: PR #677（Issue #538）/ 照合先: `.issue/538/plan.md`「テスト方針」「受け入れ基準」、`.issue/538/adr.md`、`docs/test.md`
ラウンド: Round 2（ゼロベース・フルレビュー）

### Test

#### Blockers

なし

#### Warnings

- **[W-001]** バッジ取得の「世代カウンタ（seq）による古いレスポンス破棄」がテストされていない
  / 場所: `app/components/ingestion/IngestionQueueBadge.tsx:27-40`（`seq` / `mySeq` ガード）、テスト不在は `__tests__/IngestionQueueBadge.test.tsx`
  / 理由: 実装には明示的なコメント付きで「rapid notify で先行リクエストが後発より遅く解決した場合、最新の in-flight のみが書き込む」ための単調増加 seq ガードが入っている（バッチアップロード・連続行アクションで実際に起きるレース）。これは正しさに直結する非自明なロジックだが、現状のテストは notify を 1 回ずつ順番に解決する happy path しか踏まず、`refresh` を `getCountMock` の解決順を入れ替えて 2 回連発し「先に投げた古い count（例: 1）が後から解決しても、後に投げた新しい count（例: 4）を上書きしない」ことを固定するケースがない。seq ガードを丸ごと外して単純な `setCount(next)` に退化させても全テストが green のまま通る（=回帰検知できない）。`getCountMock` は手制御 Promise（UploadDialog の `resolveUpload` パターン）で順序を反転できるので書ける。
  / 提案: `getCountMock` を 2 本の手制御 Promise（1 本目=遅延・count 1、2 本目=即時・count 4）にし、notify を 2 連発 → 2 本目を先に resolve → 1 本目を後で resolve → 最終 count が 4 のまま（1 に巻き戻らない）ことを 1 ケース固定する。

#### Notes

- **[N-001]** Round 1 の 4 Warning はすべて確実に解消されている。(W-001) visibilitychange は `IngestionQueueBadge.test.tsx:134-186` で visible 復帰再取得・hidden ガード・unmount 後の非発火の 3 ケースが追加され、`document.dispatchEvent(new Event("visibilitychange"))` ＋ `visibilityState` スタブの確立パターンに乗っている。(W-002) 行アクション notify は同 `IngestionJobRow.test.tsx` に discard（`:222`）・regenerate（`:247`）・retry（`:322` で `notifyMock` 追加）が個別に固定され、commit 1 組だけだった穴が埋まった。(W-003) 実物 `UploadButton` の配線は新規 `UploadButton.test.tsx` が直接 render し count>0 で aria-label が「アップロード（未処理 N 件）」・チップ描画、0 件で素ラベル・非表示を実体側で固定。ハーネス複製ではなく本番コンポーネントを検証している。(W-004) 取得失敗リセットは `IngestionQueueBadge.test.tsx:200-217`「resets the count to 0 when a refresh fails after a prior success」で「成功（3）→ notify → 失敗 → 0（非表示）」を仕様として固定し、実装 JSDoc（`:11-17`）にも「even when a previous fetch succeeded」と一文で根拠が残った。指摘が形式的でなく挙動として固定されている。

- **[N-002]** 旧フローのテスト削除は引き続き正当。`UploadDialog.test.tsx` は waiting / editing / failed / timedOut / committed / queueGuidance / 180s ポーリング / transient リトライ系を全廃し、`vi.useFakeTimers` 依存も撤去。残った 17 ケースは select / uploading / queued の 3 ビューに対応し、対応実装が diff で消えているため機能ごとの削除として整合。`IngestionPreviewForm.test.tsx` 据え置き・`IngestionQueue.test.tsx` 無改変も plan どおり。

- **[N-003]** `queueBadgeBus` のテスト間残留対策は機能している。実バスを使う唯一のファイル（`IngestionQueueBadge.test.tsx`）が `afterEach` で `resetIngestionQueueBusForTest()` ＋ `setVisibility("visible")` を呼び（visibilityState スタブのリークも戻している点が丁寧）、他 4 ファイル（UploadDialog / UploadForm / IngestionJobRow / IngestionJobEditDialog）は `vi.mock("../queueBadgeBus")` で module-scope の Set に触れない。`UploadButton.test.tsx` も実バスを使うが、`subscribeIngestionQueueChanged` を `() => () => {}` でモックしているため購読者を残さない。residue が起き得ない構成。

- **[N-004]** `IngestionJobEditDialog.test.tsx` は plan テスト方針の全項目（ツリー lazy load・閉時非取得・initial focus・commit→notify→navigate・discard/regenerate→notify+invalidate+close・conflict 1 ケース・ツリー失敗でもフォーム使用可）を満たす。加えて regenerate ケース（`:249-272`）で「再生成後に LLM 提案中の waiting コピーが出ない」という fire-and-forget の負の検証まで押さえており、ADR-004 の方針転換（waiting 撤去）を回帰から守れている。conflict は notFound で onClose/notify/navigate がいずれも呼ばれずダイアログが開いたまま alert 表示（`:274-300`）で「複数タブ並行操作」リスク項目に対応。

- **[N-005]** integration への切り替えは引き続き規約に忠実。`countActiveIngestionJobs.integration.test.ts` は status 集合の包含（pending/processing/previewing）・除外（saved/failed/discarded）を 6 status 投入で一括検証し、owner 越境・0 件を網羅。`ingestionJobRepository.integration.test.ts` は adapter レベルで status IN・owner スコープ・空 statuses・no-match の 4 ケース。usecase（actor スコープ）と adapter（owner スコープ）で重複しつつ責務が分かれており冗長ではない。`docs/test.md`「usecase の振る舞いは integration に寄せる／リポジトリ fake を置かない」と整合。

- **[N-006]** 軽微（Round 1 N-006 の継続）: 空 statuses の adapter テスト「resolves 0 for an empty statuses array **without querying**」（`ingestionJobRepository.integration.test.ts:114`）は、実装側に短絡（`:413-414` `if (opts.statuses.length === 0) return Promise.resolve(0)`）が確かに入った一方、テストは戻り値 0 のみアサートし「DB に行かない」ことは検証していない（行を 1 件 seed して 0 が返ることで間接的に「IN フィルタが空 → 全件除外」と区別はつくが、短絡の有無は判別できない）。integration 層で db spy まで張る価値は薄く現状で許容範囲だが、テスト名が短絡の存在を主張しているので、(a) `db.select` を spy して未呼び出しをアサートするか、(b) 名前を控えめにする（「resolves 0 for an empty statuses array」）のどちらかにすると名実が一致する。

- **[N-007]** 軽微（Round 1 N-007 の継続）: 編集ボタンの非表示テスト（`IngestionJobRow.test.tsx:178`）は failed / discarded の 2 負例のみで、pending / processing / saved の負例がない。実装条件が `status === "previewing"` の単一等価比較なので実害は薄いが、「previewing でのみ表示」を謳うなら pending（＝アクション群が出る別の非 previewing 状態）を 1 つ足すと、条件が `!== "failed"` 等に退化したときの取り違えも検知できる。Round 1 で提案済みだが未取り込み。優先度は低い。

- **[N-008]** `UploadDialog.test.tsx` は AC-1/AC-2 を検証可能な粒度で固定: queued ビューでの `button[disabled]` ゼロ件（待機 UI 不在）、続けてアップロード後の即時再送信、単一でも invalidate＋notify が各 1 回（旧実装は複数のみだった差分の固定）、単一失敗時に notify/invalidate が呼ばれない負の検証、uploading→queued の status region 追跡、カスタムプロンプトの続けてアップロード跨ぎ保持。AC の合格条件文言（View 型・ポーリング定数・IngestionPreviewForm 使用の不在）に対応する正・負の固定が揃っている。
