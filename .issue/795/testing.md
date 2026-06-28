# 動作確認計画 — Issue #795: note editor のメディアアップロードUI刷新（dropzone / preview / validation / progress / error / success）

**Issue:** #795
**作成日:** 2026-06-27

---

## 確認環境

このIssueはフロントエンドのみの変更（`MediaUploader.tsx` の UI 刷新 + `DROPZONE` 共有化 + media クライアント検証追加）。確認に必要な手順のみ記載する。

### 検証環境の起動

フロントエンドのコンポーネント変更なので、HMR が効く vite dev を使う。

```bash
pnpm db:migrate   # ローカル D1 にマイグレーション適用（未適用なら）
pnpm dev          # vite dev（workerd / @cloudflare/vite-plugin）。http://localhost:3000
```

> ソースを本番相当のビルドで確認したい場合のみ `pnpm build && pnpm start`（wrangler dev、`dist/worker` を配信）。フロントエンド反復には `pnpm dev` の方が適する。

メディアアップロードは presign → R2 PUT（`putWithProgress`）→ finalize の3ステップ。ローカルの R2 バケット（`hollow-local-temp-files` / `hollow-local-objects`、`wrangler.toml:93-99`）は wrangler がエミュレートする。本 Issue は presign/put/finalize のシグネチャ・挙動を変えないため、アップロード経路自体は従来どおり動く前提。

### シードデータ（必須）

note editor 画面（`/notes/new` または `/notes/$noteId/edit`）は `_app` 配下の認証必須ルートなので、ログイン済みユーザーが要る。`docs/test.md` の手順に従い、決定論的な管理者ユーザーとセッションを投入する。

```bash
pnpm seed:dev-admin
```

出力されるトークンを CDP 経由でセッション cookie に注入する（cookie 名 `__Host-session` は Secure 必須で `document.cookie` 注入不可）。

```bash
agent-browser cookies set "__Host-session" "<token>" \
  --url http://localhost:3000 --path / --secure --sameSite Lax
```

注入後 `/notes/new` を開くと editor が表示され、本文編集領域下の in-body メディアアップロード UI を操作できる。`/notes/$noteId/edit` を使う場合は所有ノートの行を SQL（`pnpm db:execute:local <SQLファイル>`）で 1 件投入してから `noteId` を指定する。新規作成パス（`/notes/new`）はノート投入不要なので最短。

検証用ファイルとして、画像（例: `.png` / `.jpg`）・動画（例: `.mp4`）・非対応形式（例: `.txt`）・`BYTE_SIZE_MAX`（5 GiB）超過相当の大きいファイルを手元に用意する。サイズ超過の実ファイル作成が困難な場合は、後述のとおり検証ロジック（`validateMediaFile`）のユニットテストで境界を担保する。

### デプロイ方法

なし（検証環境のみで確認できる。本番反映は通常のデプロイフロー `pnpm deploy:staging` / `pnpm deploy:production` に従う）。

## 確認項目

### 1. ドラッグ&ドロップでのメディア選択

- **対応する受け入れ基準:** AC-1
- **目的:** dropzone 全体がドロップ対象として機能し、画像/動画ファイルのドロップで選択（→ 即アップロード開始）されることを確認する。
- **手順:**
  1. `/notes/new` を開く。
  2. 本文編集領域下の dropzone に、画像ファイルをドラッグして重ね、ドロップする。
  3. ドラッグ中の dropzone のホバー強調（`data-dragover`）を観察する。
- **期待結果:** ドラッグ中は dropzone がハイライトされ、ドロップで当該ファイルが選択され、そのままアップロード（uploading 状態）に遷移する。
- **確認ポイント:** ドロップ後に独立した確認待ち画面を挟まず、選択即アップロードが始まること。

### 2. click-to-select での選択

- **対応する受け入れ基準:** AC-1
- **目的:** dropzone がクリック可能な label として動作し、ファイルダイアログ経由でも選択できることを確認する。
- **手順:**
  1. dropzone（「画像・動画をドラッグ&ドロップ またはクリックして選択」相当のコピー）をクリックする。
  2. OS のファイルダイアログで画像ファイルを選ぶ。`accept="image/*,video/*"` で候補が絞られることも確認する。
- **期待結果:** 選択したファイルでアップロードが開始される。
- **確認ポイント:** 非表示 `<input type="file">` と label が `htmlFor`/`id` で関連付いていること（DevTools で確認）。

### 3. 選択ファイルの preview 表示

- **対応する受け入れ基準:** AC-2
- **目的:** アップロード中に filename + size の preview が表示され、画像はサムネイル、動画/その他はアイコンで表現されることを確認する。
- **手順:**
  1. 画像をドロップ/選択し、uploading 状態の preview を確認する。
  2. 別途、動画ファイルをドロップ/選択し、preview を確認する。
