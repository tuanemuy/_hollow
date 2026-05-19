# 動作確認計画 — Issue #12: /exports/$jobId 詳細ルート + 一括エクスポート完了通知

**Issue:** #12
**作成日:** 2026-05-20

---

## 確認環境

このIssueの変更を確認するために必要な手順のみ記載（プロジェクト全体のセットアップは省略）。

### 検証環境の起動

```sh
pnpm dev
```

`vite dev --config vite.config.cloudflare.ts` で Cloudflare ランタイム向け開発サーバが起動する。HMR 込みでブラウザから直接 `/exports/{jobId}` を開いて確認できる。

エクスポートの非同期処理（relay / consumer）は `pnpm dev` の単独実行では起動しない。`processing` → `completed` の自動遷移を実機で見たい場合のみ `pnpm start`（`wrangler dev`）で Workers + Queues + R2 をローカルにエミュレートする必要がある（`docs/runtime_cloudflare.md` 参照）。`pnpm dev` ではエクスポートジョブが `pending` 止まりになる可能性があるため、状態遷移の確認は SQL でステータスを書き換えるか `pnpm start` を使う。

### デプロイ方法

なし（ローカル検証のみで Issue の要件は確認できる）。本番反映が必要な場合は `pnpm deploy:staging:all` → `pnpm deploy:production:all` の既存フローに従う（本 Issue の確認範囲外）。

## 確認項目

### 1. BulkExportDialog から詳細ページへのリダイレクト

- **目的:** 起動直後に `/exports/{jobId}` に遷移することを確認する（Issue 直接要件）
- **手順:**
  1. ログイン後にノート一覧 (`/`) へ移動
  2. 既存ノートを 2 件以上選択（複数選択 UI から）
  3. 「一括エクスポート」ボタンを押し、`BulkExportDialog` を開く
  4. 形式を「Markdown」など任意で選び「実行」を押す
- **期待結果:**
  - URL が `/exports/{jobId}` に遷移する（一覧 `/exports` ではない）
  - 詳細ページに `エクスポートジョブ詳細` 見出しが出ている
  - 初期状態は `待機中` または `処理中`
- **確認ポイント:** `result.jobId` を使ったルーティングが効いているか。`/exports?offset=0` へ落ちていないか

### 2. ジョブ進行状況のポーリング表示

- **目的:** 状態が自動更新されることを確認する（Issue 要件: 処理中 / 完了 / 失敗）
- **手順:**
  1. 確認項目 1 の流れで詳細ページに到達
  2. タブをフォアグラウンドのまま放置（`pnpm start` 経由で consumer が動いている場合）
  3. または SQL で `export_jobs` の `status` を `processing` → `completed` に手動更新（`pnpm dev` のみで確認する場合）
- **期待結果:**
  - 3 秒以内に画面に新しいステータスが反映される
  - ステータスラベルが `待機中 → 処理中 → 完了` と切り替わる
  - `completed` に達した時点で poll が止まる（ネットワークタブで `/_serverFn` の発火が停止）
- **確認ポイント:** `router.invalidate()` が走り続けていないか / ターミナル状態で停止するか

### 3. ダウンロードボタン

- **目的:** `completed` 時にダウンロードリンクが提示される
- **手順:**
  1. ジョブが `completed` 状態の詳細ページを開く
  2. 「ダウンロード」ボタンを押す
- **期待結果:**
  - R2 の presigned URL に遷移し、ファイル（.zip 等）がダウンロードされる
- **確認ポイント:** `expiresAt` が未来であること

### 4. キャンセル

- **目的:** active 状態でキャンセルが可能
- **手順:**
  1. `processing` 状態の詳細ページを開く（または SQL で `pending` 行を作成）
  2. 「キャンセル」ボタンを押す
- **期待結果:**
  - 状態が `キャンセル` に切り替わる
  - poll が停止する
  - キャンセルボタン / ダウンロードボタンが画面から消える

### 5. 一覧 → 詳細リンク

- **目的:** ブックマーク以外の経路で詳細に到達できる
- **手順:**
  1. `/exports` 一覧へ移動
  2. 任意の行の「詳細」リンクを押す
- **期待結果:** `/exports/{jobId}` に遷移し、対応するジョブ詳細が表示される

### 6. 詳細 → 一覧 戻り

