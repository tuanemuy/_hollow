# Review 003 — Frontend (PR #677 / Issue #538)

ゼロベース・フルレビュー。担当レイヤー: UploadDialog 縮退・QueuedView・IngestionJobEditDialog・IngestionJobRow 編集導線・IngestionQueueBadge・queueBadgeBus・Header/UploadButton・UploadForm notify・UploadPage コピー。

## 受け入れ基準の充足

- **AC-1（投げっぱなし＋queued ビュー）**: 満たす。`UploadDialog` の View 型は `select / uploading / queued` の 3 種のみ（`UploadDialog.tsx:42-50`）。`waiting` / `editing` は不在、`getIngestionJobFn` ポーリングと `IngestionPreviewForm` のモーダル内使用も削除済み（import 一覧 `:1-35` に存在しない）。
- **AC-2（待機 UI 不在・常時操作可能）**: 満たす。`QueuedView`（`:610-668`）の「閉じる」「続けてアップロード」「キュー画面を開く」はいずれも disabled / スピナー連動なし。`onUploadMore` は `select` リセット（プロンプト保持）（`:299-304`）。
- **AC-3（previewing 行の編集→commit）**: 満たす。`IngestionJobRow` の `previewing` 行に「編集」ボタン（`:236-243`）、`IngestionJobEditDialog` ＋ `IngestionPreviewForm` で title/directory/tags/frontMatter 編集・commit。
- **AC-4（破棄・再生成・ポーリング追跡）**: 満たす。EditDialog の `onDiscarded` / `onRegenerated` は close（`:81-89`）、`IngestionPreviewForm` 側が invalidate を担当しキューのポーリングが進捗追跡。
- **AC-5（結果ビューの導線＋ヘッダーバッジ＋更新経路）**: 満たす。`UploadButton` に件数チップ（`:44`）、発火点は UploadDialog（単一 `:207` / 複数 `:255`）・UploadForm（`:189`）・IngestionJobRow（commit/discard/regenerate/retry 各成功パス）・EditDialog 全成功パス。
- **AC-6（コピー・spec 更新）**: 満たす。`UploadPage.tsx:27-29` の説明文を新モデルに更新、`spec/pages/index.md` 18/170/176 行で投げっぱなし＋バッジを反映。

## 規約適合

- utility-first / `data-*` 状態: 適合。`data-dragover` / `data-discarded` / `data-overriding` / `data-primary` 等、すべて attribute presence パターン（`value || undefined`）。条件付き class 文字列の状態表現なし。新規ハンドCSSなし。
- RSC / server-fn: 適合。Header は server component のまま、件数取得のみ client（UploadButton）。ミューテーションは server-fn、`useServerFn` 経由。
- aria / フォーカス: 概ね良好。UploadDialog の `role="status" aria-live="polite"` 単一集約は維持、view 縮退に合わせ `viewStatusText` 整理。EditDialog は `initialFocusRef={titleInputRef}`、バッジは `aria-hidden` ＋ CTA の `aria-label` に件数集約（二重読み上げ回避）。
- コメント WHY のみ: 適合。残骸コメント・他 Issue 参照の死蔵なし。pub-sub の `resetForTest`・seq ガード等いずれも WHY が説明されている。

## 結論

Blocker なし。Warning 1 / Note 2。いずれも AC・規約は満たした上での軽微指摘。

### Frontend

#### Blockers

- なし

#### Warnings / Notes

- **[W-001]** 取得失敗時のフォールバック 0 が「前回成功した正しい件数」を消す
  場所: `app/components/ingestion/IngestionQueueBadge.tsx:36-39`
  理由: `refresh` の catch が無条件で `setCount(0)` する。一時的なネットワークエラーやサーバー再起動中に notify / visibilitychange が走ると、それまで正しく表示していた「未処理 3 件」が一瞬 0（バッジ消失）になり、次の成功取得まで戻らない。JSDoc にこの挙動は「意図的（CTA を塞がない方針）」と明記されており、ADR-002 の「導線を塞がない」方針とも整合するため Blocker ではない。ただし「失敗時は前回値を保持し、初回のみ 0」のほうがチラつきが減りユーザー体験上は素直。
  提案: catch で `setCount` を呼ばず前回値を据え置く（初回 state が 0 なので初回失敗時も 0 のまま＝非表示は維持される）。現状維持なら JSDoc に「成功後の失敗でも 0 に落とす」理由（古い件数を見せるより消すほうがマシ）を一文足すと意図がより明確。

- **[N-001]** バッジ件数取得が全ページのフルロードごとに 1 GET を発行
  場所: `app/components/ingestion/IngestionQueueBadge.tsx:23-46`（`useIngestionQueueCount` の mount 時 `refresh()`）
  理由: Header は AppShell に常駐するため、`useServerFn(getIngestionQueueCountFn)` が安定参照でないと effect 依存 `[getCount]` で再 fetch が増えうる。実害は薄く（GET・軽量・count 1 クエリ）、ADR-002 が「常時ポーリングなし・mount/visible/notify で再取得」と明記する範囲内。`useServerFn` の戻り値が render ごとに新参照になる実装なら無駄 fetch になりうる点だけ留意（他コンポーネントも同パターンを踏襲しており本 PR 固有の退行ではない）。
  提案: 対応不要。将来 `useServerFn` 参照が不安定だと判明したら `useCallback` ラップで対処できる、という認識合わせのみ。

- **[N-002]** EditDialog のディレクトリツリーは一度ロードすると open 中に再取得されない
  場所: `app/components/ingestion/IngestionJobEditDialog.tsx:53-71`（`if (tree.length > 0) return;`）
  理由: 行ローカル state で再マウントごとに `tree` は空に戻るため実害はほぼないが、同一行で「キャンセル→再度編集」した場合は前回ツリーが残り、その間に他で作成された新ディレクトリは反映されない。短命操作かつ ADR の許容範囲で、Blocker/Warning ではない。
  提案: 対応不要。
