# 動作確認計画 — Issue #60: /admin/llm が "Stored instance_settings violates invariants" で 500

**Issue:** #60
**作成日:** 2026-05-21

---

## 確認環境

このIssueの変更を確認するために必要な手順のみ記載。

### 検証環境の起動

```bash
pnpm db:apply:local   # 新規マイグレーション 0009_drop_legacy_instance_settings.sql を含むマイグレーションを適用
pnpm dev              # 開発サーバー起動（Vite via Cloudflare workerd）
```

ブラウザで起動 URL（既定 `http://localhost:3000` 付近、vite が出力する URL）を開く。検証には admin と一般ユーザー両方を使う。ベース seed `.manual-test/2026-05-17/seed.sql` で admin (`admin@example.com` / `Password123!`) が用意される（未投入なら下記コマンドで投入）。

```bash
pnpm db:execute:local .manual-test/2026-05-17/seed.sql   # admin ユーザーを含むベース seed 投入
```

### デプロイ方法

ステージング・本番への反映は本Issueの動作確認では行わない（検証環境で確認可能）。デプロイが必要になった場合は以下を使用:

```bash
pnpm deploy:staging        # ステージング環境への反映
pnpm db:apply:staging      # ステージング D1 へマイグレーション適用（本番 D1 には legacy 行が存在しない想定だが念のため）
```

## 確認項目

### 1. 汚染環境再現 → マイグレーション修復 → save 動作

- **目的:** 既存の汚染環境（legacy `limits_json` / `design_tokens_json` 行を持つ）に対し、新規マイグレーションが自動修復し、修復後 admin UI から save が完了することを確認する。
- **手順:**
  1. 汚染行を明示的に投入する:
     ```bash
     pnpm db:execute:local .issue/29/.manual-test/seed.sql
     ```
     （`.issue/{1,8,29,30}` のいずれでも可。本ステップは Issue #60 の修正コミットを取り込む**前**の状態を想定して legacy 行を再現する。修正後の seed が legacy shape を投入しなくなっているので、確実に legacy 行を作るためには git stash 等で修正前の seed を一時的に流すか、下記の手動 INSERT を使う）

     手動で legacy 行を作る場合:
     ```bash
     pnpm db:execute:local /dev/stdin <<'SQL'
     DELETE FROM instance_settings WHERE id = 'singleton';
     INSERT INTO instance_settings (
       id, llm_provider, llm_model, llm_api_key_source, llm_api_key_ciphertext,
       prompts_json, design_tokens_json, registration_open, registration_closed_reason,
       limits_json, version, updated_at
     ) VALUES (
       'singleton', 'anthropic', 'claude-opus-4-7', 'env', NULL,
       '{}', '{}', 1, NULL,
       '{"perUserMaxNotes":10000,"perUserMaxMediaBytes":1073741824,"perFileMaxBytes":52428800,"bulkSelectionMax":100}',
       0, '2026-05-01T00:00:00.000Z'
     );
     SQL
     ```
  2. （修正前の状態を再現したい場合）`/admin/llm` を開くと 500 になることを確認
  3. `pnpm db:apply:local` を再度実行 → 新規マイグレーション `0009_drop_legacy_instance_settings.sql` が適用されることを確認
  4. legacy 行が削除されていることを確認:
     ```bash
     pnpm db:execute:local /dev/stdin <<'SQL'
     SELECT count(*) FROM instance_settings WHERE id = 'singleton';
     SQL
     ```
     → `0` が返ることを確認
  5. `pnpm dev` で開発サーバーを起動、admin でログインして `/admin/llm` を開く
  6. LLM 設定フォームが 200 で表示される（model: `claude-3-5-sonnet-latest`、apiKeySource: `env` などのデフォルト値）
  7. フォームから model を別の値（例: `claude-opus-4-7`）に変更して保存
  8. ページをリロード → 値が永続化されていることを確認（adapter `save()` 経路で OCC バージョン 0 → 1 の遷移が正常に完了）
- **期待結果:**
  - マイグレーション適用で legacy 行が削除
  - `/admin/llm` が 200 で開ける
  - save 操作が成功し、永続化されている
- **確認ポイント:** フォーム表示値が `defaultLimits()`（`maxUploadBytesPerDay: 1 GiB`, `maxIngestionBytes: 32 MiB` 等）と一致すること。save 後の `version` が 1 になっていること（`pnpm db:execute:local` の `SELECT version FROM instance_settings;` で確認可能）

### 2. 新規環境（行なし → default フォールバック）

- **目的:** `instance_settings` 行が一度も挿入されていない新規環境で、`get()` のフォールバック経路が正しく動くことを確認する。
- **手順:**
  1. `.wrangler/state` ディレクトリを削除
     ```bash
     rm -rf .wrangler/state
     ```
  2. `pnpm db:apply:local`（マイグレーション 0001〜0009 すべて適用、行は何も挿入されない）
  3. ベース seed を投入: `pnpm db:execute:local .manual-test/2026-05-17/seed.sql`
  4. `pnpm dev` で起動、admin でログイン
  5. `/admin/llm` を開く
