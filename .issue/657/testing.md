# 動作確認計画 — Issue #657: ローカル検証環境で presigned アップロードフローを E2E 完走できるようにする（R2 CORS / presign-finalize ストア不一致）

**Issue:** #657
**作成日:** 2026-06-13

---

## 確認環境

### 検証環境の起動

```bash
pnpm build && pnpm start
```

（`pnpm start` = `wrangler dev`。`dist/worker` を配信するため先に `pnpm build` が必要。）

前提（plan.md ステップ7・8 の制約）:

- サーバーは**必ずポート 8787** で起動すること（`wrangler dev` のデフォルト。8787 が使用中で別ポートにフォールバックすると presign 先 `R2_S3_ENDPOINT`（:8787）とアプリオリジンが食い違いフローが完走しない。明示するなら `pnpm start -- --port 8787`）。空きポート自動検出での起動は不可。
- ブラウザでのアクセスは**必ず `http://localhost:8787` 表記**で行うこと（`http://127.0.0.1:8787` は presign URL のオリジン / host 署名と食い違い、preflight 復活または 403 になる）。

ログインユーザーの用意:

```bash
pnpm db:migrate
pnpm seed:dev-admin
```

セッション cookie はスクリプト出力トークンを CDP 経由で注入（`__Host-session`、Secure 必須。`.issue/655/testing.md` と同手順）:

```bash
agent-browser cookies set "__Host-session" "<token>" --url http://localhost:8787 --path / --secure --sameSite Lax
```

注: AC-4（不正署名・期限切れの 403）と AC-5（staging/production 不変）はユニットテスト（`pnpm test:unit`）+ wrangler 設定のレビュー確認で充足判定する（plan.md AC 表）ため、本計画の手動確認には含めない。

### デプロイ方法

なし（ローカル検証のみで確認できる）。

## 確認項目

### 1. presigned PUT が CORS preflight なしで成功する（same-origin 化）

- **対応する受け入れ基準:** AC-1
- **目的:** presign が返す URL が `http://localhost:8787/dev/r2/...`（same-origin）になり、ブラウザ XHR の PUT が preflight に阻まれず 200 で完了することを確認
- **手順:**
  1. `http://localhost:8787` でログインし、ノート編集画面を開く
  2. DevTools の Network タブを開く
  3. 「メディアを追加」から制限内の画像ファイル（数百 KB。`maxNoteBytes` 1 MiB 未満）を選択する
  4. Network タブで PUT リクエストの宛先 URL と、OPTIONS（preflight）リクエストの有無を確認する
- **期待結果:** PUT 先が `http://localhost:8787/dev/r2/<bucket>/<key>` で 200。OPTIONS リクエストは発生しない
- **確認ポイント:** 以前の症状（`https://<account>.r2.cloudflarestorage.com` への preflight 403）が再現しないこと

### 2. finalize がローカル binding を参照して 200 で完了する

- **対応する受け入れ基準:** AC-2
- **目的:** PUT 先と finalize の `stat`（head）が同一ストア（ローカル miniflare の `OBJECT_STORAGE` binding）になり、finalize が成功することを確認
- **手順:**
  1. 確認項目1 のアップロードをそのまま完了まで観察する
  2. Network タブで finalize のサーバーリクエストのステータスを確認する
- **期待結果:** finalize が 200 で完了し、ノート本文に `<img src="/media/<id>">` が挿入される
- **確認ポイント:** 以前の症状（PUT は 200 なのに finalize が「オブジェクト未着地」で失敗）が再現しないこと

### 3. 表示経路（/media/<id> → presigned GET 302）がローカルで完走する

- **対応する受け入れ基準:** AC-3
- **目的:** アップロードしたメディアの表示が presigned GET 経由でローカルストアから配信されることを確認
- **手順:**
  1. 確認項目2 で挿入された画像がエディタ/プレビューで表示されることを確認する
  2. Network タブで `/media/<id>` リクエストを確認する
- **期待結果:** `/media/<id>` が 302 を返し、リダイレクト先が `http://localhost:8787/dev/r2/...`（presigned GET）で 200、画像が表示される

### 4. `.issue/655/testing.md` 確認項目1（determinate 進捗バー）の再実行

- **対応する受け入れ基準:** AC-6
- **目的:** Issue の「やること」である #655 の E2E 検証（実バイト進捗の determinate バー）を、整備後の環境で PASS させる
- **手順:**
  1. DevTools の Network throttling を遅い回線（例: Fast 3G 相当）に設定する
  2. 「メディアを追加」から制限内の画像（数百 KB）を選択する（`maxNoteBytes` の一時変更は行わない — plan.md ステップ8 のファイルサイズ方針）
  3. アップロード中の表示を観察する
- **期待結果:** 「アップロード中…（n%）」のテキストと、幅が 0→100% に伸びる determinate な ProgressBar が表示され、完了後にノート本文へ `<img>` が挿入される
- **確認ポイント:** バーが indeterminate（パルス）のままではなく実際に幅が増えること。結果は `.issue/657/manual-test/results/`（#655 と同形式: `TC-1.md` + `summary.md`、環境ブロック付き）に記録する

## エッジケース・異常系

### 1. `http://127.0.0.1:8787` でアクセスした場合の失敗（ドキュメント記載どおりの挙動確認）

- **目的:** ステップ7 でドキュメント化する「`localhost` 表記必須」の制約が実際の挙動と一致することを確認
- **手順:**
  1. ブラウザで `http://127.0.0.1:8787` を開いてログインし、メディアアップロードを試す
- **期待結果:** presign URL のオリジン（`localhost`）とアプリオリジン（`127.0.0.1`）が食い違い、アップロードが完走しない（preflight 発生または 403）。エラー表示から再試行可能な状態に戻れる

### 2. 大きすぎるファイルの拒否（既存制限の維持）

- **目的:** `maxNoteBytes`（1 MiB）制限が dev プロキシ経由でも従来どおり機能することを確認
- **手順:**
  1. 1 MiB を超える画像ファイルを選択する
- **期待結果:** 従来どおりサイズ制限のエラーになる（dev プロキシ整備による制限バイパスがない）

## 既存機能への影響確認

- **export アーティファクトのダウンロード**: presign 経路（presignDownload）を共有しているため（plan.md 調査結果）、エクスポートを実行しダウンロード URL が `http://localhost:8787/dev/r2/...` で 200 になり、`response-content-disposition` どおりのファイル名で保存されること
- **sitemap インターセプト**: `/dev/r2/` 分岐を `/sitemap.xml` と同列に追加するため、`http://localhost:8787/sitemap.xml` が従来どおり返ること
- **通常ページ配信**: `/dev/r2/` 以外のルート（トップ、ノート一覧/詳細）が従来どおり表示されること（エントリポイントの分岐追加による回帰がないこと）
- **MediaUploader のリトライ挙動**: アップロード失敗時（エッジケース1 等）に「再試行」で同じファイルが再送できること（#655 確認項目2 相当の軽い目視。フロントエンドは無変更のため詳細再実行は不要 — plan.md スコープ節）
