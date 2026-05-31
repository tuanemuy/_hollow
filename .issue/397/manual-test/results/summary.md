# テスト実行サマリー — Issue #397

**実行日時**: 2026-06-01
**テストソース**: .issue/397/testing.md
**サーバー**: http://localhost:5175（`pnpm dev`）
**認証**: admin セッションを `sessions` テーブルに直接注入し `__Host-session` クッキーで認証（ログイン serverfn は agent-browser から 403 になるため）

| TC | テスト名 | 種別 | 結果 | 備考 |
|----|---------|------|------|-------|
| TC-1 | 既定値が初期表示される（override 無し） | 正常系 | PASS | 27トークン全行が既定値入りで表示 |
| TC-2 | override の表示（上書き中バッジ・編集値・既定に戻す有効化） | 正常系 | PASS | DB に override 注入して表示を検証 |
| TC-3 | 既定外の任意キー override（後方互換） | 正常系 | PASS | `--custom-x` が編集可能名＋「削除」＋既定値ラベル無しで表示 |
| TC-4 | すべてリセットボタンの活性制御 | 正常系 | PASS | override 無し→disabled / 有り→enabled |
| TC-S | 保存・リセット mutation（serverfn POST） | - | 自動テストで担保 | agent-browser からの serverfn POST は 403 CROSS_ORIGIN（MEMORY 既知事項）。integration テスト 529 件で担保 |

**合計**: 4 件（PASS: 4 / FAIL: 0）。mutation 系は integration テストに委譲。

## 検証中に発見した環境データ問題（スコープ外・要検討）

ローカル D1 の `instance_settings.design_tokens_json` が `"{}"` で保存されており、`InstanceSettings` の rehydrate（`{tokens:{}}` 形を期待）で `Cannot convert undefined or null to object` を投げ、`/admin/design` と `/admin/prompts` が「アクセスできません」になっていた。これは本Issueの変更とは無関係の既存データ不整合（列デフォルト `'{}'` が rehydration 形 `{"tokens":{}}` と不一致）。検証のためローカル行を `{"tokens":{}}` に修復した。スキーマデフォルトと rehydration 形の不一致は潜在バグの可能性があり、Phase 4 で起票を検討する。