- **期待結果:** `/admin/llm` が 200 で開ける。フォームに `defaultLimits()` / `defaultLLM()` の値が表示される。
- **確認ポイント:** マイグレーション 0009 の DELETE 条件が新規環境では no-op になっていること（500 や hang が起きないこと）。

### 3. 正規行温存（マイグレーション破壊チェック）

- **目的:** マイグレーション 0009 の削除条件 `json_type IS NULL` が、現行スキーマに準拠した正規行を温存することを確認する。
- **手順:**
  1. 既存 DB（汚染あり or なし）に対して、現行スキーマで正規行を投入:
     ```bash
     pnpm db:execute:local /dev/stdin <<'SQL'
     DELETE FROM instance_settings WHERE id = 'singleton';
     INSERT INTO instance_settings (
       id, llm_provider, llm_model, llm_api_key_source, llm_api_key_ciphertext,
       prompts_json, design_tokens_json, registration_open, registration_closed_reason,
       limits_json, version, updated_at
     ) VALUES (
       'singleton', 'anthropic', 'claude-opus-4-7', 'env', NULL,
       '{}',
       '{"tokens":{}}',
       1, NULL,
       '{"maxUploadBytesPerDay":1073741824,"maxIngestionBytes":33554432,"maxNoteBytes":1048576,"maxExportArtifactBytes":268435456,"maxShareLinksPerNote":16,"editLockTtlSec":300,"trashRetentionDays":30}',
       3, '2026-05-21T00:00:00.000Z'
     );
     SQL
     ```
  2. `pnpm db:apply:local` を再実行（マイグレーション 0009 が再走するかは wrangler の ledger 次第。初回適用済みなら no-op になるはずだが、`.wrangler/state` を新たに作って `db:apply:local` するシナリオで検証）
  3. 行が残っていることを確認:
     ```bash
     pnpm db:execute:local /dev/stdin <<'SQL'
     SELECT version, llm_model FROM instance_settings WHERE id = 'singleton';
     SQL
     ```
     → `version = 3`, `llm_model = 'claude-opus-4-7'` が温存されていること
- **期待結果:** 正規行（`limits_json` に `maxUploadBytesPerDay` あり、`design_tokens_json` に `tokens` あり）はマイグレーションで削除されない。
- **確認ポイント:** マイグレーション 0009 が一度も適用されていない `.wrangler/state` を用意してから上記行を投入し `pnpm db:apply:local` するのが最も忠実な再現。

### 4. /signup 経路の回復

- **目的:** Issue #60 のコメントで報告された「サインアップが 500」が修正によって解消されることを確認する。
- **手順:**
  1. 汚染行を再現（確認項目1の手順1と同様）
  2. `pnpm db:apply:local` でマイグレーション適用 → 行削除確認
  3. `pnpm dev` で起動
  4. ログアウト状態で `/signup` を開く
  5. 新規メールアドレス（例: `signup-test-001@example.com`）でアカウント作成を実行
  6. メール検証フローがある場合はそれも完了させて、サインアップが正常に通ることを確認
- **期待結果:** `/signup` ページが 200 で開け、アカウント作成が成功する（500 にならない）。
- **確認ポイント:** `signUp` ユースケース内の `instanceSettingsRepository.get()` が `default()` を返してフローが進むこと。

## エッジケース・異常系

### 1. マイグレーション再適用の冪等性

- **目的:** マイグレーション 0009 が何度走っても副作用を起こさないこと。
- **手順:** `pnpm db:apply:local` を 2 回連続実行。2 回目は `d1_migrations` ledger により skip されるはず。仮に再実行されても `DELETE WHERE` で対象がなければ no-op。
- **期待結果:** エラーなし、副作用なし。

## 既存機能への影響確認

- 他の admin 画面（`/admin/metrics`, `/admin/prompts`, `/admin/design`, `/admin/registration`）も同じ `loadInstanceSettings` 経由なので、`/admin/llm` 修復と同時に 200 になることを軽く確認。
- 自動テスト: `pnpm typecheck && pnpm lint && pnpm test` で回帰がないこと（コード変更なしなので影響しないはず）。

## 確認チェックリスト

- [ ] 確認項目1: 汚染環境再現 → マイグレーション修復 → save 動作
- [ ] 確認項目2: 新規環境で `/admin/llm` がフォールバック経路で 200
- [ ] 確認項目3: 正規行が温存される
- [ ] 確認項目4: `/signup` 経路の回復
- [ ] エッジケース1: マイグレーション再適用の冪等性
- [ ] 既存機能: 他の admin 画面が 200 で開ける
- [ ] 既存機能: `pnpm typecheck && pnpm lint && pnpm test` 緑