- **期待結果:** 画像は `URL.createObjectURL` のサムネイル枠 + filename + size、動画/その他は lucide アイコン + filename + size が、progress バーと同一ブロックに併記される。
- **確認ポイント:** preview が progress と併記され（独立プレビュー画面がない）、AC-2 の粒度（filename+size、画像サムネ/非画像アイコン）どおりであること。

### 4. クライアント検証バナー（非対応形式 / サイズ超過）

- **対応する受け入れ基準:** AC-3
- **目的:** アップロード前にフォーマット/サイズを検証し、ingestion と一貫した ALERT バナーで提示されることを確認する。
- **手順:**
  1. `.txt` など image/video 以外のファイルをドロップ/選択する。
  2. （可能なら）`BYTE_SIZE_MAX`（5 GiB）超過のファイルをドロップ/選択する。
- **期待結果:** 非対応形式は `ALERT_ERROR`（error）バナー、サイズ超過は `ALERT_WARNING`（warning）バナーを表示し、アップロードは開始されず `idle` のまま留まる。
- **確認ポイント:** バナーが ingestion の `.alert` 構造（`ALERT` プリミティブ）と一致すること。検証 NG 時に presign が呼ばれないこと（Network タブ）。

### 5. progress / success / error・retry の各状態

- **対応する受け入れ基準:** AC-4
- **目的:** アップロード進捗・成功フィードバック・失敗時の再試行が明確かつ一貫して提示されることを確認する。
- **手順:**
  1. 画像をアップロードし、`ProgressBar`（determinate）と「アップロード中… (NN%)」テキストの進捗を観察する。
  2. 成功後の success バナー（「ノートに挿入しました」+ filename）を確認する。
  3. アップロードを失敗させる（例: DevTools の Network throttling/オフラインで PUT を失敗させる）と、`RetryableError` と再試行ボタンが出ることを確認し、再試行する。
- **期待結果:** 進捗は determinate バーで提示、成功で `ALERT_SUCCESS` バナー、失敗で `RetryableError` + 再試行 pill が出て、再試行で再アップロードされる。
- **確認ポイント:** success/error/progress が排他表示で、状態（`idle | uploading | error | done`）とバナー表示が食い違わないこと。

### 6. HTML / inline / WYSIWYG 各モードでの挿入

- **対応する受け入れ基準:** AC-5
- **目的:** props 契約（`{contentHtml, onInsert, disabled}` / `onInsert(nextHtml, {id,url})`）を維持したまま、3 つの本文編集モードで挿入が機能し続けることを確認する。
- **手順:**
  1. 本文編集モードのタブを **WYSIWYG** にし、画像をアップロードして、カーソル位置に画像が挿入される（`setImage`）ことを確認する。
  2. **HTML** モードに切り替え、画像をアップロードして、HTML draft に `<img>` が追記される（`insertMediaIntoHtml`）ことを確認する。
  3. **inline** モードでも同様に追記されることを確認する。
- **期待結果:** 3 モードとも従来どおり画像が本文に挿入され、保存後も反映される。
- **確認ポイント:** `NoteEditor.tsx` は無変更で 3 経路すべてが動くこと（契約の非破壊）。

### 7. アクセシビリティ

- **対応する受け入れ基準:** AC-6
- **目的:** live-region progress、ラベル付きコントロール、タップターゲット、dropzone の input+label 関連付けが保たれることを確認する。
- **手順:**
  1. DevTools/アクセシビリティツリーで、進捗テキストが `aria-live`（`ProgressBar` は `decorative` で `aria-hidden`、隣接テキストが live-region を担う）になっていることを確認する。
  2. success は `role="status"`、error は `role="alert"` であることを確認する。
  3. dropzone label と hidden input の関連付け（`htmlFor`/`useId`）を確認する。
  4. タップ可能要素が `TOUCH_TARGET`（min 44px）準拠であることを確認する。
- **期待結果:** progress/success/error がスクリーンリーダーに適切にアナウンスされ、二重読み上げが起きない。コントロールにラベルがある。
- **確認ポイント:** `ProgressBar` の `decorative` と隣接 live-region テキストで二重アナウンスにならないこと。

### 8. desktop / mobile レイアウトの mock 一致

- **対応する受け入れ基準:** AC-7
- **目的:** 実装が `spec/design/pages/P12-editor.html` および `spec/design/pages/mobile/P12-editor.html` の in-body media-upload UI モックに一致することを確認する。
- **手順:**
  1. desktop 幅で `/notes/new` の uploader を `P12-editor.html` のモックと見比べる。
  2. DevTools のデバイスエミュレーション（狭幅）で `mobile/P12-editor.html` と見比べる。
- **期待結果:** dropzone / preview / banner / progress / error / success の各状態が、desktop・mobile 双方のモックと一致する。
- **確認ポイント:** mobile でのパディング・タップターゲット（min 44px）がモックどおりであること。desktop/mobile 両モックの更新漏れがないこと。

