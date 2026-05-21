# 動作確認計画 — Issue #96: `createRequestContainer` の `as unknown as RequestContainer` キャストを撤廃し、未配線ポートをコンパイル時に検出可能にする

**Issue:** #96
**作成日:** 2026-05-20

---

## 確認環境

このIssueの変更を確認するために必要な手順のみ記載。

### 検証環境の起動

```bash
pnpm db:apply:local
pnpm dev
```

`db:apply:local` はローカル D1 にマイグレーションを適用（`wrangler d1 migrations apply tanstack-start-template-d1 --local`）。`dev` は Cloudflare runtime ターゲットの開発サーバを起動（`vite dev --config vite.config.cloudflare.ts`）。

シードデータは manual-test スキルが手配する（既定の baseline seed `.manual-test/2026-05-17/seed.sql` を流す）。admin アカウントは `admin@example.com` / `Password123!`。

### デプロイ方法

なし（検証環境のみで確認できる）。

## 確認項目

### 1. `pnpm typecheck` が通る（コンパイル時保証）

- **目的:** 本Issueの核心 — `satisfies RequestContainer` により全 11 ポートが配線済みであることをコンパイル時に保証する。
- **手順:**
  1. `pnpm typecheck` を実行する。
- **期待結果:**
  - typecheck がエラーなく完了する。
  - 仮に `createRequestContainer` の return literal から任意のポートを 1 つ削除すると、`satisfies RequestContainer` が「property is missing」エラーを出す（コンパイル時検出の動作確認）。
- **確認ポイント:**
  - `as unknown as RequestContainer` キャストがソース上に残っていないこと（`grep "as unknown as RequestContainer" app/core/application/di/serverCloudflare.ts` で 0 件）。

### 2. `/admin`（AdminDashboard）が 200 で描画される

- **目的:** PR #95 の挙動を維持し、`usageMetricsProvider.collect()` 経路で TypeError を出さないことを確認。本Issue で新たに配線された他ポートに副作用が無いことも合わせて確認。
- **手順:**
  1. admin (`admin@example.com` / `Password123!`) でログインする。
  2. `/admin` を開く。
- **期待結果:**
  - ステータス 200 でページが表示される。
  - ダッシュボード見出しとメトリクス 4 カードが描画される。
- **確認ポイント:**
  - ブラウザ DevTools コンソールに `Cannot read properties of undefined (reading '...')` 系の TypeError が出ない。
  - 500 系のエラーオーバーレイが出ない。

### 3. `/admin/metrics` が 200 で描画される

- **目的:** PR #95 の挙動維持。
- **手順:**
  1. 確認項目 2 と同じセッションのまま `/admin/metrics` を開く。
- **期待結果:**
  - ステータス 200 でページが表示される。
  - 「利用状況」見出しと各セクションが描画される。
- **確認ポイント:**
  - TypeError が出ない。

### 4. `/admin/llm`（LLM 設定ページ）が 200 で描画される

- **目的:** `secretBox` を `NullSecretBox` fallback として配線したことが admin/llm ページ描画に副作用しないことを確認。`AdminSettingsService` が描画時点で `decrypt` を呼ばない設計を実機で検証する。
- **手順:**
  1. 確認項目 2 と同じセッションのまま `/admin/llm` を開く（初期状態: `LLMConfig` 未保存）。
- **期待結果:**
  - ステータス 200 でページが表示される。
  - LLM 設定フォーム（プロバイダー選択 / api key 入力欄など）が描画される。
- **確認ポイント:**
  - サーバログに `SecretBoxError(KeyUnavailable)` が出ない（描画時に decrypt が呼ばれないことの確認）。
  - TypeError が出ない。

### 5. `/admin/registration` 等の他 admin ページが 200 で描画される

- **目的:** 配線変更による既存 admin 動線への副作用がないことを確認。
- **手順:**
  1. `/admin/registration`、`/admin/users`、`/admin/jobs` を順に開く。
- **期待結果:**
  - 各ページがステータス 200 で描画される（既存挙動の維持）。
