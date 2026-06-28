# PR #807 レビュー — Test 観点（Issue #790）

対象: `gh pr diff 807` / `.issue/790/plan.md` / `.issue/790/adr.md`（特に ADR-003 のテスト配置層分離）
レビュー範囲: `useIngestionQueueCount.test.tsx`（新規・フック単体, ingestion）/ `UploadNavItem.test.tsx`（新規・表示統合, layout）/ `UploadButton.test.tsx`（更新）/ 旧 `IngestionQueueBadge.test.tsx` からの移植 / 周辺テストのコメント更新

## Test

### Blockers

なし

### Warnings

- **[W-001]** 実 `uploadQueueLabel`（AC-4 のアクセシブル名の単一の真実点）がユニットテストで一度も実行されていない
  - 場所: `app/components/layout/__tests__/UploadNavItem.test.tsx:13-17`（モジュール丸ごと mock、`uploadQueueLabel` も mock で再実装）/ `app/components/ingestion/__tests__/useIngestionQueueCount.test.tsx:29`（`uploadQueueLabel` を import せず未検証）
  - 理由: 旧 `IngestionQueueBadge.test.tsx` は `BadgeHarness` で実 `uploadButtonLabel` を import し、`アップロード（未処理 N 件）` / `アップロード` の文言を実関数に対して固定していた。本PRでは `UploadNavItem.test.tsx` が `useIngestionQueueCount` モジュールを丸ごと mock し、その中で `uploadQueueLabel` を **mock 側で複製**している。`useIngestionQueueCount.test.tsx` でも `uploadQueueLabel` を import しない。結果、実 `uploadQueueLabel`（`useIngestionQueueCount.ts:62`）の文言を検証するユニットテストが消滅した。実関数のフォーマットを変えても（誤字・全角半角・括弧崩れ等）両テストは mock の複製文言に対して green のまま通り、AC-4「件数のアクセシブルなテキスト表現」を守るユニット網が失われている（現状はブラウザ手動テスト TC-5 のみが実値 `アップロード（未処理 19 件）` を担保）。
  - 提案: `UploadNavItem.test.tsx` の mock を部分 mock 化し、`uploadQueueLabel` は実装を温存する（純関数なのでフック差し替えと独立に実物を通せる）。例: `vi.importActual` で `uploadQueueLabel` を残し `useIngestionQueueCount` だけ差し替える、もしくは `useIngestionQueueCount.test.tsx` に `uploadQueueLabel` の直接 spec（>0 / 0 の2分岐）を1ケース追加する。これで実コンポーネントが実ラベルを描画する経路が固定される。

### Notes

- **[N-001]** テストの層分離は plan / ADR-003 どおりに正しく実現されている。フック挙動（notify 再フェッチ / visibility 復帰再フェッチ / hidden 中スキップ / unmount 後停止 / 失敗時前回値保持 / 初回失敗は 0 維持 / stale 破棄=seq ガード / 初回 fetch 値の反映）は ingestion 配下 `useIngestionQueueCount.test.tsx` に薄いハーネス（`CountHarness` が `data-count` で hook 値だけを露出）で網羅され、ビュー部品に結合していない。表示・統合（>0 表示 / 0 非表示 / 99+ / aria-label 文言 / `activeProps` 共存）は layout 配下 `UploadNavItem.test.tsx` に置かれ、層越えがない。旧 `IngestionQueueBadge.test.tsx` の検証項目（10 ケース）はチップ描画前提の表現を除き漏れなく移植されている（チップ→`NAV_COUNT` span / `[data-queue-badge]`→`a > span:last-child`）。
- **[N-002]** `UploadNavItem.test.tsx` の `Link` mock は plan が明示的に注意喚起した落とし穴を正しく回避している。`linkActive` フラグ時のみ `activeProps` をアンカーへスプレッドする実装（L24-43）で、`UploadButton.test.tsx` の「rest props を素通しするだけ」の mock を流用していない。さらに `ACTIVE_NAV_PROPS` を mock せず実 `styles.ts` から取り込むため、`data-active=""` / `aria-current="page"` の値もコンポーネントが渡す実物を検証している（共存検証の空振りなし）。active トリガ自体は mock の bool に依存するが、ルータ mock の本質的制約で許容範囲。
- **[N-003]** 99+ ケース（`UploadNavItem.test.tsx:94-102`）が、可視 count は `99+` に丸める一方 `aria-label` は実数 `120` を保持することを別々に固定しており、表示の丸めと SR の正確性の差を明示的にカバーしている。良い粒度。
- **[N-004]** `UploadButton.test.tsx` は更新方針どおり、静的 `aria-label="アップロード"`・`[data-queue-badge]` 不在・ハッシュ `#upload` での `data-active="true"`/`aria-current="page"` を検証する内容に置き換わっている。フック/serverFn の mock が不要になった点も実装（hook 依存を除去）と整合し、不要 mock が残っていない。
- **[N-005]** 周辺テスト/実装の陳腐化コメントは「header (queue) badge」→「sidebar upload nav item count」へ網羅的に更新済み（`UploadDialog`/`UploadForm`/`IngestionJobRow` テスト・`actions.ts`・`queueBadgeBus.ts`・`UploadForm.tsx`・`IngestionJobEditDialog.tsx`）。バス名 `queueBadgeBus` とテスト名「notifies the queue badge bus」は位置と無関係なため据え置かれており、plan の過剰修正回避指針どおり。`grep -rn "IngestionQueueBadge\|uploadButtonLabel\|header badge"` は app/ 配下でゼロ件。
- **[N-006]** スコープ外の軽微な churn: `IngestionJobRow.test.tsx` と `IngestionPreviewForm.test.tsx` で preview フィクスチャを定数（`existingDirPreview` / `samplePreview`）へ抽出し非 null アサーション `!` を解消するリファクタが含まれる。plan 非対象だが、テスト挙動は不変で害はない（lint 由来のクリーンアップと推測）。テスト観点の問題ではないため Note 止まり。
