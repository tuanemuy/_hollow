# PR #807 レビュー — Test 観点（Issue #790） / Round 2

対象: `gh pr diff 807`（実ファイルで最新状態を確認）/ `.issue/790/plan.md` / `.issue/790/adr.md`（ADR-003 テスト配置の層分離）
レビュー範囲: `useIngestionQueueCount.test.tsx`（フック単体 + 実 `uploadQueueLabel`, ingestion）/ `UploadNavItem.test.tsx`（表示・統合, layout）/ `UploadButton.test.tsx`（更新）/ `UploadDialog`・`UploadForm`・`IngestionJobRow` テストのコメント更新
方式: ゼロベース再レビュー（Round 1 の W-001 修正反映の確認を含む）

## Test

### Blockers

なし

### Warnings

なし

### Notes

- **[N-001] Round 1 W-001 は解消済み（確認）**
  - `useIngestionQueueCount.test.tsx:29` で実 `uploadQueueLabel` を `import`、L256-266 に専用 `describe("uploadQueueLabel")` を追加し `>0` → `アップロード（未処理 3 件）` / `0` → `アップロード` の両分岐を実関数に対して固定している。AC-4 のアクセシブル名（単一の真実点）が実コードに対するユニット網で守られる状態に戻った。`gh pr diff` のキャッシュには本修正が出ていなかったが、実ファイルで反映を確認済み。

- **[N-002] 層分離は plan / ADR-003 どおり正しく実現されている**
  - フック挙動（初回 fetch 反映 / notify 再フェッチ / visibility 復帰再フェッチ / hidden 中スキップ / unmount 後停止 / 初回失敗は 0 維持 / 失敗時前回値保持 / stale 破棄=seq ガード）は ingestion 配下 `useIngestionQueueCount.test.tsx` に薄いハーネス（`CountHarness` が `data-count` で hook 値のみ露出、ビュー非結合）で網羅。表示・統合（>0 表示 / 0 非表示 / 99+ / aria-label 文言 / `activeProps` 共存）は layout 配下 `UploadNavItem.test.tsx` に分離。層越えなし。旧 `IngestionQueueBadge.test.tsx` の検証項目はチップ前提の表現（`[data-queue-badge]`・チップ描画）を除き漏れなく移植され、`99+` キャップは `UploadNavItem.test.tsx:94-102` に移って消失していない（カバレッジ後退なし）。

- **[N-003] `UploadNavItem.test.tsx` の Link モックは plan が警告した落とし穴を回避している**
  - `linkActive` 時のみ `activeProps` をアンカーへスプレッドする実装（L26-43）で、`UploadButton.test.tsx` の「rest props 素通しのみ」モックを流用していない。さらに `ACTIVE_NAV_PROPS` はモックせず実 `styles.ts` から取り込むため、`data-active=""` / `aria-current="page"` の値もコンポーネントが渡す実物を検証（共存アサーションの空振りなし）。active トリガ自体はモックの bool 依存だが、ルータモックの本質的制約で許容範囲。なお非 active での count/label 描画は、`linkActive` デフォルト false の「count > 0」ケース（L75-83）が同時に担保しており、別途の negative ケースは実質モック挙動の検証になるため不要。

- **[N-004] `uploadQueueLabel` のモック複製は残るが低リスク**
  - `UploadNavItem.test.tsx:13-17` は `useIngestionQueueCount` モジュールを丸ごとモックし、純関数 `uploadQueueLabel` も文言を複製している。よって本ファイルの aria-label アサーション（`アップロード（未処理 N 件）`）はモック複製文言に対する検証で、実関数フォーマットの回帰はここでは捕捉しない。ただし N-001 の実関数 spec が別途フォーマットを固定するため、組み合わせでカバレッジは充足。任意改善: `vi.importActual` で純関数 `uploadQueueLabel` を温存し `useIngestionQueueCount` だけ差し替えれば、実コンポーネント経路で実ラベルが走り複製文字列も消せる。必須ではない。

- **[N-005] `UploadButton.test.tsx` のチップ不在アサーションは回帰ガード**
  - `expect(container.querySelector("[data-queue-badge]")).toBeNull()`（L59）は `data-queue-badge` 属性がコードベースから全削除されたため構造上もはや fail し得ない。挙動検証というより「チップを再導入したら気付く」回帰ガードであり、残して害はない。静的 `aria-label="アップロード"`・ハッシュ `#upload` 連動の `data-active="true"`/`aria-current="page"`・非 active 時の両属性 null は実装どおり検証されており、不要になったフック/serverFn モックも除去済みで偽陽性なし。

- **[N-006] 単一アナウンス保証（aria-label が可視 `NAV_COUNT` を上書き、span に `aria-hidden` なし）はユニット非検証**
  - これは AT のアクセシブル名計算（aria-label が子孫テキストを上書き）に依存する挙動で、JSDOM/happy-dom では本質的に検証できない。手動テスト TC-5（実値 `アップロード（未処理 19 件）`・active 共存・二重読み上げなし）が担保しており、ユニットでの欠落は許容範囲。

## 総括

Round 1 の唯一の Warning（W-001: 実 `uploadQueueLabel` 未実行）は適切に修正され、実関数のフォーマットがユニットで固定された。層分離（ADR-003）・フック挙動の網羅・表示/統合の責務分割・Link モックの `activeProps` 忠実度・旧テストからのカバレッジ移植（99+ 含む）・モック戦略のいずれも健全で、偽陽性や脆いテストは認められない。新規の Blocker / Warning はなし。
