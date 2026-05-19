# 動作確認計画 — Issue #13: PR #7 残 Warning まとめ (リファクタ・規約統一)

**Issue:** #13
**作成日:** 2026-05-19

---

## 確認環境

### 検証環境の起動

```bash
pnpm dev
```

`vite dev --config vite.config.cloudflare.ts` で workerd 上のローカルサーバーが http://localhost:3000 に起動する（package.json の `scripts.dev`）。

### デプロイ方法

```bash
pnpm deploy:staging
```

ステージング環境への反映（package.json の `scripts.deploy:staging`）。本 Issue は presentation 層のリファクタ中心で domain/usecase 変更を伴わないが、TanStack Start の `validateSearch` 統一（D）や `useAutosave` の AbortController 化（B/C）は実環境（Cloudflare Workers + workerd）での挙動確認が望ましい。

## 自動チェック（必須）

- [ ] `pnpm typecheck` がグリーン（特に D / F の型エラー連鎖網羅を確認）
- [ ] `pnpm lint` がグリーン
- [ ] `pnpm format:check` がグリーン
- [ ] `pnpm test:unit` がグリーン
- [ ] `grep -rn "window\.confirm\|^\s*if (!confirm\| confirm(" app/` が 0 件（A スコープ完遂）
- [ ] `grep -rn 'to=\"/\"\|to: \"/\"' app/` の全箇所が `search={HOME_SEARCH}` 付きであることを目視確認（Sidebar のディレクトリフィルタ付きリンクは除く）

## 確認項目

### 1. スコープ A — `ConfirmDialog` の置換動作

#### 1-1. ノート一括ゴミ箱移動

- **目的:** `BulkActionBar` の一括ゴミ箱ボタンが `window.confirm` ではなくアプリ内 `ConfirmDialog` を表示することを確認
- **手順:**
  1. ホーム (`/`) で複数ノートを選択（チェックボックス）
  2. `BulkActionBar` の「ゴミ箱へ」ボタンをクリック
  3. 表示されたダイアログを観察
  4. 「キャンセル」ボタンをクリック → ダイアログが閉じ、ノートはそのまま
  5. 同じボタンを再度クリック → ダイアログが再表示
  6. 「ゴミ箱へ」確定ボタンをクリック → ノートがゴミ箱に移動
- **期待結果:** OS 由来 `confirm()` ダイアログではなく、アプリ内モーダルが表示される。`role="alertdialog"` `aria-modal="true"` が付与され、見た目が既存の `BulkVisibilityDialog` 等と同等
- **確認ポイント:** 件数表示（例: 「3 件のノートをゴミ箱に移動します」）が含まれること

#### 1-2. ノート単体削除（`NoteActions`）

- **目的:** ノート詳細ページの「削除」ボタンが `ConfirmDialog` を表示することを確認
- **手順:**
  1. 任意のノート詳細 (`/notes/$noteId`) を開く
  2. 「削除」ボタンをクリック → `ConfirmDialog` 表示
  3. 「キャンセル」→ 閉じる、再度開いて「ゴミ箱へ」→ 削除実行
- **期待結果:** `ConfirmDialog` で確認 → ホームへリダイレクト

#### 1-3. 保存ビュー削除（`SavedViewsList`）

- **目的:** ビュー一覧の削除ボタンが `ConfirmDialog` を表示することを確認
- **手順:**
  1. `/views` で保存済みビューがある状態で「削除」をクリック
  2. `ConfirmDialog` のキャンセル / 確定を両方確認
- **期待結果:** `window.confirm` ではなく `ConfirmDialog` が表示。確定でビューが削除される

#### 1-4. ジョブ破棄（`IngestionJobRow`）

- **目的:** Ingestion ジョブ行の「破棄」ボタンが `ConfirmDialog` を表示することを確認
- **手順:**
  1. `/ingestion` 等で Ingestion ジョブがある状態で「破棄」をクリック
  2. `ConfirmDialog` のキャンセル / 確定を両方確認
- **期待結果:** `confirm()` ではなく `ConfirmDialog` が表示

#### 1-5. ゴミ箱完全削除（`TrashRowActions`）

- **目的:** ゴミ箱の完全削除ボタンが `ConfirmDialog` を表示することを確認
- **手順:**
  1. `/trash` でゴミ箱内のノートに対し「完全削除」をクリック
  2. `ConfirmDialog` のキャンセル / 確定を両方確認
- **期待結果:** `ConfirmDialog` で確認 → ノートが永久削除される

#### 1-6. タグ削除（`TagActions`）

- **目的:** タグ一覧の削除ボタンが `ConfirmDialog` を表示することを確認
- **手順:**
  1. `/tags` でタグの「削除」をクリック
  2. `ConfirmDialog` のキャンセル / 確定を両方確認
- **期待結果:** `ConfirmDialog` で確認 → タグが削除される

---

### 2. スコープ B/C — `useAutosave` の AbortController + deps 最適化

#### 2-1. autosave の基本動作