- **目的:** 着地後の戻り経路が存在する
- **手順:**
  1. 詳細ページの「一覧へ戻る」リンクを押す
- **期待結果:** `/exports` 一覧に遷移する

## エッジケース・異常系

### 1. 他人のジョブ ID を直叩き（情報リーク防止 / ADR-004）

- **目的:** 他のユーザのジョブにアクセスを試みたときに、生メッセージ（userId / jobId）が画面に出ないことを確認する
- **手順:**
  1. ユーザ A でログインしてジョブを作成し、URL の jobId を控える
  2. ログアウトしてユーザ B でログイン
  3. URL バーに `/exports/{ユーザA の jobId}` を打って遷移
- **期待結果:**
  - 画面に「ジョブが見つかりません / ジョブが見つからないか、アクセス権限がありません。」と表示される
  - `is not owned by` を含むメッセージや、ユーザ A の userId・jobId が画面に**表示されない**（DevTools の DOM を確認）
- **確認ポイント:** `errorComponent` が `extractSerializedError` 経由で kind/code 判別している
  - 失敗例として、`<pre>BusinessRuleError: ExportJob xxx is not owned by yyy</pre>` のような表示が出たら NG

### 2. 存在しない jobId を直叩き

- **手順:** URL バーに `/exports/00000000-0000-0000-0000-000000000000` を打つ
- **期待結果:** エッジケース 1 と同じ中立メッセージが表示される（存在有無を漏らさない）

### 3. `failed` 状態のジョブ表示

- **目的:** Issue 要件「失敗」の表示が機能する
- **手順:**
  1. SQL で `export_jobs` の `status = 'failed'` に、`error_reason` を任意の文字列にセット
  2. 詳細ページを開く
- **期待結果:**
  - ステータスが「失敗」と表示される
  - `errorReason` の内容が表示される
  - `failedNoteIds` がある場合は一覧表示される

### 4. `expired` 状態 / `expiresAt < now` の `completed` ジョブ

- **目的:** ADR-003 のクライアント判定が機能する
- **手順:**
  1. SQL で `status = 'completed'` かつ `expires_at` を過去にセット
  2. 詳細ページを開く
- **期待結果:**
  - ダウンロードボタンが**表示されない**
  - 「有効期限切れのため再エクスポートが必要です」相当のメッセージが表示される

### 5. バックグラウンドタブでの poll 抑制

- **目的:** `document.visibilityState === "hidden"` のとき `router.invalidate` が呼ばれない
- **手順:**
  1. `processing` 状態の詳細ページを開く
  2. DevTools の Network タブを開き、フィルタを `_serverFn` に
  3. 別タブに切り替えてフォアグラウンドから外す
  4. 30 秒以上待つ
  5. 元のタブに戻って Network ログを見る
- **期待結果:** タブが非表示の間、`_serverFn` の発火が停止している（フォアグラウンドに戻ると再開）

## 既存機能への影響確認

- **`/exports` 一覧:** `STATUS_LABEL` を `export` に変えただけで、表示動作・並び順・ページネーションは変わらないこと
- **`ExportForm` 経由のエクスポート:** `enqueueExportFn` のフローはナビゲート先を変えていない（Issue スコープ外）。動作確認: `/notes/{noteId}/export` でジョブを enqueue したとき、従来通り `/exports` 一覧に戻れること
- **単発エクスポート (`startExportFn`):** 影響なし。単発 export ボタンから直接ファイルがダウンロードできること

## 確認チェックリスト

- [ ] BulkExportDialog → `/exports/{jobId}` に遷移する
- [ ] ステータスが poll で自動更新される
- [ ] ターミナル状態で poll が停止する
- [ ] バックグラウンドタブで poll がスキップされる
- [ ] `completed` でダウンロードボタンが機能する
- [ ] active 状態でキャンセルできる
- [ ] 他人の jobId 直叩きで生メッセージが露出しない
- [ ] 存在しない jobId 直叩きで中立メッセージが出る
- [ ] `failed` 状態で `errorReason` / `failedNoteIds` が表示される
- [ ] `expired` 相当のジョブでダウンロードボタンが非表示
- [ ] 一覧 → 詳細リンクが機能する
- [ ] 詳細 → 一覧戻りリンクが機能する
- [ ] 既存 `/exports` 一覧の動作に変化がない
- [ ] `pnpm typecheck && pnpm lint && pnpm format:check` が通る
