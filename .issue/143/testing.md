# 動作確認計画 — Issue #143: feat(admin/llm): surface env override state in UI (read-only fields + lock badge)

**Issue:** #143
**作成日:** 2026-05-22

---

## 確認環境

このIssueは admin UI の表示切替 + DTO 拡張 + usecase silent skip が中心で、DB migration は伴わない。動作確認の主な観点は (1) env override 4 ケース（全 unset / partial / 全 set / apiKey のみ）における admin UI 表示、(2) submit 経路で env override 項目が DB に書かれないこと、(3) typecheck / lint / unit / integration テスト。

### 検証環境の起動

```bash
pnpm dev
```

> Cloudflare Workers + D1 + Queues 環境で TanStack Start アプリが起動（`vite dev --config vite.config.cloudflare.ts` 経由）。

env override の状態を切り替えるには `.dev.vars` の `ADMIN_LLM_*` 4 変数を編集してから `pnpm dev` を再起動する。

### 自動テスト

```bash
pnpm typecheck
pnpm lint:fix
pnpm format
pnpm test:unit
pnpm test:integration
```

### デプロイ方法

本 Issue は admin UI / DTO / usecase 内の表示・保存挙動の変更で、本番反映は通常の deploy で完了する。

```bash
pnpm deploy:staging       # ステージング fetch worker
```

事前に dry-run で確認:

```bash
pnpm deploy:staging:dry
```

---

## 確認項目

### 1. 全 env unset — 従来挙動

- **目的:** env override が無い場合に従来通り全 field が編集可能で、DB resolution が機能することを確認
- **手順:**
  1. `.dev.vars` の `ADMIN_LLM_API_KEY` / `ADMIN_LLM_PROVIDER` / `ADMIN_LLM_MODEL` / `ADMIN_LLM_BASE_URL` を全て空文字（または未定義）にする
  2. `pnpm dev` を再起動
  3. admin ログインして `/admin/llm` を開く
  4. provider / model / API key / baseURL 全 field を編集して保存
- **期待結果:**
  - 全 input が編集可能（disabled なし）
  - 「環境変数で固定中」バッジが表示されない
  - 保存後、`D1` の `instance_settings.llm_*` カラムが入力値で更新される
  - 全体 banner が表示されない
- **確認ポイント:**
  - 既存 UI 文言（`apiKeySource === 'env'` 時の hint 等）も従来通り出る

### 2. ADMIN_LLM_PROVIDER のみ set — partial override

- **目的:** 1 field のみ env override されたケースで、該当 field が disabled、他は編集可能になることを確認
- **手順:**
  1. `.dev.vars` で `ADMIN_LLM_PROVIDER="openai"` のみ set、他 3 つは空文字
  2. `pnpm dev` を再起動
  3. `/admin/llm` を開く
  4. provider 以外の field を編集して保存
- **期待結果:**
  - provider select だけ `disabled` 表示、「環境変数で固定中」バッジ付き
  - 表示値は env 由来の現値（`openai`）
  - model / API key / baseURL は編集可能
  - 保存後、provider カラムは DB の元値を保持（silent skip）、他は更新される
  - logger.warn に `admin_llm_env_override_skip` 相当のログが出力（fields: ["provider"]）
- **確認ポイント:**
  - provider 変更時の警告メッセージ（apiKey 再入力強制）が dead code 化していること

### 3. 全 4 env set — 全体 lock

- **目的:** 4 つの env 全てが set されたケースで、UI 全体が lock 状態になることを確認（受け入れ基準 4）
- **手順:**
  1. `.dev.vars` で 4 つ全部 set:
     ```
     ADMIN_LLM_PROVIDER="anthropic"
     ADMIN_LLM_MODEL="claude-3-5-sonnet-latest"
     ADMIN_LLM_API_KEY="sk-ant-test"
     ADMIN_LLM_BASE_URL="https://api.anthropic.com"
     ```
  2. `pnpm dev` を再起動
  3. `/admin/llm` を開く
- **期待結果:**
  - 4 つの input / select すべて `disabled` 状態
  - 全 field に「環境変数で固定中」バッジ
  - 画面上部に「全て環境変数で固定中、本ページからは変更できません」banner
  - 保存ボタンが `disabled`
  - 表示値は env 由来の現値
- **確認ポイント:**
  - banner の文言が分かりやすいか
  - 保存ボタン disabled でも form 自体は壊れていないか

### 4. ADMIN_LLM_API_KEY のみ set — apiKey override

