# Review 004 — Frontend (PR #677 / Issue #538)

Round 4 フルレビュー（ゼロベース）。担当: UploadDialog 縮退・QueuedView・IngestionJobEditDialog・IngestionJobRow 編集導線・IngestionQueueBadge・queueBadgeBus・Header/UploadButton・UploadForm notify・UploadPage コピー。

## 受け入れ基準の検証（担当レイヤー）

- AC-1: `UploadDialog` の View 型は `select / uploading / queued` の 3 つに縮退済み。`waiting` / `editing` 不在。`getIngestionJobFn` ポーリング・`POLL_*` 定数・`IngestionPreviewForm` のモーダル内使用は削除済み。単一・複数とも upload 完了で `queued`（「N 件中 M 件をキューに追加しました」＋リンク）に着地。満たす。
- AC-2: `queued` 中は「続けてアップロード」「閉じる」「キュー画面を開く」が常時押下可能。待機 UI（スピナー・disabled・ジョブ完了待ち）なし。`onUploadMore` で `select` リセット（プロンプト保持）。満たす。
- AC-3: `IngestionJobRow` の `previewing` 行に「編集」ボタンあり。`IngestionJobEditDialog` で title/dir/tag/FrontMatter を編集し commit。満たす。
- AC-4: 編集ビューから discard / regenerate 実行可。regenerate 後はダイアログを閉じ、キューの polling と行進捗が追跡。満たす。
- AC-5: `queued` ビューに `/upload` への導線あり。`UploadButton` 上にバッジ。発火点はモーダル・`/upload` の `UploadForm`・commit/discard/regenerate/retry すべてに `notifyIngestionQueueChanged()` 配線済み。満たす。
- AC-6: `UploadPage` コピー更新済み（spec 本体は本レビュー対象外だが UI 文言は整合）。満たす。

## Frontend

### Blockers
なし

### Warnings
なし

### Notes

- N-1: 場所 `IngestionJobEditDialog.tsx`（`Dialog` の props）。`closable` を明示しておらずデフォルト `true` のため、commit のトランジション中でも Esc / × でダイアログを閉じられる。plan は「編集中（form の transition pending）は backdrop で閉じない」とし、backdrop は実際にオフ（デフォルト false）で満たすが、`IngestionPreviewForm` は pending 状態を親へ出力しないため Esc/× の抑止は構造上できない。閉じても commit は navigate 成功で着地、未着地ならジョブは previewing のまま残り再編集可能なので実害は小さい。許容範囲。コメント（39 行目）が「backdrop click は意図的に閉じない／Esc・×・キャンセルは残す」と明記しており WHY も追えるため、修正不要の Note 止まり。

- N-2: 場所 `UploadForm.tsx`（`/upload` ページの inline フォーム）。アップロード成功後に明示的な「キューに追加しました」確認 UI はなく、入力リセット＋invalidate でキュー一覧の更新に委ねている。モーダルの `QueuedView` のような成功メッセージはない。`/upload` 滞在中はキュー一覧そのものが結果を示すため UX 的に妥当で、AC も `UploadForm` 経路に確認ビューを要求していない。仕様内。

- N-3: 場所 `IngestionQueueBadge.tsx`（`useIngestionQueueCount`）。`seq` 単調カウンタによる out-of-order 応答の握り潰し、取得失敗時の前回件数据え置き（Round 3 指摘の修正）が `cancelled` ガードと併せて正しく実装されている。`aria-hidden` チップ＋アクセシブル名は `uploadButtonLabel` に集約され二重読み上げを回避。規約（utility-first・data-* 状態・client 境界・aria）に適合。指摘なし。

## 規約チェック

- utility-first: 反復ユーティリティは `BADGE_CHIP` 等のモジュール定数に集約。新規の手書き CSS / `@apply` なし。適合。
- data-* 状態: `data-dragover` / `data-primary` / `data-discarded` / `data-overriding` / `data-queue-badge` を `value || undefined` 規約で使用。適合。
- RSC / server-fn: `getIngestionQueueCountFn` は input-less GET（既存パターン踏襲）。Header は server component のまま、バッジのみ client に分離。適合。
- aria / フォーカス: `QueuedView` の primary への focus 着地、`SelectView` ドロップゾーンへの復帰、`role="status" aria-live` の単一集約、EditDialog の `initialFocusRef`。適合。
- コメント: 削除した旧フロー（#253/#319 等）の参照コメントは残骸を残さず整理され、残るコメントは WHY（pub-sub の module-scope 制約、invalidate 失敗を upload 失敗に見せない、seq ガードの理由）に限定。適合。

## 総括

Blocker / Warning なし。Round 1〜3 の指摘（バッジ件数据え置き含む）は反映済みで、新規の重大問題は見当たらない。収束と判断する。
