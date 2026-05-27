# エッジケース・異常系

## EC-1: LLM 推論の 180 秒タイムアウト

**判定**: 未検証（環境上の制約）

- 検証には `getIngestionJob` レスポンスを「常に processing を返す」モックに差し替える必要があり、本セッションでは実装変更を行わないため未実施
- ソースコード `app/components/ingestion/UploadDialog.tsx` のポーリング実装は 180 秒上限+「キュー画面で続きを確認」誘導があることをコードレビューで確認可能（実機テストはフォローアップで）

## EC-2: LLM 呼び出し失敗時の failed view

**判定**: 未検証（環境上の制約）

- 現在の DB に failed 状態のジョブが存在しない（既存シードは previewing / discarded / saved のみ）
- 検証には LLM プロバイダー側で失敗を起こすか、`updateIngestionJob` を直叩きする必要あり
- ソースコード上 `FailedView` 関数（UploadDialog.tsx L443〜495）は「キュー画面で詳細を見る」「破棄」の 2 アクションのみ提供（「再試行」ボタンなし）、コード上は spec 通り

## EC-3: ポーリング中の権限エラー（他者所有ジョブ）

**判定**: 未検証（環境上の制約）

- 通常 UI 操作で発生しない異常系。jobId 改ざんが必要のため未実施
- 単体テスト or 統合テストでカバー予定

## EC-4: 不正な Front Matter JSON

**判定**: PASS（TC-5 で同時カバー済み）

- `{not: "valid"` 入力 → 「登録」押下時に `alert` role でエラー表示
- 他フィールド（タイトル / FrontMatter テキストの入力値）は保持
- 詳細は `TC-5.md` 参照

## 既存機能影響確認

- **`/upload` の UploadForm フォールバック**: TC-6 で動作確認 — OK
- **`IngestionJobRow`**: TC-6 確認時に commit / discard / regenerate ボタン表示確認 — OK
- **`getIngestionJobs`** の discarded 除外: TC-2 で discarded 化が確認できれば検証可。本セッションでは TC-2 の discard 結果が不確定のため、後続確認推奨
- **`commitIngestionPreviewFn`**: TC-1 / TC-5 で `frontMatterJson` 指定 / 未指定どちらも動作 — OK
- **モーダル開閉動線（ヘッダー / サイドバー / ツールバー）**: 部分検証。ヘッダーは TC-1 で確認、サイドバー / ノート一覧ツールバーは未確認
