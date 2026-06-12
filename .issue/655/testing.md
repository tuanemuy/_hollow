# 動作確認計画 — Issue #655: MediaUploader の presigned PUT を XHR 化して実バイト進捗を表示する

**Issue:** #655
**作成日:** 2026-06-12

---

## 確認環境

本 Issue は presentation 層（`app/components/note/editor/MediaUploader.tsx`）のみの変更。検証は起動中のローカルサーバーに対するブラウザ目視が中心。

### 検証環境の起動

```bash
pnpm build && pnpm start
```

（`pnpm start` = wrangler dev。`dist/worker` を配信するため先に `pnpm build` が必要。）

ログインユーザーの用意:

```bash
pnpm db:migrate
pnpm seed:dev-admin
```

セッション cookie はスクリプト出力トークンを CDP 経由で注入（`__Host-session`、Secure 必須）:

```bash
agent-browser cookies set "__Host-session" "<token>" --url http://localhost:<port> --path / --secure --sameSite Lax
```

### デプロイ方法

なし（ローカル検証のみで確認できる）。

## 確認項目

### 1. アップロード中にバイト進捗の determinate バーが表示される

- **対応する受け入れ基準:** AC-1, AC-2
- **目的:** XHR の `upload.onprogress` 由来の実進捗が ProgressBar に反映されることを確認
- **手順:**
  1. ノート編集画面を開く
  2. 「メディアを追加」から大きめの画像/動画ファイル（数 MB 以上推奨）を選択する
  3. アップロード中の表示を観察する（DevTools の Network throttling で遅くすると観察しやすい）
- **期待結果:** 「アップロード中…（n%）」のテキストと、幅が 0→100% に伸びる determinate な ProgressBar が表示され、完了後にノート本文へ `<img>` / 動画が挿入される
- **確認ポイント:** バーが indeterminate（パルス）のままではなく、実際に幅が増えていくこと

### 2. リトライ挙動の維持

- **対応する受け入れ基準:** AC-3, AC-4
- **目的:** PUT 失敗時に `RetryableError` が出て、再試行で同じファイルが再送されることを確認
- **手順:**
  1. DevTools の Network タブで Offline にする（または PUT 先をブロック）
  2. ファイルを選択してアップロードを失敗させる
  3. エラー表示の「再試行」を押す（Online に戻してから）
- **期待結果:** 失敗時に RetryableError が表示され、再試行で同じファイルのアップロードが成功してメディアが挿入される

## エッジケース・異常系

### 1. 進捗が取得できない場合の劣化表示

- **目的:** `lengthComputable` でない・progress イベントが来ない場合に indeterminate バーで劣化なしに動くこと
- **手順:**
  1. 小さいファイル（数 KB）をアップロードする（進捗イベントが一瞬で終わる/来ないケースの近似）
- **期待結果:** エラーにならずアップロードが完了する。進捗未取得の間は indeterminate バー（パルス）が表示される

## 既存機能への影響確認

- ノート編集のメディア挿入フロー全体（presign → PUT → finalize → HTML 挿入）が従来どおり成功すること（確認項目1で兼ねる）
- アップロード中の input disabled が維持されること
