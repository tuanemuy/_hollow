# 動作確認計画 — Issue #227: アップロード時のLLMレスポンスJSONパースを堅牢化する

**Issue:** #227
**作成日:** 2026-05-27

---

## 確認環境

このIssueの変更を確認するために必要な手順のみ記載。プロジェクト全体のセットアップは省略。

### 検証環境の起動

LLM adapter の内部実装変更のため、本 Issue の動作確認は主に **単体テスト** で行う。アプリの UI で end-to-end に確認したい場合は以下:

```bash
pnpm dev   # Cloudflare 開発サーバー起動
```

### デプロイ方法

ステージング・本番への反映は通常のフローに従う。本 Issue 単独で特別な手順はない。

```bash
pnpm deploy:staging          # 本体 Worker
pnpm deploy:staging:consumer # ingestion queue consumer（実際に LLM を叩く Worker）
```

## 確認項目

### 1. 共通 JSON パーサーユーティリティの動作確認

- **目的:** `extractJsonObject` が前置きテキスト・フェンス・配列・エスケープを正しく扱うこと
- **手順:**
  1. `pnpm test:unit -- jsonEnvelope` を実行
  2. すべてのテストケースが PASS であること
- **期待結果:** 前置きテキスト / フェンス / 配列フォールバック / Unicode escape / 文字列リテラル内 `}` / 空配列 / string 配列 / 非 JSON のすべてのケースで仕様通りの戻り値
- **確認ポイント:** balanced-brace スキャナが `"\"` `\\` `\u00XX` を含む JSON 文字列で誤動作しないこと

### 2. 各プロバイダの構造化出力 API 利用と request body 検証

- **目的:** OpenAI / Gemini で構造化出力フラグが request body に正しく乗ること、Anthropic で prefill がリトライ時に追加されること
- **手順:**
  1. `pnpm test:unit -- openai/llmProvider` で OpenAI テスト全 PASS を確認
  2. `pnpm test:unit -- gemini/llmProvider` で Gemini テスト全 PASS を確認
  3. `pnpm test:unit -- anthropic/llmProvider` で Anthropic テスト全 PASS を確認
- **期待結果:**
  - OpenAI: 全 `structureToHtml` / `suggestMetadata` 呼び出しで request body に `response_format: { type: "json_object" }` が含まれる
  - Gemini: `generationConfig.responseMimeType === "application/json"` が送られる
  - Anthropic: 初回呼び出しは prefill なし、リトライ呼び出しで `messages` 末尾に `{ role: "assistant", content: "{" }` が追加される
- **確認ポイント:** OCR / PDF パスは `messagesClient.test.ts` で別に検証されているが、optional 引数追加によって既存テストが壊れていないことも確認

### 3. リトライ動作の確認

- **目的:** パース失敗時に system prompt を強化して 1 回だけリトライし、2 回目成功で `structureToHtml` / `suggestMetadata` が成功すること
- **手順:**
  1. `pnpm test:unit -- llmProvider` で各 provider のリトライテストが PASS
- **期待結果:**
  - 1 回目壊れ・2 回目正常 → 成功、fetch は 2 回呼ばれる
  - 2 回連続壊れ → `LLMUnavailableError`（メッセージに "after 1 retry"）
  - リトライ時の system prompt に "JSON" 文字列が含まれる（OpenAI `json_object` モード要件）

### 4. パーサー耐性の確認

- **目的:** 前置きテキスト・配列レスポンス・フェンスなしレスポンスを 1 回で吸収できること
- **手順:**
  1. `pnpm test:unit -- llmProvider` で各 provider のパーサー耐性テストが PASS
- **期待結果:**
  - 前置きテキスト付き JSON で 1 回で成功（fetch は 1 回のみ）
  - 配列レスポンスの先頭オブジェクト採用で 1 回で成功
  - フェンスなし JSON で 1 回で成功

### 5. End-to-end のアップロード動作確認（任意 / 環境がある場合のみ）

- **目的:** 実際のアプリで「壊れた LLM レスポンス」が再現する状況を作るのは難しいため、通常の正常応答でアップロードが従来通り動くことを確認
- **手順:**
  1. `pnpm dev` で開発サーバー起動
  2. テキスト / 画像 / オーディオ / Office ファイル等をアップロード
  3. ingestion ジョブが `previewing` 状態に進むこと
- **期待結果:** 既存のアップロード動作に対するリグレッションがないこと

## エッジケース・異常系

### 1. リトライ時に prompt が "JSON" を含まないリグレッションを防ぐ

- **目的:** OpenAI `json_object` モードの prompt 内 "JSON" 必須要件を守る
- **手順:** OpenAI provider のテストで「1 回目壊れ → 2 回目の request body」を snapshot し、system content に "JSON" 文字列が含まれることを assert
- **期待結果:** test PASS

### 2. Anthropic prefill のレスポンス結合挙動

- **目的:** prefill した `{` が応答 text に含まれない場合・含まれる場合の両方で parser が正しく envelope を抽出できる
- **手順:** Anthropic provider のテストで両パターンをモックし、`structureToHtml` が成功することを確認
- **期待結果:** test PASS

### 3. 構造化出力フラグ非対応モデルでの 400 応答

- **目的:** （スコープ外として許容している）非対応モデルで 400 が返るケースを誤って success とみなさない
- **手順:** OpenAI / Gemini provider テストで「400 で `unsupported parameter`」レスポンスをモックし、`LLMUnavailableError` が throw されることを確認（既存の HTTP 400 マッピングテストでカバーされていれば追加不要）
- **期待結果:** 既存マッピングどおり `LLMUnavailableError` が throw される

## 既存機能への影響確認

- **OCR / PDF パス**: `messagesClient.ts` への optional 引数追加は OCR / PDF からは何も渡さないので影響なし。`messagesClient.test.ts` の既存テスト群が全 PASS であることで担保。
- **`runIngestionJob`**: `LLMUnavailableError` のセマンティクスは変えないため、ingestion ワーカーの分岐は不変。adapter 内でリトライが成功すれば application 層から見て成功・失敗の振る舞いは同じ。
- **`AnthropicLLMProvider` の通常呼び出し**: prefill は optional でリトライ時のみ送るため、初回呼び出しでは挙動不変。

## 確認チェックリスト

- [ ] `pnpm test:unit -- jsonEnvelope` 全 PASS
- [ ] `pnpm test:unit -- openai/llmProvider` 全 PASS（壊れた応答シナリオ追加分含む）
- [ ] `pnpm test:unit -- anthropic/llmProvider` 全 PASS（prefill 検証含む）
- [ ] `pnpm test:unit -- gemini/llmProvider` 全 PASS
- [ ] `pnpm test:unit -- messagesClient` 全 PASS（OCR / PDF 既存テスト保持）
- [ ] `pnpm typecheck` PASS
- [ ] `pnpm lint:fix && pnpm format` クリーン
- [ ] （任意）`pnpm dev` でローカル起動し、通常のアップロード操作にリグレッションがない
