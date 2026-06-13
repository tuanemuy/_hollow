# Review 001 — Test（テスト網羅性・テスト設計・モック戦略）

対象: PR #677（Issue #538）/ 照合先: `.issue/538/plan.md`「テスト方針」「受け入れ基準」、`.issue/538/adr.md`、`docs/test.md`

### Test

#### Blockers

なし

#### Warnings

- **[W-001]** バッジの「visible 復帰時に再取得」経路が自動テストでカバーされていない
  / 場所: `app/components/ingestion/__tests__/IngestionQueueBadge.test.tsx`（テスト不在）、実装は `app/components/ingestion/IngestionQueueBadge.tsx:34-37`
  / 理由: plan テスト方針は `IngestionQueueBadge` の検証項目を「notify で再取得」までしか挙げていないが、AC-5 と ADR-002 の更新トリガーは「マウント時＋visibilitychange（visible 復帰）＋notify」の 3 本柱で、visibilitychange はそのうち常時ポーリング不採用の代償を払う唯一のバックグラウンド追随経路。現状この経路の担保は手動の EDGE-005 のみで、しかも「agent-browser の制約により `visibilitychange` をプログラム発火した準実機確認」と自認している。同一リポジトリの `IngestionQueue.test.tsx:171` が happy-dom 上で `document.dispatchEvent(new Event("visibilitychange"))` による同種のテストを既に確立しており、書けない理由がない。`visibilityState === "visible"` ガード（hidden 時は再取得しない）も含めて未検証。リスナーの removeEventListener（unmount 後に発火しても再取得しない）も同様に未検証。
  / 提案: `IngestionQueueBadge.test.tsx` に (1) visible 状態で `visibilitychange` を dispatch → `getCountMock` が再呼び出しされ値が更新される、(2) `visibilityState` を hidden にスタブした dispatch では再取得しない、(3) unmount 後の dispatch / notify で再取得しない、の 2〜3 ケースを追加する。

- **[W-002]** `IngestionJobRow` の既存アクション成功後 notify が commit しかテストされていない
  / 場所: `app/components/ingestion/__tests__/IngestionJobRow.test.tsx`（追加テストは commit 成功 / commit 失敗の 2 件のみ）、実装は `IngestionJobRow.tsx` の discard / regenerate / retry 各パス
  / 提案・理由: plan テスト方針は「既存アクション成功後の notify」（複数形＝保存・再生成・破棄・再試行）を求めており、実装も 4 箇所に `notifyIngestionQueueChanged()` を入れているが、テストは commit の正負 1 組だけ。discard / regenerate / retry の notify は、リファクタで 1 行落としてもどのテストも落ちない（バッジが追随しなくなる回帰は AC-5 の中核）。特に discard は `setOptimisticDiscarded` → `await discard` → invalidate → notify という順序依存のあるパスで、commit とコードパスを共有していない。既存の discard / regenerate テストブロックに `expect(notifyMock).toHaveBeenCalledTimes(1)` を足すだけで済むので追加すべき。

- **[W-003]** 実プロダクションの `UploadButton` の aria-label / バッジ配線がテストされていない（ハーネスが配線を複製している）
  / 場所: `app/components/ingestion/__tests__/IngestionQueueBadge.test.tsx:34-42`（`BadgeHarness`）vs `app/components/ingestion/UploadButton.tsx`
  / 理由: テストの `BadgeHarness` は「`useIngestionQueueCount` → `uploadButtonLabel` を aria-label に → `IngestionQueueBadge` を子に」という配線を自前で再現しており、ADR-005-1 の本質（`aria-label` が子孫テキストに勝つため、件数を CTA 自身のラベルに載せなければ SR に届かない）を担保しているのは UploadButton 側の実装。UploadButton がこのフック呼び出しや `aria-label={uploadButtonLabel(queueCount)}` を失っても、`Header.tsx` から静的 `aria-label` を復活させても、全テストが green のまま AC-5 の a11y 要件が壊れる。手動 TC-006 でしか守られていない。
  / 提案: `UploadButton` を直接 render するテスト（router の `Link` / `useLocation` は既存のモックパターンで足りる）を 1 本足し、count > 0 でアンカーの `aria-label` が「アップロード（未処理 N 件）」になりチップが描画されること、0 件で「アップロード」に戻ることを実体側で固定する。

- **[W-004]** バッジ取得失敗が「成功後の失敗で 0 にリセット」される挙動が未検証、かつ仕様としてやや疑問
  / 場所: `app/components/ingestion/IngestionQueueBadge.tsx:27-29`（catch で `setCount(0)`）、テストは初回マウント失敗のみ（`IngestionQueueBadge.test.tsx` "silently hides the chip when the fetch fails"）
  / 理由: テストされているのは「初回取得が失敗 → チップ非表示」だけ。count=3 表示中に visible 復帰の再取得が一過性エラーで失敗すると、既知の正しい値を捨てて 0（非表示）に巻き戻す。「取得失敗は黙って非表示」という plan ステップ 5 の方針には沿うが、stale 値保持（`catch` で何もしない）の方が UX 的に自然な選択肢でもあり、どちらの仕様かをテストが固定していないため将来の変更が無言で通る。
  / 提案: 「成功（3 表示）→ notify → 取得失敗 → 0 に戻る（または 3 を保持する）」のどちらを仕様とするか明示する 1 ケースを追加し、選んだ側を JSDoc に一文残す。

