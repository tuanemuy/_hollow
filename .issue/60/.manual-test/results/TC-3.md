# TC-3: 正規行温存（マイグレーション破壊チェック）

## Status: PASS

## 検証目的
正規スキーマの `instance_settings` 行（`limits_json.maxUploadBytesPerDay` あり、`design_tokens_json.tokens` あり）がマイグレーション 0009 の DELETE 述語に当たらないこと。すなわち、正規データを誤削除しないこと。

## 手順と結果

| # | 手順 | 期待 | 実測 |
|---|------|------|------|
| 1 | 正規行投入 (`version=3`, `llm_model='claude-opus-4-7'`, `design_tokens_json='{"tokens":{}}'`, `limits_json` に新キー) | INSERT 成功 | OK |
| 2 | マイグレーション DELETE SQL 実行 | 0 行削除 → `version=3, llm_model='claude-opus-4-7'` 温存 | `version=3, llm_model='claude-opus-4-7'` (温存) |
| 3 | admin ログイン後 `/admin/llm` を開く | 200 表示 + 設定が反映 | OK、`既定モデル: claude-opus-4-7` |

## スクリーンショット
- `/Users/hikaru/github.com/tuanemuy/hollow2/.issue/60/.manual-test/screenshots/tc-3/admin-llm-preserved.png`

## 所見
DELETE 述語 `json_type(limits_json, '$.maxUploadBytesPerDay') IS NULL OR json_type(design_tokens_json, '$.tokens') IS NULL` は両方の条件が NULL でない正規行を正しく除外する。version=3 の手動投入データに含まれる llm_model が UI に反映されることも確認。
