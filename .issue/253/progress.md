# 残存課題 — Issue #253

実装・レビューを通じて、本 PR のスコープ外と判断して見送った項目を記録する。

## 見送り 1: `IngestionJobRow.onRegenerate` のハンドラスタイル不揃い（review-001 W-F1）

- **内容:** `IngestionJobRow.onRegenerate`（`app/components/ingestion/IngestionJobRow.tsx:125-135`）は入口の二重押下ガード `if (isPending) return;` を持たず、`setError(null)` を成功後に置いている。一方 `IngestionPreviewForm.onRegenerate` は入口ガード + 冒頭 `setError(null)`。
- **理由（見送り）:**
  - `IngestionJobRow` の全アクションボタンは `disabled={isPending}` で、二重押下は UI レベルで既に抑止済み（実害なし）。
  - `runCommit` / `runDiscard` / `onRegenerate` の3ハンドラは同一のローカルスタイルでファイル内一貫している。`onRegenerate` だけ変えると逆にファイル内で不揃いになる。
  - 計画でこのファイルは「コード変更なし」スコープ。3ハンドラ全体の統一は本 Issue の意図外の純粋なリファクタリング。
- **影響範囲:** 限定的。挙動は既に安全。純粋な一貫性の問題。
- **フォローアップ:** 別 Issue 化するほどでもない軽微なもの。今後 `IngestionJobRow` を触る機会に3ハンドラまとめて統一すれば足りる。

## 見送り 2: 再生成後の `waiting` ポーリング fatal error 時に `select` view へ戻る（review-001 W-F2）

- **内容:** 再生成後の `waiting` ポーリングで fatal error（notFound / business）が発生すると、`UploadDialog`（`app/components/ingestion/UploadDialog.tsx:240-243`）が `select` view（最初のドロップゾーン）へ戻り、編集対象を見失う UX になり得る。
- **理由（見送り）:**
  - ジョブはキューに永続化されており消失しない（`/upload` から再開できる）。データ損失ではなくナビゲーションの問題。
  - fatal error 自体が稀。
  - 初回アップロードと再生成で遷移先を出し分けるには `waiting` view machine に「起点（初回/再生成）」フラグを持たせる必要があり、初回アップロードの導線にも波及する。これは本 Issue の意図（再生成の LLM 再駆動復活）を超える UX リファクタリング。
- **影響範囲:** 再生成後の稀な fatal error 時のみ。既存の初回アップロードの fatal 挙動と同一。
- **フォローアップ:** **別 Issue #319 で対応**（再生成 / failed retry など「既存ジョブ起点」の waiting 遷移時は fatal 時に `select` ではなくキュー誘導する UX 改善）。