- **目的:** apiKey のみ env override されたケースで、API key 欄が disabled になり、API key 実値が UI に流れていないことを確認
- **手順:**
  1. `.dev.vars` で `ADMIN_LLM_API_KEY="sk-ant-test"` のみ set、他 3 つは空文字
  2. `pnpm dev` を再起動
  3. `/admin/llm` を開いて Chrome DevTools の Network タブを開く
  4. ページロード時の admin settings レスポンス JSON を確認
- **期待結果:**
  - API key 入力欄が `disabled`、「環境変数で固定中」バッジ
  - **レスポンス JSON に `sk-ant-test` 等の env 由来 API key 実値が含まれていない**（boolean のみ）
  - provider / model / baseURL は編集可能
- **確認ポイント:**
  - secret hygiene の不変条件（apiKey 実値の非露出）が守られているか

### 5. env 由来現値の表示

- **目的:** DB に古い値が残っていても admin UI には env 由来の現値が表示されることを確認（ADR-003）
- **手順:**
  1. 確認項目 1 の状態で provider / model を編集して DB に保存（例: provider=openai, model=gpt-4o）
  2. `.dev.vars` で `ADMIN_LLM_PROVIDER="anthropic"` `ADMIN_LLM_MODEL="claude-3-5-sonnet-latest"` を set
  3. `pnpm dev` を再起動
  4. `/admin/llm` を再表示
- **期待結果:**
  - provider select / model input の表示値が env 値（anthropic / claude-3-5-sonnet-latest）
  - DB に残った値（openai / gpt-4o）ではない

---

## エッジケース・異常系

### 1. 直接 POST で env override 項目を送信

- **目的:** UI 側 `disabled` を回避して transport 経由で env override 項目を送信した場合に usecase が silent skip することを確認（受け入れ基準 3 の最終防衛線）
- **手順:**
  1. 確認項目 2 の状態（`ADMIN_LLM_PROVIDER` のみ set）で `/admin/llm` を開く
  2. DevTools で provider select の `disabled` 属性を手動削除
  3. provider を別の値（例: gemini）に変えて保存
- **期待結果:**
  - usecase が provider input を破棄、DB の元値を保持
  - logger.warn に silent skip ログが出力
  - admin UI 表示は env 値のままで変わらない
  - エラー表示は出ない（reject ではなく silent skip 方針）

### 2. ADMIN_LLM_BASE_URL=""（空文字）

- **目的:** 空文字 base URL は「override なし」として扱われることを確認（ADR-002）
- **手順:**
  1. `.dev.vars` で `ADMIN_LLM_BASE_URL=""` を set、他は未定義
  2. `pnpm dev` を再起動
  3. `/admin/llm` を開く
- **期待結果:**
  - baseURL 入力欄が編集可能（disabled でない）
  - 「環境変数で固定中」バッジが表示されない
  - consumer 経路（`resolveConsumerLlmConfig`）と同じ判定（length > 0）で一致

---

## 既存機能への影響確認

- **`getInstanceSettings` 経路**: env が全 unset の状態で従来と完全に同じ DTO を返すこと（`envOverrides` 4 つは全て false、masking 挙動不変）
- **`updateLLMConfig` 経路**: env が全 unset の状態で従来と完全に同じ DB 更新挙動になること
- **consumer 経路（`resolveConsumerLlmConfig`）**: 本 Issue では一切触らないため挙動不変。ingestion ジョブで LLM 呼び出しが env > DB > Stub の優先順位で動くことを既存テストで確認
- **`testLLMConnection`**: env override 中も form 上の draft 値で接続テストできる（既存挙動踏襲）

---

## 確認チェックリスト

- [ ] 全 env unset → 全 field 編集可能、保存で DB 更新
- [ ] `ADMIN_LLM_PROVIDER` のみ set → provider のみ disabled + バッジ
- [ ] 全 4 env set → 全体 lock + banner + 保存ボタン disabled
- [ ] `ADMIN_LLM_API_KEY` のみ set → API key 欄 disabled、レスポンスに実値が漏れない
- [ ] env 値変更 → 再起動で UI 表示値が env の新値に追従
- [ ] 直接 POST で env override 項目送信 → silent skip + warn ログ + DB 元値保持
- [ ] `ADMIN_LLM_BASE_URL=""` → override なしと判定
- [ ] `.dev.vars.example` の 3 provider 対応セクションが Issue 本文テンプレと一致
- [ ] `.dev.vars.example` に provider 切替ペア設定例 4 種が含まれる
- [ ] `pnpm typecheck` 通過
- [ ] `pnpm lint:fix && pnpm format` 通過
- [ ] `pnpm test:unit` 通過
- [ ] `pnpm test:integration` 通過
- [ ] consumer 経路の既存テスト不変
