# 動作確認計画 — Issue #261: instance_settings: skip version bump when payload is identical to current state

**Issue:** #261
**作成日:** 2026-05-28

---

## 確認環境

本 Issue の変更は domain entity の no-op 最適化と application 層の save スキップであり、UI からの手動操作で観測する効果は「同じ内容で連続更新したとき、`updated_at` / `version` が進まないこと」。確認は自動テスト（domain ユニット + application 統合）が主、補助として開発サーバーで管理画面を触っての確認を行う。

### 検証環境の起動

```bash
pnpm dev
```

(`package.json` の `scripts.dev` に存在。Cloudflare Workers 互換のローカル開発サーバーが起動する。)

### デプロイ方法

なし（検証環境のみで確認できる）。

### 自動テスト実行

```bash
pnpm typecheck
pnpm lint:fix
pnpm format
pnpm test:unit
pnpm test:integration
```

---

## ブラウザ検証のスコープ

本 Issue の変更は domain / application 層の内部最適化（同一 payload 連投時に save をスキップして version を進めない）のみで、観測対象は永続化された `version` 値。管理画面 UI 上には `version` の表示がなく、ブラウザ操作だけでは挙動の差を観測できないため、`manual-test` スキルでの自動ブラウザ検証は実施しない。確認は自動テスト（domain ユニット + application 統合）と、必要に応じて D1 直接 query での手動 spot check で行う。

## 確認項目

### 1. domain ユニットテストが新規ケースを含めてすべて green

- **目的:** `InstanceSettings.updatePrompt` / `updateDesignTokens` が内容一致時に同一参照を返し、内容変化時には version を進めることを確認する。
- **手順:**
  1. `pnpm test:unit -- app/core/domain/adminSettings/__tests__/entity.test.ts` を実行
- **期待結果:** 既存テストすべて pass、追加した no-op テストおよび「内容変化で bump」テストもすべて pass。
- **確認ポイント:** 追加テスト名（"updatePrompt with an identical template is a no-op (same instance)"、"updateDesignTokens with identical tokens is a no-op (same instance)" など）が結果に含まれること。

### 2. application 統合テストが新規ケースを含めてすべて green

- **目的:** ユースケース経由でも同一 payload 連投時に save がスキップされ version が進まないことを確認する。
- **手順:**
  1. `pnpm test:integration -- app/core/application/adminSettings/__tests__/adminSettings.integration.test.ts` を実行
- **期待結果:** 既存テストすべて pass、追加した「同一 payload 連投で version 据置」テストも pass。

### 3. 手動 spot check (任意): D1 直接観測

- **目的:** 自動テストでカバーできる範囲だが、念のため Cloudflare ローカル D1 に対して同一 payload 連投時の `version` 据置をエンドツーエンドで確認する。
- **手順:**
  1. `pnpm dev` でサーバー起動
  2. 管理画面プロンプト編集で任意の purpose を保存
  3. wrangler のローカル D1 を `wrangler d1 execute ... --command "select version, updated_at from instance_settings"` 等で照会して値を控える
  4. 同じ内容で再保存し、再度同じクエリで値を確認
- **期待結果:** 2回目クエリでも `version` / `updated_at` が変化していない。
- **確認ポイント:** 自動テストが pass している場合、この手動確認は重複となるため必須ではない。

## エッジケース・異常系

### 1. プロンプトの expectedVariables 順だけ違う入力 → 内容変化扱いになるか確認

- **目的:** `PromptTemplate.create` が `[...new Set(...)]` で重複除去＋出現順保持するため、同じ集合でも入力順が違えば作られる template の `expectedVariables` 配列順は変わる。`promptTemplatesEqual` は順序ありで比較するため、入力順が変われば「内容変化」として version が +1 されることになる。これを domain ユニットテストで明示的に確認するか、または「順序不問の集合比較に切り替える」設計判断を取るかどうかを実装前に確認する。
- **手順:** 実装時に判断 — まず順序あり比較で実装し、もし意図しない bump が起きる UI フローがあれば順序不問に変更する。
- **期待結果:** 順序あり比較で実装した場合、`['a','b']` と `['b','a']` で同じ purpose を保存すると2回目も bump される。これは仕様（PromptTemplate VO レベルで順序が変わるなら別 template と見なす）として受け入れる。

### 2. プロンプト初回設定（current.prompts[purpose] === undefined）

- **目的:** 初めて override を入れるケースで no-op 判定が誤発火しないこと。
- **手順:** domain ユニットテスト内で seed に override がない状態から `updatePrompt` を呼ぶ既存ケースで確認。
- **期待結果:** `existing === undefined` 経路を通って通常通り version が +1 される。

### 3. 空 tokens から空 tokens への更新

- **目的:** `DesignTokens.empty()` 同士の比較が同一参照扱いになり no-op になること。
- **手順:** domain ユニットテストで `seed()` の `designTokens`（empty）に `DesignTokens.create({ tokens: {} })` を渡す。
- **期待結果:** 同一参照が返り、version 据置。

## 既存機能への影響確認

- **reset 系ユースケース**: `resetPromptTemplate` / `resetAllPromptTemplates` / `resetDesignTokens` の挙動は変えていない。既存の no-op テストが引き続き pass することで確認。
- **OCC version の他ユースケースでの利用**: `updateLLM` / `setRegistrationOpen` / `updateLimits` は変更対象外。これらが従来通り version を進めることを既存テストで確認。

## 確認チェックリスト

- [ ] `pnpm typecheck` が成功
- [ ] `pnpm lint:fix` `pnpm format` が成功
- [ ] `pnpm test:unit` がすべて pass（新規テスト含む）
- [ ] `pnpm test:integration` がすべて pass（新規テスト含む）
- [ ] 既存 reset 系ユースケースの no-op テストが引き続き pass
- [ ] (任意) D1 直接観測で同一 payload 連投時の version 据置を spot check