- **目的:** B/C のリファクタ後も autosave が正常に走ることを確認
- **手順:**
  1. 新規ノート編集ページ (`/notes/new`) または既存ノート編集ページを開く
  2. タイトルや本文を変更 → 1 秒程度待つ
  3. autosave インジケータが「保存しました」になることを確認
  4. 連続入力（タイピング） → debounce が機能し、最後の編集後に 1 回だけ flush される
- **期待結果:** 編集が確実に autosave される。インジケータが「保存中 → 保存しました」と推移
- **確認ポイント:** Network タブで `saveNoteDraftFn` の呼び出し回数が過剰でないこと（連続入力中に毎タイプ呼び出されない）

#### 2-2. unmount 時のキャンセル動作

- **目的:** ノート編集中に別ページに遷移した場合、AbortController で in-flight な autosave が dispatch を呼ばないことを確認
- **手順:**
  1. ノート編集ページでタイトルを変更（dirty 状態）
  2. autosave の debounce 待ち中（編集直後の 1 秒以内）に「戻る」やヘッダーのロゴクリックで別ページへ遷移
  3. DevTools コンソールを観察
- **期待結果:** React の `"Can't perform a React state update on an unmounted component"` 警告が出ない。`AbortError` の unhandled rejection も出ない
- **確認ポイント:** Strict Mode 環境（dev サーバー）で複数回 mount/unmount しても安定して動作すること

#### 2-3. リトライ動作とキャンセル

- **目的:** server-fn 失敗時の backoff リトライ中に unmount しても safe なこと
- **手順:**
  1. DevTools の Network タブで `saveNoteDraftFn` のレスポンスを `Network throttling: Offline` で遮断
  2. ノートを編集 → autosave が失敗してリトライに入る
  3. backoff 待ち（1〜2 秒）の間にページ遷移
- **期待結果:** リトライタイマーが abort されてリーク fetch / 警告が出ない

---

### 3. スコープ D — `validateSearch` 統一

#### 3-1. ホームへの遷移（各 `<Link to="/">` 経路）

- **目的:** `<Link to="/">` 経路で `search={HOME_SEARCH}` が常に渡され、ホームが正常表示されることを確認
- **手順:**
  1. ヘッダーのアプリロゴをクリック → ホームへ遷移
  2. サインアップ完了画面のリンクをクリック → ホームへ遷移
  3. `/error` ページから「ホームへ」リンク → ホームへ遷移
  4. パスワード再設定完了画面の「ホームへ」リンク → ホームへ遷移
  5. ゴミ箱 (`/trash`) の「ホームへ」リンク → ホームへ遷移
  6. 設定 (`/settings`) ヘッダーの「← Home」リンク → ホームへ遷移
  7. 管理画面 (`/admin`) の「ホーム」リンク → ホームへ遷移
  8. パブリックレイアウト（`/u/$username`）のロゴクリック → ホームへ遷移
- **期待結果:** すべてのリンクからホーム遷移 → ノート一覧が表示される。URL クエリに `?page=1&limit=...` が付くこと

#### 3-2. Sidebar のディレクトリフィルタ付きリンク

- **目的:** ADR-015 のセマンティクスが保持され、Sidebar のディレクトリリンクで「フィルタリセット」が機能することを確認
- **手順:**
  1. ホームで `?q=foo&visibility=public` のように複数フィルタを付ける
  2. Sidebar のディレクトリリンクをクリック
- **期待結果:** `?directoryId=...` のみが残り、`q` / `visibility` が消える（フィルタリセット）

#### 3-3. `redirect({ to: "/" })` 経路

- **目的:** auth/notes/upload 等のリダイレクトでホームが正常表示されることを確認
- **手順:**
  1. 未ログイン状態で `/notes/new` を直接開く → ログイン画面に redirect
  2. ログイン後、認証ルート (`/trash`, `/tags`, `/notes/new` 等) の redirect → ホームへ
  3. アカウント削除実行 → ホームへ redirect
- **期待結果:** すべてのリダイレクト先がホーム (`/?page=1&limit=...`)

#### 3-4. `router.navigate({ to: "/", search: (prev) => ... })` の updater

- **目的:** `FilterBar` / `NoteListToolbar` / `DisplayModeSwitch` のフィルタ操作で URL が正しく更新されることを確認
- **手順:**
  1. ホームで `FilterBar` の各フィルタ（visibility, directory, tags, dateRange）を変更
  2. `NoteListToolbar` のソート・ページサイズを変更
  3. `DisplayModeSwitch` で表示モード（list/tile/calendar）を切替
- **期待結果:** URL が `?...&page=1&limit=...` 形式で更新され、ノート一覧が新フィルタで再描画される

---

### 4. スコープ E — `bulkVisibilitySchema` の配置整理

#### 4-1. 一括公開設定変更

