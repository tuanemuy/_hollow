# 動作確認計画 — Issue #256: アップロードモーダル系のアクセシビリティ強化

**Issue:** #256
**作成日:** 2026-05-28

---

## 確認環境

このIssueの変更を確認するために必要な手順のみ記載。

### 検証環境の起動

```bash
pnpm dev
```

`pnpm dev` は `vite dev --config vite.config.cloudflare.ts` を実行し、Cloudflare Workers の dev サーバーを立ち上げる（package.json `scripts.dev` で確認）。

### 静的検証

```bash
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test:unit
```

### デプロイ方法

なし（検証環境のローカル起動で確認できる）。

---

## 確認項目

### 1. `UploadDialog` のタイトルが SR で読み上げられる（A11y-H1）

- **目的:** `aria-labelledby` 配線で SR がモーダル名を読み上げることを確認
- **手順:**
  1. macOS で VoiceOver (Cmd + F5) を起動、または NVDA を起動
  2. アップロードボタンを押して `UploadDialog` を開く
  3. SR の announce を確認（例: 「アップロード ダイアログ」「アップロード」など、`<h2>` のテキスト「アップロード」が含まれる）
  4. DevTools で panel 要素を inspect し、`<div role="dialog" aria-modal="true" aria-labelledby="…">` の値が `<h2 id="…">アップロード</h2>` の `id` と一致していることを確認
- **期待結果:** SR がモーダル名を読み上げる。DevTools 上で `aria-labelledby` と `<h2 id>` が一致

### 2. 他 6 つの Dialog 呼び出し元も同様に SR でタイトル読み上げ

- **目的:** Issue 本文「UploadDialog を含む既存 Dialog 呼び出しの追従」の確認
- **手順:** 以下の Dialog を順に開いて DevTools で `aria-labelledby` 値と `<h2 id>` の一致を確認、可能なら VoiceOver でタイトル announce も確認
  1. `NotePickerDialog` — note list の filter で開く
  2. `MoveNoteDialog` — note 移動
  3. `SaveViewDialog` — note list のフィルタ保存
  4. `BulkVisibilityDialog` — 一括公開設定
  5. `BulkExportDialog` — 一括エクスポート
  6. `MergeTagDialog` — タグマージ
- **期待結果:** すべての Dialog でタイトル `id` と `aria-labelledby` が一致し、SR でタイトルが読み上げられる

### 3. `editing` view で focus が title input に乗る（A11y-H2）

- **目的:** `IngestionPreviewForm` の独自 focus effect を撤去し、`UploadDialog` の view machine effect で focus が制御されていることを確認
- **手順:**
  1. アップロードモーダルを開く
  2. ファイルを 1 つアップロード → `uploading → waiting → editing` の遷移完了を待つ
  3. `editing` view 突入時、ブラウザの focus ring が title input に乗っていることを確認
  4. Tab キーで focus 巡回 → title input → 他のフィールド → action bar の順にループ
- **期待結果:** `editing` 突入時の初期 focus が title input。focus trap が機能している

### 4. view 遷移が SR にアナウンスされる（A11y-H3）

- **目的:** 常設 `aria-live="polite"` status region が各 view 遷移のステータスを announce することを確認
- **手順:**
  1. VoiceOver / NVDA を起動
  2. `UploadDialog` を開く（`select` view: 初期 announce なし）
  3. ファイルを 1 つアップロード → SR が「アップロード中」を announce
  4. アップロード完了 → SR が「LLM がタイトルとメタデータを提案中」を announce
  5. `editing` 突入 → SR が「プレビュー編集に進みました」を announce
  6. DevTools で panel 内に `<div role="status" aria-live="polite" class="sr-only">…</div>` が常設されていることを確認、textContent が view 遷移で更新されることを確認
- **期待結果:** 各 view のステータスメッセージが SR で読み上げられる。重複 announce（同じメッセージが複数回読まれる）が起きない

### 5. 複数ファイルの multiResult / failed / timedOut の announce

