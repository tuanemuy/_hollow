# 動作確認計画 — Issue #88: common/styles.ts 新設で Dialog 周りの cross-domain import を解消

**Issue:** #88
**作成日:** 2026-05-23

---

## 確認環境

このIssueはリファクタリング（utility 定数のファイル移動と import 切替）が中心で、機能変更はゼロ。検証は「ビルド整合性 + 既存ダイアログのビジュアル regression なし」の 2 観点に絞る。

### 検証環境の起動

```bash
pnpm dev
```

`vite dev --config vite.config.cloudflare.ts` で開発サーバーが起動する。`http://localhost:3000`（または vite が表示する URL）で確認。

### デプロイ方法

本Issueはリファクタリングのため、検証環境（`pnpm dev`）のみで確認可能。ステージングデプロイは不要。Ready for review 切替後の最終確認が必要であれば `pnpm deploy:staging:dry` で dry-run できる。

---

## 確認項目

### 1. ビルド整合性

- **目的:** `common/styles.ts` 新設・note/styles.ts 削除後に typecheck / lint / format / test が通ること
- **手順:**
  1. `pnpm typecheck` を実行
  2. `pnpm lint` を実行
  3. `pnpm format:check` を実行
  4. `pnpm test:unit` を実行
- **期待結果:** すべてエラーなく完了する
- **確認ポイント:** 21 ファイル分の note 内 import 書き換え漏れが無いこと（`Cannot find module '@/components/note/styles'` などのエラーが出ないこと）

### 2. ConfirmDialog（任意のノート削除確認）

- **目的:** `ConfirmDialog` が `common/styles.ts` 経由でも正しく描画されること
- **手順:**
  1. `pnpm dev` で起動後、ログインしてノート一覧へ
  2. 任意のノートを開き、削除ボタン or 一括選択 → ゴミ箱移動でConfirmDialog を表示
  3. キャンセル／確認ボタンの両方を押せる
- **期待結果:**
  - タイトル文字サイズ・余白が PR #87 前と差がない
  - キャンセル（pillBtn）／削除（pillBtnDanger）のスタイルが正しく当たっている
  - Esc キーで閉じる、ボディ外クリックで閉じない、focus trap が機能する
- **確認ポイント:** タイトル下マージン（`dialogTitle = mb-4`）、actions 行の `mt-4 justify-end`、エラー表示（あれば）の `formError` スタイル

### 3. MergeTagDialog（タグ統合）

- **目的:** Issue 本文 4 項目「primary ボタンを `${pillBtn} ${pillBtnPrimary}` + `data-primary` パターンに揃える」の視覚確認、および `fieldControl`/`fieldLabel`/`formError` 切替後の崩れチェック
- **手順:**
  1. タグ管理画面（`/tags` 等）へ移動
  2. 統合対象の起点タグから「統合」アクションを開いて MergeTagDialog を表示
  3. select で統合先タグを選択 → 統合ボタンを押下
  4. キャンセル／統合の両ボタンを目視確認
- **期待結果:**
  - select のスタイルが他の dialog (`fieldControl`) と整合（border 色遷移・padding）
  - ラベル（`fieldLabel`）の文字サイズ・色が他と一致
  - 統合ボタンが accent カラー（`pillBtnPrimary` + `data-primary`）で表示される
  - キャンセルボタンが `pillBtn` 既定スタイルで表示される
  - エラー時の `formError` が赤系で表示される
- **確認ポイント:**
  - 旧 layout `PILL_BTN` との差分（`active:scale-[0.985]` の押下時アニメ喪失） — 視覚的に違和感がないこと
  - 旧 layout `FIELD_INPUT` との差分（`transition-all` → `transition-colors`） — focus 遷移が違和感なく行えること
  - select の padding（`py-2.5` → `py-[10px]` は実質同等のはず）

### 4. ノート編集系ダイアログ群（NotePickerDialog / MoveNoteDialog / SaveViewDialog / BulkVisibilityDialog / BulkExportDialog）