## エッジケース・異常系

### 1. uploading 中の二重起動ガード

- **対応する受け入れ基準:** AC-1 / AC-4
- **目的:** アップロード中に再度ドロップ/選択しても 2 本目の `runUpload` が走らないことを確認する。
- **手順:** 大きめの画像でアップロードを開始し、progress 表示中に dropzone へ別ファイルをドロップ、または label をクリックして選択しようとする。
- **期待結果:** uploading 中は受理されず（`onDrop`/`onChange` の early-return ガード、label の `data-disabled` + `pointer-events-none` 相当）、進捗/プレビューが壊れない。
- **確認ポイント:** 検証バナー表示中（`idle`）の新規ドロップは通常どおり新ファイルで上書き受理されること。

### 2. 複数ファイルドロップ時は先頭のみ処理

- **対応する受け入れ基準:** AC-1（single-file スコープ）
- **目的:** dropzone に複数ファイルをドロップしても先頭 1 件のみ処理されることを確認する。
- **手順:** 画像を複数まとめて dropzone にドロップする。
- **期待結果:** 先頭ファイル（`files?.[0]`）のみがアップロード対象になる。
- **確認ポイント:** 現行の単一ファイル挙動と一致していること。

### 3. アップロード失敗時の retry

- **対応する受け入れ基準:** AC-4
- **目的:** PUT 失敗後の再試行が機能することを確認する。
- **手順:** Network をオフライン/throttle にして PUT を失敗させ、`RetryableError` の再試行ボタンを押す。失敗要因を解除して再試行する。
- **期待結果:** 再試行で同一ファイル（`lastFile`）が再アップロードされ、成功時 success に遷移する。
- **確認ポイント:** `error.retryable !== false` のときのみ再試行 pill が出ること。

### 4. サムネイル ObjectURL のリーク防止

- **対応する受け入れ基準:** AC-2（実装品質 / リスク欄）
- **目的:** `URL.createObjectURL` で生成したサムネイル URL が、再選択・画面離脱で確実に解放されることを確認する。
- **手順:**
  1. 画像を複数回連続で選択し直す。
  2. アップロード完了後/中に別画面へ遷移する。
  3. （任意）`performance.memory` や DevTools の Memory で ObjectURL の蓄積がないことを確認する。
- **期待結果:** `useEffect(() => () => revoke(url), [url])` の単一クリーンアップで都度解放され、二重 revoke も取りこぼしも起きない（画像 kind のみ生成、動画/その他は URL を生成しない）。
- **確認ポイント:** 状態遷移ハンドラ内での手動 revoke がない（単一クリーンアップ一本化）こと。

## 既存機能への影響確認

### 1. ingestion アップロードの dropzone 不変

- **対応する受け入れ基準:** AC-5 / リスク欄（`DROPZONE` 移設の回帰）
- **目的:** `DROPZONE` 文字列定数を `common/styles.ts` の共有プリミティブへ移設した後も、ingestion の 2 consumer（`UploadForm` / `UploadDialog`）の dropzone の見た目・挙動が完全に不変であることを確認する。
- **手順:**
  1. ingestion の取り込み画面（`UploadForm`）と取り込みダイアログ（`UploadDialog`）を開く。
  2. dropzone の見た目・ドラッグホバー強調・ファイル選択挙動を確認する。
  3. `pnpm test:unit` で `UploadForm.test.tsx` および ingestion 関連テストが緑であることを確認する。
- **期待結果:** クラス文字列完全一致での移設により、両 ingestion dropzone の見た目・挙動が従来どおり。
- **確認ポイント:** 共有定数化に伴い「共有 consumer + インライン重複」という新たな不整合が残っていないこと。

## 自動テスト（補助）

手動/ブラウザ確認に加え、以下を緑に保つ（AC-8 の `pnpm typecheck && pnpm lint:fix && pnpm format` と併せて実行）。

```bash
pnpm test:unit   # validateMediaFile / mediaInsert.test.ts / UploadForm.test.tsx
```

- `validateMediaFile`: image/video 受理、非対応 MIME=`unsupported`、`BYTE_SIZE_MAX` 超過=`oversized`、境界値。サイズ超過の実ファイルでの手動確認が困難な分はここで担保する。
- `MediaUploader`（happy-dom）: ドロップ/選択で検証バナー、検証通過で presign→put→finalize モックが順に呼ばれ `onInsert` 発火、失敗で `RetryableError`、成功で success。`putWithProgress` は `XMLHttpRequest` を直接生成するため `global.XMLHttpRequest` フェイクと `URL.createObjectURL`/`revokeObjectURL` スタブが要る（実装困難な場合は put フェーズをブラウザ確認に委ねる線引き可）。