- **目的:** 異常系 view（`failed`, `multiResult`, `timedOut`）でも status region が更新されること
- **手順:**
  1. **multiResult:** 複数ファイルを選択してアップロード → 完了後 SR が「N 件中 M 件をキューに追加しました」を announce、失敗ありなら「（X 件失敗）」も含む
  2. **failed:** 失敗するファイル（壊れたファイル等）をアップロード → `failed` view で SR が「取り込みに失敗しました」を announce
  3. **timedOut:** ポーリングタイムアウトの確認（180 秒待機が現実的でない場合は省略可、`POLL_TIMEOUT_MS` の手動短縮で代替）→ SR が「推論の完了を待ちきれませんでした」を announce
- **期待結果:** 各 view の状況に応じたメッセージが SR で読み上げられる

### 6. ConfirmDialog ネスト（破棄確認）が引き続き機能

- **目的:** 既存の `editing` view の「破棄」→ `ConfirmDialog` のネスト動作に影響がないこと
- **手順:**
  1. ファイルをアップロードし `editing` view に到達
  2. 「破棄」ボタンをクリック
  3. `ConfirmDialog` が開く → 「破棄する」を押す
  4. focus が外側 `UploadDialog` に戻る、または `UploadDialog` が閉じる
- **期待結果:** 既存どおり破棄フローが動作。focus restore が壊れていない

## エッジケース・異常系

### 1. `select` 戻り時の SR 重複 announce

- **目的:** ポーリング失敗等で `select` に戻る際、`role="status"` と `role="alert"` の重複読み上げが起きないこと
- **手順:**
  1. アップロードを開始しエラーが発生する状況を作る（バックエンドを止める、無効なファイル等）
  2. `select` 戻り後、SR が「エラーメッセージ」（`role="alert"`）を 1 回だけ読み上げる
  3. 直前のステータスメッセージ（例: 「アップロード中」）は読み直されない
- **期待結果:** エラーは alert で 1 回、status region は沈黙（空文字）

### 2. Dialog 再オープン時の status region 初期化

- **目的:** `editing` まで進めた後 Dialog を閉じて再オープンした際、status region が空文字に戻る
- **手順:**
  1. `editing` view まで進めて閉じる（破棄 or キャンセル）
  2. 再度 Dialog を開く → `select` view が初期表示
  3. DevTools で `status` 要素の textContent が空文字であることを確認
- **期待結果:** 再オープン時の SR 初期 announce なし

### 3. キーボード操作（Tab focus trap）

- **目的:** focus 制御変更後も focus trap が機能すること
- **手順:**
  1. `editing` view で Tab を繰り返し押す → title input → 他フィールド → action bar の 3 ボタンを巡回
  2. Shift + Tab でも逆方向に巡回
- **期待結果:** focus が Dialog 内をループし、外に漏れない

### 4. `editing` view 内での再 render で focus が再強制されない

- **目的:** view machine effect の依存が `[view.kind]` のみで、`editing` 内の他フィールド入力で focus が title input に戻されないこと
- **手順:**
  1. `editing` view で title input から他フィールド（例: 本文）に Tab で移動
  2. 何か入力して再 render を発火させる
  3. focus が title input に戻らないことを確認
- **期待結果:** focus は移動先のフィールドに留まる（UX 退行なし）

## 既存機能への影響確認

- `UploadDialog` の各 view 遷移（select → uploading → waiting → editing → commit / discard）
- 複数ファイル一括アップロードの `multiResult` フロー
- ConfirmDialog の破棄確認フロー
- 他 6 つの Dialog（NotePicker / MoveNote / SaveView / BulkVisibility / BulkExport / MergeTag）のタイトル表示・操作

## 確認チェックリスト

- [ ] `UploadDialog` のタイトルが SR で読み上げられる（H1）
- [ ] 他 6 Dialog のタイトルも `aria-labelledby` で正しく配線
- [ ] `editing` view 突入時、focus が title input に乗る（H2）
- [ ] focus trap が機能（Tab / Shift+Tab で巡回）
- [ ] view 遷移のステータスが SR で announce される（H3）
- [ ] `multiResult` / `failed` / `timedOut` も SR で announce
- [ ] `select` 戻り時に status と alert の重複読み上げが起きない
- [ ] Dialog 再オープン時に status region が空文字
- [ ] `editing` 内の他フィールド入力で focus が title に戻らない
- [ ] ConfirmDialog ネスト（破棄確認）の動作に regression なし
- [ ] `pnpm typecheck` / `pnpm lint` / `pnpm format:check` / `pnpm test:unit` 全て green