- **目的:** note 配下 callsite を `common/styles` に書き換えた後も挙動と見た目が変わらないこと
- **手順:**
  1. ノート一覧で複数選択し、`BulkActionBar` から「移動」「公開設定変更」「エクスポート」をそれぞれ開く
  2. ノート一覧ヘッダーから「ビューを保存」ダイアログを開く
  3. `NotePicker` を介する画面（リンク追加など）でピッカーダイアログを開く
- **期待結果:**
  - すべてのダイアログが PR #87 マージ後の状態と同じビジュアル
  - フォーム入力・ボタン挙動・focus trap が機能する
- **確認ポイント:** 各 callsite の import 行が `@/components/common/styles` に切り替わり、参照 symbol（pillBtn / fieldControl 等）の解決が成功している

### 5. ノートエディタ（HtmlEditor / WysiwygEditor / FrontMatterEditor / MediaUploader / DirectoryPicker / NoteEditor）

- **目的:** field / fieldControl / fieldTextarea / fieldLabel / pillBtn 系を多数使うエディタ周りでスタイル退行が無いこと
- **手順:**
  1. 任意のノートを開いて編集モードへ
  2. HTML エディタ・WYSIWYG エディタの切替（EditorModeSwitch のボタン）
  3. FrontMatter フィールド入力、Directory 選択、Media アップロードボタンを押下
- **期待結果:**
  - field 全体のレイアウト（`field = flex flex-col gap-2 mb-4`）が崩れない
  - input/textarea の focus 時の border 色変化が機能する
  - pillBtn のアクティブ状態・disabled 状態が正しく当たる

---

## エッジケース・異常系

### 1. note/styles.ts のみが残っている中間状態が typecheck を通さない

- **目的:** ステップ 5 で書き換え漏れがあった場合、ステップ 6（削除）前に検出されること
- **手順:**
  1. ステップ 5（callsite 書き換え）完了直後に `pnpm typecheck` を実行
- **期待結果:** typecheck エラーが出ないこと（出た場合は書き換え漏れ）

### 2. 削除後に古い import が残っていないか

- **手順:**
  1. ステップ 6（note/styles.ts 削除）後に `grep -rn "components/note/styles\\|\\.\\./styles\"" app/` を実行
- **期待結果:** マッチがゼロ（`./styles` で参照する正当な箇所 = `app/components/common/Dialog.tsx` / `ConfirmDialog.tsx` が `./styles` を参照する形は OK だが、対象は同じディレクトリ内のため `app/components/common/styles.ts` が解決される）

---

## 既存機能への影響確認

- **layout shell のヘッダー/サイドバー**: `PILL_BTN` / `FIELD_*` / `FORM_ERROR` を引き続き layout/styles.ts から参照しているコンポーネント（Header, TagActions, CreateTagForm, IngestionJobRow, TrashList 等）に変更を加えないこと。視覚的に変化がないことを確認
- **モバイルビューポート（〜639px）の MergeTagDialog**:
  - Chrome DevTools などで viewport を 375px 程度に絞る
  - ダイアログを開き、キャンセル/統合の両ボタンを実際にタップ操作
  - **合格基準:**
    - 誤タップなく目的のボタンを押下できる
    - ボタンが画面端で見切れず、Dialog 内に収まっている
    - 隣接ボタン間で誤発火が起きない
  - ADR-001 のタップターゲット縮小（44px → 36px）判断の検証 — タップ操作に支障が出れば別 Issue 起票

---

## 確認チェックリスト

- [ ] `pnpm typecheck` が通る
- [ ] `pnpm lint` が通る
- [ ] `pnpm format:check` が通る
- [ ] `pnpm test:unit` が通る
- [ ] ConfirmDialog のビジュアル確認（ノート削除確認など）
- [ ] MergeTagDialog のビジュアル確認（タグ統合）
- [ ] ノート編集系ダイアログ群のビジュアル確認
- [ ] ノートエディタのフィールド周り確認
- [ ] grep で `note/styles` への参照が活コードから消えていること
- [ ] CLAUDE.md と `tag/styles.ts` の JSDoc 内 reference が `common/styles.ts` に書き換わっていること
- [ ] モバイルビューポートでの MergeTagDialog タップ確認（合格基準: 誤動作なし／画面端見切れなし）
- [ ] layout shell（ヘッダー/サイドバー）に変化がないこと
