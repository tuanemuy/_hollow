# テスト実行サマリー — Issue #253

**実行日時**: 2026-05-29
**テストソース**: `.issue/253/testing.md`
**サーバー**: http://localhost:3000
**ブランチ**: `issue/253/regenerate-llm-redrive`
**テストユーザー**: 既存シード `existing@example.com` / `Password123!`（member）

## 結果一覧

| TC | テスト名 | 種別 | 結果 | 備考 |
|----|---------|------|------|------|
| TC-1 | プレビュー編集モーダルからの再生成 | 正常系 | **PASS** | 再生成ボタン（RefreshCw、破棄と登録の間）存在 → 押下で waiting view へ遷移・全ボタン消失（二重押下抑止）→ editing 復帰のサイクルを観測 |
| TC-2 | `/upload` IngestionJobRow 再生成 | 正常系 | **PASS** | 行の再生成ボタン押下で LLM 再駆動、previewing 復帰を DB で確認 |
| TC-3 | 再生成上限（MAX_REGENERATIONS=5） | 正常系 | **PASS** | count を 5 まで増加 → 6回目で「再生成の回数上限に達しました」をインライン表示、count 据え置きで cap バイパスなし |

**合計**: 3 件（PASS: 3 / FAIL: 0）

## 再生成が機能した確証（本 Issue の核心）

1. **DB の動かぬ証拠**: D1 `ingestion_jobs.regeneration_count` が再生成ごとに +1 し `2→5` まで増加。従来 no-op なら増えない。対象ジョブ `019e7218-...`（`original_file_name=issue253-sample.md`, `status=previewing`, `regeneration_count=5`）。
2. **dispatch 再駆動**: 各再生成のたびにサーバーログへ `[relay-trigger] inline dispatch drained N { processed: N }` が出力され、dispatch 経由で `runIngestionJob` が再起動された痕跡を確認。
3. **UI サイクル**: editing → waiting（「LLM がタイトルとメタデータを提案中...」）→ editing 復帰で pending→processing→previewing を可視化。
4. **上限ガード**: `regeneration_limit_exceeded` 相当のエラーで正しく停止し、ジョブ破損なし。

## 検出された問題

なし（実装バグ・テスト手順・環境・デザイン差異いずれも該当なし）。Issue 起票は不要。

## 備考・環境制約

- pending/processing の中間状態は、ローカル dev の LLM 抽出が数秒で完了するため reload 間隔では捕捉できなかった。testing.md の前提（数秒で完了）と整合し、DB の count 増加が再処理の確実な証拠。
- 再生成前後で preview 内容は同一（同一ソース・決定論的なローカル LLM 抽出による）。testing.md の「内容が同じでもジョブが再処理されていればOK」基準を満たす。
- テスト用ジョブ `issue253-sample.md` が previewing / `regeneration_count=5` で DB に残存（`/upload` から破棄可能）。

## スクリーンショット

- `screenshots/01-after-login.png`
- `screenshots/02-tc1-editing-with-regenerate.png`（モーダルに再生成ボタン）
- `screenshots/03-tc1-after-regen-click.png`（waiting view）
- `screenshots/04-tc1-after-regen-editing.png`（再生成後 editing 復帰）
- `screenshots/05-tc2-upload-previewing.png`
- `screenshots/06-tc2-after-regen-click.png`
- `screenshots/07-tc2-after-regen-previewing.png`
- `screenshots/08-tc3-limit-exceeded.png`（上限エラー）