#### Notes

- **[N-001]** 旧フローのテスト削除は適切。削除された UploadDialog の waiting / editing / failed / timedOut / committed / queueGuidance / 180s タイムアウト / transient リトライ系テスト（約 1,100 行）は、対応する実装（View 型・`POLL_*`・`isPollFatalError`・各 View コンポーネント・`getIngestionJobFn` 等のモーダル内使用）がすべて diff で削除されており、機能ごと消えたテストの削除として正当。fake timers 依存（`vi.useFakeTimers`）もポーリング消滅に伴い丸ごと撤去されていて、テストインフラに残骸がない。`IngestionPreviewForm.test.tsx` を据え置き、`IngestionQueue.test.tsx` に手を入れなかった判断も plan どおり。

- **[N-002]** `queueBadgeBus` のテスト間残留対策は plan ステップ 5 の要求どおり機能している。実バスを使う唯一のテスト（`IngestionQueueBadge.test.tsx`）は `afterEach` で `resetIngestionQueueBusForTest()` を呼び、他の 4 ファイル（UploadDialog / UploadForm / IngestionJobRow / IngestionJobEditDialog）はバスモジュール自体を `vi.mock` しているため module-scope の `Set` に触れない。`subscribe` が unsubscribe 関数を返す契約も実装・JSDoc とも明記。residue が起き得る構成になっていない。

- **[N-003]** `IngestionJobEditDialog.test.tsx` は plan の要求（ツリー lazy load・commit→navigate・discard/regenerate→close＋invalidate・エラー表示 1 ケース・initial focus）を全て満たし、加えて「閉時はツリーを取得しない」「ツリー取得失敗でもフォームは使える」「再生成後に waiting コピーが出ない（fire-and-forget の負の検証）」まで押さえている。conflict 系エラーケース（notFound で onClose / notify / navigate がいずれも呼ばれずダイアログが開いたまま alert 表示）は「リスクと注意点」の複数タブ項目の要求にそのまま対応しており良い。

- **[N-004]** UploadDialog の新テストは AC-1 / AC-2 を検証可能な粒度で固定している: queued ビューでの `button[disabled]` ゼロ件アサート（待機 UI 不在）、続けてアップロード後の即時再送信、単一でも `invalidate` ＋ `notify` が 1 回（旧実装は複数のみだった差分の固定）、失敗時に notify / invalidate が呼ばれないことの負の検証、SR status region の文言追跡。カスタムプロンプトが「続けてアップロード」を跨いで保持される仕様もステップ 7 の文言どおりテスト化されている。

- **[N-005]** ユニット計画 → integration への変更は正当。plan ステップ 3 は「in-memory フェイク追加＋ユニットテスト」としていたが、`docs/test.md` は「リポジトリ系 fake は意図的に置かない／usecase の振る舞い検証は integration に寄せる」と明記しており、`countActiveIngestionJobs.integration.test.ts`（実 D1）への切り替えは計画よりリポジトリ規約に忠実。乖離が ADR-005-3 に記録されている点も良い。テスト内容（status 集合の包含・除外 6 種 / owner 越境 / 0 件）は plan テスト方針の 3 項目と一致。

- **[N-006]** 軽微: `ingestionJobRepository.integration.test.ts` の「resolves 0 for an empty statuses array **without querying**」は、戻り値 0 しかアサートしておらず「DB に行かない」ことは検証していない（テスト名がアサーション内容を超えている）。ポート契約の MUST を厳密に守りたいなら db への spy が要るが、integration 層でそこまでやる価値は薄く、現状でも許容範囲。テスト名を挙動に合わせて控えめにするか、コメントで断っておくとよい。

- **[N-007]** 軽微: 編集ボタンの表示条件テストは failed / discarded の負例のみで、pending / processing / saved 行の負例がない。実装は `status === "previewing"` の単一条件なので実害は薄いが、「previewing でのみ表示」を謳うなら少なくとも pending を 1 つ足すと条件の取り違え（例: `!== "failed"` への退化）も検知できる。

- **[N-008]** 手動テストの限界の扱いが誠実。EDGE-001 / 002 で「サーバー側失敗は静的ファイルでは再現不能」と認め、対応するユニットテスト（部分失敗の集約 queued ビュー / 単一失敗の select 復帰）で代替カバーされていることを個別テスト実行で確認した旨を結果ファイルに記録している。自動・手動の責務分担が plan の「手動（ブラウザ）」項目と整合している。
