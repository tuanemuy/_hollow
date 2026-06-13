# Review 002 — Frontend（Issue #538 / PR 677）

Round 2 フルレビュー（ゼロベース）。担当レイヤー: UploadDialog 縮退・QueuedView・IngestionJobEditDialog・IngestionJobRow 編集導線・IngestionQueueBadge・queueBadgeBus・Header/UploadButton・UploadForm notify・UploadPage コピー。

## Frontend

### Blockers

- **[B-001]** なし

### Warnings

- **[W-001]** QueuedView の「キュー画面を開く」が backdrop 内の `閉じる`／`続けてアップロード` と同列で primary 表示だが、フォーカス着地先（`queuedPrimaryRef`）と DOM 上の Tab 順が逆 / 場所: `app/components/ingestion/UploadDialog.tsx:649-665` / 理由: ボタン配置は DOM 上 `閉じる` → `続けてアップロード` → `キュー画面を開く（primary, focus 先）`の順。初期フォーカスは最後の primary に当たるため、開いた直後に Shift+Tab すると「続けてアップロード」へ、Tab すると（×ボタン経由で）先頭へラップする。視覚的にも primary が右端で、`閉じる` が最左という並びは「主要導線＝右端」の本リポジトリ慣習（`IngestionPreviewForm` の action-bar も primary が右端）と一致しており実害は小さいが、フォーカスが最右の要素に当たった状態で「閉じる」が視覚的に最も離れた位置にあるのは軽微な迷いを生む。提案: 現状維持で許容可。ただし `queued` で primary にフォーカスを当てる設計上、SR 利用者には「キュー画面を開く」が先に読まれ「閉じる」に辿り着くまで Tab が要る点だけ認識しておくこと（修正必須ではない）。

- **[W-002]** EditDialog の `onCommitted` がフォーム提供の第2引数 `title` を捨てている / 場所: `app/components/ingestion/IngestionJobEditDialog.tsx:73-79` / 理由: `IngestionPreviewForm` の `onCommitted: (noteId, title) => void` に対し EditDialog は `(noteId: string)` のみ受ける。型エラーにはならない（引数省略は許容）が、行の即時保存（`IngestionJobRow.onCommit`）は navigate のみで title を使わず、旧モーダルも title を使っていなかった想定。`title` 引数自体が現状どの呼び出し側でも未使用なら、`IngestionPreviewForm` の signature から落とすか、EditDialog 側でコメントを添えて「意図的に未使用」と明示すべき。提案: signature に残すなら EditDialog の `onCommitted` に「title は未使用（即時 navigate のみ）」の一言、または `IngestionPreviewForm` の `onCommitted` を `(noteId: string) => void` に簡約。死にパラメータの放置は次の読者を惑わせる。

- **[W-003]** UploadForm の成功時 `notifyIngestionQueueChanged()` が `routerInvalidate` の後・かつ同一 try 内にある / 場所: `app/components/ingestion/UploadForm.tsx:184-191` / 理由: ADR-006 は UploadDialog 経路で「enqueue 確定後に notify を先行させ、invalidate は隔離して失敗を黙殺」とした。だが `/upload` ページの `UploadForm` 経路は依然 `await routerInvalidate(router)` → `notifyIngestionQueueChanged()` の順で同一 `try` 内にあり、invalidate が throw すると notify に到達しない（catch でエラー表示に落ちる）。`/upload` 滞在中はキュー自身のポーリングが状態を見せるためバッジ鮮度の実害は限定的だが、ADR-006 の「enqueue 済みなら常に正しい結果を提示し、invalidate 失敗を隔離する」方針と非対称。提案: UploadForm でも upload ループ成功直後に `notifyIngestionQueueChanged()` を先行させ、`routerInvalidate` を独立 try に隔離して UploadDialog と挙動を揃える。

### Notes

- **[N-001]** バッジ世代ガード（`seq`/`mySeq`）が `IngestionQueueBadge.tsx:28-41` に明快に実装され、バッチアップロードや行アクション連打での out-of-order レスポンス上書きを正しく防いでいる。失敗時 `setCount(0)` で「前回成功値を残さず非表示」に倒す方針もコメントで根拠が明示されており良い。
- **[N-002]** `uploadButtonLabel` で件数を CTA の `aria-label` に載せ、視覚チップを `aria-hidden` にして二重読み上げを避ける設計が `IngestionQueueBadge.tsx:63-78` / `UploadButton.tsx:26-44` に一貫して実装されている。ADR-005 の a11y 単一ソース方針どおり。
- **[N-003]** `queueBadgeBus.ts` が `subscribe` で unsubscribe 関数を返し、`resetIngestionQueueBusForTest()` でテスト間の購読者残留を断つ手当てまで含む。バッジ側も unmount で確実に購読解除（`IngestionQueueBadge.tsx:48-52`）しており、モジュールスコープ pub-sub のリーク懸念に対処済み。
- **[N-004]** UploadDialog の `cancelledRef` による「ダイアログ dismiss 後の stale setView 抑止」と、enqueue 確定後の notify 先行・invalidate 隔離（ADR-006）が単一・複数両経路で対称に実装されている（`UploadDialog.tsx:197-270`）。Round 1 の W-001（invalidate 失敗がアップロード失敗を偽装する問題）は解消済み。
- **[N-005]** EditDialog の backdrop クリック非クローズ（`closeOnBackdropClick` 無効）が ADR-005 の判断どおりで、保存中の誤クローズを防ぐ。Esc / × / キャンセルの close 経路は維持され、`initialFocusRef={titleInputRef}` でタイトル入力に初期フォーカスが当たる配線も正しい。
- **[N-006]** EditDialog 開放中にポーリングが対象ジョブを `previewing` 以外へ遷移させると `IngestionJobRow.tsx:314-320` の gating でダイアログが強制クローズし未保存編集が消える挙動は、ADR-001 で許容トレードオフとして明記済み。`IngestionPreviewForm` の `useState(initial...)` がプロップ更新でクロバーされない（編集中の poll で値が飛ばない）点も確認した。
- **[N-007]** spec/pages/index.md（170-176, 18 行目）と UploadPage のコピーが新「投げっぱなし＋キュー編集」モデルに更新済み（バッジ件数 status 集合 pending/processing/previewing の記述も整合）。AC-6 を満たす。
- **[N-008]** QueuedView の `total/succeeded/failedNames` はクライアント検証で弾かれたファイル（unsupported/oversized）を含まず、それらは `UploadValidationBanners` が select ビューで説明する分離が保たれている。件数表示の意味（=送信を試みた受理ファイルのうち何件キュー追加できたか）が一貫している。
</content>
</invoke>