- **確認ポイント:**
  - TypeError が出ない。

### 6. 一般ユーザー動線（note 一覧・閲覧）が変わらない

- **目的:** 一般ページが新規 Stub 経路に触れず影響を受けないことを確認。
- **手順:**
  1. 一般ユーザー（例: `mailowner@example.com` / `Password123!`）でログインする。
  2. `/notes` を開く。
  3. 任意の既存 note を開く。
- **期待結果:**
  - 全ページが正常に 200 で描画される。
- **確認ポイント:**
  - TypeError や Stub の throw（`StorageUnavailableError` 等）がログに出ない。

## エッジケース・異常系

### 1. media upload で `StorageUnavailableError` が明示的に出る

- **目的:** R2 binding 未設定の Cloudflare runtime で `objectStorage` に到達した時、TypeError ではなく明示的な domain error が出ることを確認。
- **手順:**
  1. note 作成画面で画像アップロードを試行する（または media 系 API を直接叩く）。
- **期待結果:**
  - `StorageUnavailableError("object_storage_not_configured")` が presentation 層でシリアライズされ、ユーザーに明示エラーが表示される（500 になっても TypeError ではない）。
- **確認ポイント:**
  - サーバログのエラー種別が `StorageUnavailableError` であって `TypeError` ではないこと。

### 2. ingestion 経路で MVP Stub の error が明示的に出る

- **目的:** ingestion 系 usecase に到達した時、`StubLLMProvider` / `StubPDFExtractor` 等が `BusinessRuleError(IngestionErrorCode.UnsupportedFormat)` を投げて non-retryable に倒れることを確認（既存 Stub 群と一貫した挙動）。
- **手順:**
  1. ファイルアップロード経路で ingestion job を投入する（または直接 ingestion usecase を呼ぶ）。
- **期待結果:**
  - `BusinessRuleError` がシリアライズされ「機能未提供」相当のエラーが返る。
  - ingestion worker が無限リトライしない。
- **確認ポイント:**
  - 既存 OCR/PDF Stub と同じ error code（`IngestionErrorCode.UnsupportedFormat`）が返ること。

### 3. 非 admin での `/admin` アクセスが既存挙動通り

- **目的:** DI 修正が認可経路に副作用を与えていないか確認。
- **手順:**
  1. 非 admin ユーザーでログイン。
  2. `/admin` を開く。
- **期待結果:** 既存挙動通り、403/リダイレクト/適切なエラー表示。新規の TypeError が露出していない。

## 既存機能への影響確認

- `/admin`、`/admin/metrics` は PR #95 の挙動を維持（変わらず描画される）。
- `/admin/users`、`/admin/jobs`、`/admin/registration` は本Issue 前から動作していたため、引き続き表示できる。
- 一般ユーザー動線（note 一覧・作成・閲覧）には影響しない（未配線ポートを触らないため）。
- 自動テスト（`pnpm test:unit`）の既存 1433 件は test harness 経由なので regression しない。

## 確認チェックリスト

- [ ] `pnpm typecheck` がエラーなく完了する
- [ ] `as unknown as RequestContainer` がソース上に残っていない（grep で 0 件）
- [ ] `pnpm test:unit` 全件 PASS
- [ ] `/admin` が 200 で描画される（PR #95 の挙動維持）
- [ ] `/admin/metrics` が 200 で描画される（PR #95 の挙動維持）
- [ ] `/admin/llm` が 200 で描画される（`NullSecretBox` fallback が描画に副作用しない）
- [ ] `/admin/registration` / `/admin/users` / `/admin/jobs` が 200 で描画される
- [ ] 一般ユーザーの `/notes` 動線が正常
- [ ] DevTools コンソール / サーバログに `Cannot read properties of undefined` 系の TypeError が出ていない
- [ ] media upload を試行すると `StorageUnavailableError`（500 にはなるが TypeError ではない）
- [ ] ingestion 経路を試行すると `BusinessRuleError(UnsupportedFormat)` が出て non-retryable に倒れる
- [ ] 非 admin での `/admin` アクセスが既存通り拒否される
