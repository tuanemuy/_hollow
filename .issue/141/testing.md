# 動作確認計画 — Issue #141: feat(llm): unified error sanitizer for connection-ping / provider responses

**Issue:** #141
**作成日:** 2026-05-22

---

## 確認環境

このIssueの変更を確認するために必要な手順のみ記載（プロジェクト全体のセットアップは省略）。

### 検証環境の起動

```bash
pnpm dev
```

ローカル Cloudflare Workers 互換の dev サーバーが起動する。LLM 接続テストは admin 画面（`/admin/settings/llm`）から実行する。

### 自動テスト実行

```bash
pnpm test:unit
```

`sanitizeErrorReason` の新規テストおよび更新した既存テストが pass することを確認する。

### 静的検証

```bash
pnpm typecheck && pnpm lint:fix && pnpm format
```

CLAUDE.md 規定通り、変更後に実行する。

### デプロイ方法

本 Issue の変更確認は検証環境（`pnpm dev`）のみで完結する。ステージングに上げる必要が出た場合は `pnpm deploy:staging`。

## 確認項目

### 1. secret 入り baseURL のエラー文字列マスキング

- **目的:** baseURL に secret を含めた状態で接続テストを実行しても、エラーバナーに secret が露出しないことを確認する。
- **手順:**
  1. `pnpm dev` で検証環境を起動。
  2. admin で LLM 設定画面（OpenAI provider）を開く。
  3. baseURL に `https://invalid.example.com/?key=fake-secret-xxx&api-version=2024-02-01` を入力。API key 欄には任意のダミー値を入れる。
  4. 「接続テスト」ボタンを押下。
  5. 表示されるエラーメッセージを確認する。
- **期待結果:** エラーメッセージ内に `fake-secret-xxx` が含まれない（query 全体が `?…` などにマスクされている、または `key=` の値が `***` に置換されている）。
- **確認ポイント:** DevTools の Network タブで `llm.test` 系の server function レスポンスを開き、`error` フィールドが masking 済みであることも併せて確認する。

### 2. prefix 付きエラー reason の UI 表示

- **目的:** 受け入れ基準「既知 category に正規化された reason が UI に表示される」を確認する。
- **手順:**
  1. admin で LLM 設定画面を開く。
  2. baseURL は正しい OpenAI 互換エンドポイントを入力。
  3. API key 欄に明らかに無効な値（例: `sk-invalid-test-xxx`）を入力。
  4. 「接続テスト」を実行。
- **期待結果:** エラー reason に何らかの category 風 prefix が付いた文字列が表示される。
  - fetch 自体が失敗する経路（network/timeout 等）では `network:` / `timeout:` のような sanitizer の category prefix。
  - HTTP 4xx/5xx で provider レスポンス body が返る経路では、provider の `error.type`（OpenAI なら `invalid_request_error:`、Anthropic なら `invalid_request_error:` / `authentication_error:` 等）が prefix。これは ADR-004 で「4xx body は masking のみ・category 化はしない」と決めたため。
- **確認ポイント:** いずれの経路でも生の英文メッセージが prefix なしで露出していないこと。

### 3. 接続成功系の回帰確認

- **目的:** sanitize 適用が成功系の挙動を壊していないことを確認する。
- **手順:**
  1. admin で OpenAI / Anthropic / Gemini いずれかの provider を選び、有効な baseURL と API key を入力。
  2. 「接続テスト」を実行。
- **期待結果:** 成功表示（`接続成功` 等）が出る。レイテンシ表示も正常。
- **確認ポイント:** 成功時の戻り値経路には sanitize の影響がないこと。

## エッジケース・異常系

### 1. fetch 自体が失敗する経路（TypeError）

- **目的:** Workers ランタイムが `fetch` で失敗し URL を含む `TypeError` を投げるケースで、URL の query 部分がマスクされることを確認する。
- **手順:**
  1. admin で OpenAI 設定の baseURL に到達不能ホスト `https://nonexistent.example.invalid/?key=should-be-hidden` を入力。
  2. 「接続テスト」を実行。
- **期待結果:** エラーメッセージに `network: ...` のような prefix が付き、URL の query 部分（`key=should-be-hidden`）が出力されない。

### 2. provider レスポンス body 由来エラー（messagesClient 経由）

- **目的:** ノート保存等の通常フローで provider 4xx/5xx が返った時、エラーメッセージに secret が含まれないことを確認する（masking のみ適用）。
- **手順:**
  1. 無効な API key を設定した状態で AI 機能（要約や OCR 等、`messagesClient` を使う機能）を実行。
  2. UI に表示されるエラーメッセージを確認する。
- **期待結果:** category 文言（既存 mapper が担う `LLMAuthenticationError` 等の固定メッセージ）が表示され、もし provider レスポンスに secret-like pattern が含まれていてもマスクされている。
- **確認ポイント:** `messagesClient` 系は category 化を mapper が既に担っているため、`auth_failed:` のような sanitizer prefix が **二重に** 付いていないことも確認（ADR-004 が守られているか）。

## 既存機能への影響確認

- LLM 接続テスト（成功系）: provider 3 種すべてで成功表示が出ること。
- ノート保存・AI 機能（messagesClient 経由）: 通常フローが壊れていないこと。エラーメッセージの文言が大きく変わるが、用途を満たすこと。
- log 出力: presentation 層の serializer 経由で出力される error log に secret が混入しないこと（任意確認）。

## 確認チェックリスト

- [ ] `pnpm test:unit` が pass する（sanitizer の新規テスト + 更新した既存テスト）
- [ ] `pnpm typecheck` が pass する
- [ ] `pnpm lint:fix && pnpm format` で警告がない
- [ ] 確認項目 1: secret 入り baseURL の masking
- [ ] 確認項目 2: category prefix の UI 表示
- [ ] 確認項目 3: 接続成功系の回帰確認
- [ ] エッジケース 1: fetch TypeError 経路のマスキング
- [ ] エッジケース 2: messagesClient 経由のエラー masking と二重 prefix がないこと
- [ ] 既存機能（ノート保存・AI 機能）の回帰確認
