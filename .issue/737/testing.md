# 動作確認計画 — Issue #737: 取り込み系 POST server function に CSRF 保護を追加

**Issue:** #737
**作成日:** 2026-06-30

---

## 確認環境

このIssueの変更を確認するために必要な手順のみ記載（プロジェクト全体のセットアップは省略）。

### マイグレーション適用

ローカル D1 を最新状態にする（本 Issue 自体はスキーマ変更を伴わないが、取り込み画面を動かすため）。

```bash
pnpm db:apply:local
```

> `pnpm db:migrate` も同一コマンド（`wrangler d1 migrations apply hollow-local-d1 --local`）。どちらでもよい。

### 確認用管理者ユーザーの投入

取り込み画面はログインが必要。決め打ちの admin ユーザー＋セッションをローカル D1 に投入する。

```bash
pnpm seed:dev-admin
```

> 出力されるセッショントークン（`dev-admin-session-token`）を `__Host-session` クッキーに注入してログイン状態にする。ブラウザ自動化では出力末尾の `agent-browser cookies set` の手順に従う。

### 検証環境の起動

```bash
pnpm dev
```

> 開発サーバー（Cloudflare runtime, `vite dev --config vite.config.cloudflare.ts`）が `http://localhost:3000` で起動する。`import.meta.env.DEV === true` のため取り込みディスパッチが同一 isolate でインライン実行され、アップロード → プレビューまで追加設定なしで通る（`docs/runtime_cloudflare.md`「Local dev outbox dispatch」）。

> **CSRF 検証で最重要**: `wrangler.toml` の `APP_URL` は `http://localhost:8787`（wrangler dev 用）で、`pnpm dev`（vite）のポート 3000 と不一致。本 Issue で `csrfMiddleware` を追加した取り込み POST は `Origin`/`Referer` を `APP_URL` と照合するため、**このままだと same-origin の正規 POST（アップロード等）も cross-origin と判定され 403 になる**。正常系（AC-3 の same-origin 側）を確認するときは `.dev.vars` に `APP_URL=http://localhost:3000` を設定して `pnpm dev` を再起動する（検証後は元に戻す）。`.dev.vars` が無ければ `cp .dev.vars.example .dev.vars`。これは vite dev 経路固有のハーネス差。

### デプロイ方法

本 Issue の動作確認は検証環境（ローカル `pnpm dev`）で完結する。ステージング反映が必要な場合のみ:

```bash
pnpm deploy:staging
```

## 確認項目

### 1. same-origin の取り込み POST が従来通り成功する

- **対応する受け入れ基準:** AC-1, AC-3
- **目的:** `csrfMiddleware` 追加後も、正規のブラウザ操作（same-origin）では取り込みの一連の POST が成功すること。
- **手順:**
  1. `.dev.vars` に `APP_URL=http://localhost:3000` を設定して `pnpm dev` を起動し、admin セッションでログインする。
  2. 取り込み（アップロード）画面でファイルをアップロードする（`uploadFileFn`）。
  3. ジョブがプレビューまで進んだら、プレビューを確定する（`commitIngestionPreviewFn`）。
  4. 別のジョブで「再生成」（`regenerateIngestionPreviewFn`）と「破棄」（`discardIngestionPreviewFn`）を操作する。
  5. 失敗ジョブがあれば「再試行」（`ownerRetryIngestionJobFn`）を操作する。
- **期待結果:** いずれの操作も 200 で成功し、ノート作成・再生成・破棄・再試行が従来通り完了する。403 は出ない。
- **確認ポイント:** ブラウザ DevTools の Network で各 POST が 200 であること。`Origin` ヘッダが `http://localhost:3000` で `APP_URL` と一致していること。

### 2. GET 系が CSRF の影響を受けない

- **対応する受け入れ基準:** AC-2
- **目的:** GET 系（キュー件数バッジ・ジョブ一覧・有効プロンプト取得）が `csrfMiddleware` 追加の対象外で、従来通り動くこと。
- **手順:**
  1. 取り込み画面を開き、キューバッジ・ジョブ一覧・プロンプト表示が表示されることを確認する。
- **期待結果:** GET 系は全て 200 で表示される（`csrfMiddleware` は `SAFE_METHODS` をスキップするため、付けても付けなくても影響しないが、本 Issue では付けていないことをコード上で確認）。
- **確認ポイント:** `actions.ts` の GET 4本の middleware が `[errorResponseMiddleware]` のままであること（コードレビュー）。

## エッジケース・異常系

### 1. cross-origin POST が 403 で拒否される

- **目的:** 別オリジンから取り込み POST を投げると `csrfMiddleware` が拒否すること（本 Issue の防御の核心）。
- **手順:**
  1. `APP_URL` を `http://localhost:3000` 以外（例: `http://localhost:8787`、wrangler.toml デフォルト）にした状態で `pnpm dev` を起動する。これによりブラウザの `Origin`（3000）と `APP_URL`（8787）が不一致になり、cross-origin と同等の状況を作れる。
  2. 取り込み画面でアップロードや確定などの POST を実行する。
- **期待結果:** POST が `ForbiddenError`（403, `FORBIDDEN_CROSS_ORIGIN`）で拒否され、ジョブ作成・ノート作成・LLM 再実行が起きない。
- **確認ポイント:** Network で 403、レスポンスの `kind` が forbidden 系。サーバー側で usecase が実行されていない（DB にジョブ/ノートが増えていない）こと。

## 既存機能への影響確認

- **取り込み（#701 録音含む）**: 録音 UI は `uploadFileFn` を再利用するため、本変更で録音アップロードも CSRF 配下になる。same-origin の正規操作（確認項目1）で録音アップロードも成功することを確認する。
- **admin 系 server function**: 変更していないため影響なし（既に `csrfMiddleware` 適用済み）。
