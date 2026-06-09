# 動作確認計画 — Issue #574: P23 プロンプトプレビュー（LLM実行プレビュー機構）

**Issue:** #574
**作成日:** 2026-06-10

---

## 確認環境

このIssueの変更を確認するために必要な手順のみ記載（プロジェクト全体のセットアップは省略）。本 Issue は新規テーブル `prompt_preview_counters` を追加する**スキーマ変更を伴う**ため、検証前にマイグレーション生成・適用が必須。

### マイグレーション生成・適用（スキーマ変更を伴うため必須）

```bash
pnpm db:generate    # app/core/adapters/d1/schema.ts の変更から SQL マイグレーションを生成
pnpm db:migrate     # 生成された SQL をローカル D1 (hollow-local-d1) に適用
```

- レート制限カウンタ用テーブル（手書き SQL の場合）は `pnpm db:execute:local --file <path/to.sql>` で直接適用も可。

### 検証環境の起動

```bash
pnpm dev    # vite dev (workerd) on http://localhost:3000
```

実サーバー（wrangler dev・本番に近い配信）で確認したい場合:

```bash
pnpm build && pnpm start    # dist/worker を wrangler dev で配信
```

### シードデータ準備

```bash
pnpm seed:dev-admin    # 管理者ユーザー＋有効セッションを投入（先に pnpm db:migrate 済みであること）
```

### LLM 設定に関する注意

プレビューは**実 LLM を呼び出す**。ローカルで LLM プロバイダが未設定の場合は `StubLLMProvider` が動き、プレビュー実行は「現在 AI が利用できないためプレビューできません」（`llm_preview_unavailable`）と正直に表示される。実出力の確認には管理画面で LLM プロバイダを設定する必要がある。未設定環境では「実行不可状況の正直な表示」を確認する。

### デプロイ方法

なし（検証環境のみで確認できる）。

## 確認項目

### 1. プレビュー UI のレイアウト（mock 追従）

- **目的:** 入力サンプル → 出力サンプルの2カラムと「サンプルで実行」ボタンが mock どおり表示される
- **手順:**
  1. `pnpm db:generate && pnpm db:migrate` → `pnpm seed:dev-admin` → `pnpm dev`
  2. 管理者でログインし `/settings/prompts`（P23）を開く
  3. structure / title / directory / metadata の各カードのプレビューパネルを確認
- **期待結果:** preview-panel が各カードに表示され、desktop 幅では入力／矢印／出力の3カラム grid、mobile 幅では縦積みになる
- **確認ポイント:** 寸法・色が `spec/design/pages/P23-settings-prompts.html` のトークン（hairline / surface / radius-md 等）と一致

### 2. 実行可能4用途のプレビュー実行（LLM 設定時）

- **目的:** 編集中プロンプトで実 LLM の実出力が表示される
- **手順:**
  1. LLM プロバイダ設定済みの環境で、structure のサンプル入力欄にテキストを入れ「サンプルで実行」を押す
  2. title / directory / metadata でも同様に実行（metadata は「構造化済み HTML を入力」の案内に従い HTML を入れる）
- **期待結果:** ローディング後に各用途の実出力が出力ブロックに表示される（structure→HTML、title→タイトル案、directory→ディレクトリ提案、metadata→タグ/エイリアス）。編集中プロンプトが反映される
- **確認ポイント:** ダミー固定文言ではなく実出力（虚偽表示禁止）。directory は「新規提案」として表示される

### 3. ocr_assist の「プレビュー非対応」表示

- **目的:** 実行経路の無い用途を正直に表示する
- **手順:**
  1. ocr_assist カードを確認
- **期待結果:** 「プレビュー非対応」が表示され、「サンプルで実行」ボタンが出ない

## エッジケース・異常系

### 1. レート制限超過

- **目的:** 簡易レート制限が実カウンタで効く
- **手順:**
  1. 同一ユーザーで上限回数（N=20/時）を超えてプレビュー実行する（または integration で境界を検証）
- **期待結果:** 上限超過後は「プレビューの実行回数上限に達しました。しばらくしてから再度お試しください」（`prompt_preview_rate_limited`）が表示される

### 2. LLM 未設定 / LLM 障害の正直な表示

- **目的:** 実行不可状況を汎用フォールバックではなく専用文言で表示する
- **手順:**
  1. LLM 未設定環境（StubLLMProvider）でプレビュー実行
- **期待結果:** 「現在 AI が利用できないためプレビューできません」（`llm_preview_unavailable`）が表示される。「ファイル形式に対応していません」等の無関係文言は出ない

### 3. サンプル長上限

- **目的:** transport boundary でサンプル長が検証される
- **手順:**
  1. サンプル入力欄に上限（4,000 文字）を超える入力を試す
- **期待結果:** textarea の `maxLength` で入力が制限される / サーバ側 validation でも拒否される

### 4. 未ログイン時のリダイレクト

- **目的:** 認証必須
- **手順:**
  1. ログアウト状態で `/settings/prompts` にアクセス
- **期待結果:** `/login` にリダイレクトされる

## 既存機能への影響確認

- カスタムプロンプトの保存（既存 `updateUserPromptFn`）・デフォルトに戻すが引き続き動作する
- 既存の ingestion パイプライン（`runIngestionJob`）の LLM 呼び出しに影響がない（プレビューは UoW 外の独立経路）

## 確認チェックリスト

- [ ] migration 適用後に `prompt_preview_counters` テーブルが作成される
- [ ] 4用途のプレビューパネルが mock どおり表示される（desktop 横並び / mobile 縦）
- [ ] LLM 設定時、4用途で実出力が表示される（ダミーでない）
- [ ] ocr_assist が「プレビュー非対応」表示・実行ボタンなし
- [ ] レート制限超過で専用文言が表示される
- [ ] LLM 未設定/障害で専用の正直な文言が表示される（汎用フォールバックでない）
- [ ] 未ログイン時に `/login` へリダイレクト
- [ ] 既存のプロンプト保存・ingestion パイプラインが壊れていない