- **目的:** `bulkVisibilitySchema` 移動後も `BulkVisibilityDialog` 経由の操作が正常に動くことを確認
- **手順:**
  1. ホームで複数ノートを選択
  2. `BulkActionBar` の「公開設定」ボタンをクリック → `BulkVisibilityDialog` 表示
  3. 「公開」「限定公開」「非公開」の各オプションを試して確定
- **期待結果:** 各オプションで一括変更が成功。エラーレスポンス時にエラー表示

#### 4-2. 件数超過エラー

- **目的:** `BULK_NOTE_IDS_MAX` 超過時のバリデーションが publication 側の schema で機能することを確認
- **手順:**
  1. (テスト環境で) `BULK_NOTE_IDS_MAX` を超える数のノートを選択して一括公開設定変更
- **期待結果:** ZodError 由来の検証エラー表示

---

### 5. スコープ F — `OwnedNotesResult` discriminated union

#### 5-1. filter 経路（通常ホーム表示）

- **目的:** filter 経路で ListView/TileView/CalendarView がすべて正常表示されることを確認
- **手順:**
  1. ホーム (`/`) で `q` パラメータなしで表示
  2. 表示モード切替（list / tile / calendar）
  3. 各モードで以下を確認:
     - ListView: 日付列に正しい `updatedAt` が表示される
     - TileView: thumbnail / title / excerpt / tags が表示される
     - CalendarView: ノートが正しい日付にグルーピングされる
- **期待結果:** すべて期待通りの表示。`1970-01-01` のような sentinel 日付は出ない

#### 5-2. search 経路（検索結果）

- **目的:** search 経路で sentinel 値廃止後の挙動を確認
- **手順:**
  1. ホームで検索バーに `?q=foo` のような検索クエリを入力
  2. 表示モード切替（list / tile / calendar）
  3. 各モードで以下を確認:
     - ListView: 日付列が `—` プレースホルダ or 列ごと省略（実装判断による）
     - TileView: thumbnail なし / title / excerpt / tags が表示
     - CalendarView: フォールバック文言「カレンダー表示は検索結果では利用できません」等が表示される（ADR-014 維持）
- **期待結果:** すべて epoch 日付 (1970-01-01) や空文字 directoryId に依存した誤表示がない

#### 5-3. ゴミ箱表示（`TrashList`）

- **目的:** TrashList が `kind === "filter"` への narrowing 後も正常表示されることを確認
- **手順:**
  1. `/trash` を開く
  2. ノートが日付付きで表示されることを確認
- **期待結果:** filter 経路として扱われ、updatedAt 等のフィールドが正しく表示される

---

## エッジケース・異常系

### 1. ConfirmDialog 中のサーバーエラー

- **目的:** 確定中にサーバーエラーが発生した場合、エラー表示後にダイアログを再利用できるか
- **手順:**
  1. Network throttling Offline でゴミ箱移動を試す
- **期待結果:** エラー表示後、ダイアログを開き直して再試行可能

### 2. autosave の連続失敗

- **目的:** 最大リトライ回数 (`MAX_ATTEMPTS`) 到達時の dispatch が正しいこと
- **手順:**
  1. Network Offline 状態で編集 → autosave が複数回リトライ → 最終的に exhaust
- **期待結果:** `autosaveError` 状態がエディタに表示される

### 3. `HOME_SEARCH` の値変更耐性

- **目的:** `HOME_SEARCH` の値が `noteListSearchSchema` のデフォルトと整合していることを確認
- **手順:**
  1. ヘッダーロゴクリック → URL の `page` / `limit` が `HOME_SEARCH` の値と一致
  2. `noteListSearchSchema.parse({})` の戻り値と同値であることをデバッグ確認
- **期待結果:** 両者の値が完全一致

---

## 既存機能への影響確認

- **検索結果から表示モード切替**: 検索後にカレンダーに切替してフォールバック表示 → リストに戻して検索結果表示 → タイルに切替できる動線が壊れていない
- **Sidebar のディレクトリフィルタ**: ADR-015 のフィルタリセット動作が維持されている
- **公開設定の単体変更**: `PublishSettingsForm`（単体）も `bulkVisibilitySchema` 移動の影響を受けないことを確認
- **autosave + edit lock**: 編集ロック取得中の autosave 抑止が機能している（autosave gate の deps 変更で影響を受けないこと）

## 確認チェックリスト

- [ ] 1-1〜1-6: ConfirmDialog 全 6 ファイル置換動作
- [ ] 2-1〜2-3: autosave 基本 / unmount キャンセル / リトライ
- [ ] 3-1〜3-4: validateSearch 統一後の各遷移経路
- [ ] 4-1〜4-2: bulkVisibilitySchema 移動後の一括公開設定
- [ ] 5-1〜5-3: OwnedNotesResult discriminated union 化後の filter/search/trash
- [ ] エッジケース 1〜3
- [ ] 既存機能への影響なし
- [ ] `pnpm typecheck && pnpm lint && pnpm test:unit` 全グリーン
- [ ] `grep -rn "window\.confirm\|^\s*if (!confirm\| confirm(" app/` 0 件
