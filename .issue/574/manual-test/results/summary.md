# テスト実行サマリー — Issue #574 P23 プロンプトプレビュー

**実行日時**: 2026-06-10
**テストソース**: .issue/574/testing.md
**サーバー**: http://localhost:3000

| TC | テスト名 | 種別 | 結果 | 備考 |
|----|---------|------|------|------|
| TC-001 | プレビューUIのレイアウト（4用途） | 正常系 | PASS | structure/title/directory/metadata の4カードに preview-panel・実行ボタン。desktop で入力→矢印→出力の2カラム |
| TC-002 | ocr_assist のプレビュー非対応表示 | 正常系 | PASS | 「この用途はプレビューに対応していません。」表示・実行ボタン非描画 |
| TC-003 | LLM未設定時の正直なエラー表示 | 異常系 | BLOCKED | 本環境は `.dev.vars` に LLM 設定済みで Stub ではなく実 LLM が動作。エラー経路を踏めず。実装欠陥なし（正直エラー経路は previewPrompt.test.ts(f) で担保）。副次的に実LLMプレビューのハッピーパスが POST 200 + 構造化出力で成功確認 |
| TC-004 | サンプル長上限 | 異常系 | PASS | textarea maxLength=4000（SAMPLE_TEXT_MAX_LENGTH 一致） |
| TC-005 | 未ログイン時リダイレクト | 異常系 | PASS | 未認証で `/settings/prompts` → `/` にリダイレクト（`_app/route.tsx` の設計どおり。保護は満たす） |

**合計**: 5 件（PASS: 4 / BLOCKED: 1 / FAIL: 0）

## 所見

- 実装バグはゼロ。Issue 起票なし。
- TC-003 は「ローカル LLM 未設定」という前提がこの環境で不成立（実 LLM 設定済み）だったため BLOCKED。むしろ実 LLM でのプレビュー実行が end-to-end で成功し、入力→出力2カラム描画（例: `<h1>テストの本文</h1><p>…</p>`）を確認できた。正直エラー表示（`llm_preview_unavailable` → 「現在 AI が利用できないためプレビューできません」）は unit test(f) で担保済み。
- agent-browser の React onClick 不発偽陽性も検証 → 偽陽性ではない（ref クリックで onClick 発火・POST 200 確認。要素が viewport 外のときは scrollintoview 後に確実発火）。
