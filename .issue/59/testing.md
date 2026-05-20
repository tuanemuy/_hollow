# 動作確認計画 — Issue #59: /admin Dashboard と /admin/metrics の 500 を解消

**Issue:** #59
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

### 1. `/admin`（AdminDashboard）が 200 で描画される

- **目的:** `usageMetricsProvider.collect()` 呼び出しで TypeError を出さず、ダッシュボードが描画されることを確認する。
- **手順:**
  1. admin (`admin@example.com` / `Password123!`) でログインする。
  2. `/admin` を開く。
- **期待結果:**
  - ステータス 200 でページが表示される。
  - 「ダッシュボード」見出しと「Hollow インスタンス全体の状態」サブテキストが描画される。
  - メトリクス 4 カード（ユーザー数 / ストレージ消費 / 当日アップロード / LLM 呼び出し）が `—` または「取得失敗」とともに描画される。
  - alerts が空のため「All systems operational」バナーが表示される。
- **確認ポイント:**
  - ブラウザ DevTools コンソールに `Cannot read properties of undefined (reading 'collect')` の TypeError が出ていない。
  - 500 系のエラーオーバーレイが出ていない。

### 2. `/admin/metrics`（MetricsPage）が 200 で描画される

- **目的:** Metrics ページでも同じ DI 不備が解消されていることを確認する。
- **手順:**
  1. 確認項目 1 と同じセッションのまま `/admin/metrics` を開く。
- **期待結果:**
  - ステータス 200 でページが表示される。
  - 「利用状況」見出し・「現在の利用量」セクション 4 カード（`—` 表示）。
  - 「インスタンス上限」セクションの `LimitsCard` がインスタンス設定の各上限値で埋まる（`loadInstanceSettings` 経路は独立しており値が出る）。
  - 「登録ポリシー」セクションが現在の `registration.open` 状態で描画される。
- **確認ポイント:**
  - メトリクスカードが `null` 系の値でも、`LimitsCard` 側はちゃんと値が出る（並走 fetch の片側だけ no-op になる動作）。

## エッジケース・異常系

### 1. 非 admin ユーザーで `/admin` にアクセスした際の挙動が変わっていない

- **目的:** DI 修正が認可経路に副作用を与えていないか確認する。
- **手順:**
  1. 非 admin ユーザー（例: `mailowner@example.com` / `Password123!`）でログインする。
  2. `/admin` または `/admin/metrics` を開く。
- **期待結果:** 既存挙動通り、403／リダイレクト／適切なエラー表示など（既存の `requireAdminUser` の振る舞いに従う）。本修正で新規の TypeError が露出していない。

## 既存機能への影響確認

- `/admin/users`・`/admin/jobs`（Issue #3 で実装済み）は本修正前も正常動作していたため、修正後も同じく表示できる。
- `/admin/llm` の既存不具合（`SystemError: Stored instance_settings violates invariants`）は本Issue範囲外で残置される。これは別事象（Issue #3 analysis.md セクション B 参照）。

## 確認チェックリスト

- [ ] `/admin` が 200 で描画される（メトリクスカードは「取得失敗」/`—`、alerts なしバナー表示）
- [ ] `/admin/metrics` が 200 で描画される（メトリクスカードは `—`、`LimitsCard` は値あり、登録ポリシーは現状値表示）
- [ ] DevTools コンソール / サーバログに `Cannot read properties of undefined (reading 'collect')` が出ていない
- [ ] 非 admin での `/admin` アクセス時に既存通りの拒否挙動
- [ ] `/admin/users` が引き続き表示できる（DI 修正による意図しない副作用が無い）
