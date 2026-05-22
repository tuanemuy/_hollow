# TC-4: provider dropdown と conditional baseURL 表示

**結果**: PASS

## 実行ログ

| # | 操作 | 期待結果 | 実際の結果 | 判定 |
|---|------|----------|------------|------|
| 1 | `/admin/llm` にアクセス | LLM 設定ページが表示 | ページ表示成功（`http://localhost:3000/admin/llm`） | PASS |
| 2 | provider dropdown を確認 | 3 オプション（Anthropic / OpenAI-compatible / Google Gemini） | combobox に `Anthropic Claude` / `OpenAI-compatible` / `Google Gemini` の 3 オプションを確認 | PASS |
| 3 | anthropic 選択（初期状態） | baseURL フィールド非表示 | `input[name="baseURL"]` がスナップショットに存在せず | PASS |
| 4 | openai 選択 | baseURL 表示 + inline help（「OpenAI 本家は空欄」「Azure / Groq / vLLM」「`?api-version=...`」「PDF は `gpt-4o` 系」） | baseURL `<input type="url" name="baseURL">` 表示。help 文「OpenAI 本家を使う場合は空欄で OK。Azure / Groq / vLLM 等の場合は base URL（`/chat/completions` を含まないパスまで）を入力。Azure は `?api-version=...` を含めて保存」「PDF 取り込みには `gpt-4o` 系のモデル指定が必要」を確認 | PASS |
| 5 | gemini 選択 | baseURL フィールド非表示 | `input[name="baseURL"]` がスナップショットに存在せず | PASS |

## スクリーンショット

- Step 3 (anthropic): `screenshots/tc-4/step-01-anthropic.png`
- Step 4 (openai + baseURL + help): `screenshots/tc-4/step-02-openai.png`
- Step 5 (gemini): `screenshots/tc-4/step-03-gemini.png`

## 備考

- provider dropdown は `combobox "プロバイダ" [ref=e15]` として render され、HTML `<select>` ベース。
- openai 選択時の inline help は 2 段（base URL の説明 + PDF モデル指定）に分かれて render される。テスト要件「いずれか表示」を満たし、実際は全ての要素が表示された。
