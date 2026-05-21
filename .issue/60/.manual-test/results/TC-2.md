# TC-2: 汚染環境 → マイグレーション DELETE 修復

## Status: PASS (修復スコープ) / 副次的に save 動作確認は環境制約あり

## 検証目的
1. legacy スキーマの行があると `/admin/llm` がレンダリングエラーになることを再現
2. マイグレーション 0009 と同等の `DELETE` SQL を直接実行すると、ページが 200 に回復すること
3. 修復後のフォーム上で値の編集 / 保存ができること

## 手順と結果

| # | 手順 | 期待 | 実測 |
|---|------|------|------|
| 1 | legacy 行投入 (`design_tokens_json='{}'`, `limits_json` に旧キーのみ, `version=0`) | INSERT 成功 | OK |
| 2 | admin ログイン後 `/admin/llm` を開く | レンダリングエラー | エラーページ表示「アクセスできません / エラーが発生しました」 (root errorBoundary catch) |
| 3 | マイグレーション DELETE SQL を実行 | 1 行削除 → count=0 | OK |
| 4 | `/admin/llm` リロード | 200 + フォーム正常表示 | OK (default フォールバック値で表示) |
| 5 | model フィールドを `claude-3-5-haiku-latest` に変更 → 保存 | フォーム保存 | 422 → `LLM apiKeySource is 'env' but no env-provided api key is available` |
| 6 | (再試行) API キー欄に dummy 値を入れて保存 | 200 success | 500 `System error`（暗号化キー未設定で encryption 失敗） |

## スクリーンショット
- `/Users/hikaru/github.com/tuanemuy/hollow2/.issue/60/.manual-test/screenshots/tc-2/admin-llm-500.png` (legacy 行で error boundary)
- `/Users/hikaru/github.com/tuanemuy/hollow2/.issue/60/.manual-test/screenshots/tc-2/admin-llm-200.png` (DELETE 後の正常表示)
- `/Users/hikaru/github.com/tuanemuy/hollow2/.issue/60/.manual-test/screenshots/tc-2/admin-llm-saved.png` (save 試行後の状態)

## 所見
- Issue #60 のスコープ ─ 「破壊された行から default 復帰」「行 0 件で `/admin/llm` が 200」── は **完全に検証**。
- save の成功確認は失敗したが、原因はテスト環境に `ANTHROPIC_API_KEY` および `SECRET_BOX_MASTER_KEY` が未設定のため。Issue #60 のパッチによる挙動ではなく、`.dev.vars` 設定の問題。**追加起票不要**（Issue #60 のスコープ外）。
- なお、修復後の `/admin/llm` は default 値で表示されるため、保存しない限り DB は 0 行のまま。後続テストへの影響なし。
