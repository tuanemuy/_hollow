# REGRESSION: 既存機能への影響確認

**結果**: PASS

**セッション**: verify-regression / **日時**: 2026-06-13

## 実行ログ

| # | 項目 | 操作 | 結果 |
|---|---|---|---|
| a | previewing 行の「ノートとして保存」 | `/upload` の `previewing` 行（test-note-2）で「ノートとして保存」 | `/notes/019ebe45-...` に遷移し、提案タイトル「test-note-2」のノートが表示。PASS |
| b-1 | 行の再生成 | test-note-1 行で「再生成」（2 回） | DB の `regeneration_count` 0→2、status は `previewing` に復帰（pending/processing の遷移は LLM 完了が速く目視できなかったが DB で完走を確認）。モーダル内待機の旧挙動にはならず、キュー行で完結。PASS |
| b-2 | 行の破棄 | test-note-1 行で「破棄」→ 確認ダイアログ「破棄」 | 行が未処理一覧から消え、ヘッダーバッジ消滅。DB status=`discarded`。PASS |
| c | `#upload` ハッシュ駆動の開閉 | ヘッダーのアップロードボタン → ESC | クリックで `location.hash === "#upload"`・モーダル表示。ESC でモーダルが閉じ hash が `""` に。PASS |
| d | カスタムプロンプト accordion | モーダル内「詳細オプション（カスタムプロンプト）」を展開 | 「構造化プロンプト」「メタデータ抽出プロンプト」の textarea が存在し、入力値が保持されることを確認（生成結果への反映までは未確認 — 任意項目）。PASS |
| e | ノート一覧への反映 | (a) の保存後にトップ（ノート一覧）を表示 | 「すべてのノート」件数 17→18、一覧に test-note-2 が出現。PASS |

## 後片付け

- 未処理ジョブ（pending/processing/previewing）を 0 件に戻したことを D1 直接クエリで確認（`count = 0`）。
- セッション verify-edge-1 / verify-edge-2 / verify-regression はすべて close 済み。

## 備考

- テスト開始時に http://localhost:3100 が応答しなかったため（port 3000/3642 は別リポジトリのサーバー）、`pnpm dev --port 3100 --strictPort` をバックグラウンドで起動して前提条件を復元した。
