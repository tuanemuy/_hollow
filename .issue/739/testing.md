# 動作確認計画 — Issue #739: spec/design 文字起こし機能のデザインモックを追加し実装と整合させる

**Issue:** #739
**作成日:** 2026-06-14

---

## 確認環境

このIssueの成果物は主に HTML モック（単一ファイル・依存なし）と `spec/design/index.md` のドキュメント更新。検証はブラウザでの視覚確認と、出荷済み実装画面との突き合わせが中心。

### 検証環境の起動

- **モックの表示:** 各 HTML モックは単一ファイルで依存がない（index.md §9）。ブラウザで直接開く。
  ```bash
  open spec/design/pages/P48-admin-speech.html
  open spec/design/pages/mobile/P48-admin-speech.html
  open spec/design/pages/P13-upload.html
  open spec/design/pages/P13-upload-modal.html
  ```
- **出荷済み実装画面の起動（突き合わせ用）:** Cloudflare ランタイムの dev サーバを起動する。
  ```bash
  pnpm dev
  ```
  `/admin/speech` は管理者ログインが必要。管理者シードを投入する。
  ```bash
  pnpm seed:dev-admin
  ```
- **AC-13 で実装コードを変更した場合のみ:** 変更後にコード品質コマンドを実行する（CLAUDE.md の変更後手順）。HTML モック・ドキュメントのみの変更時は対象外。
  ```bash
  pnpm typecheck && pnpm lint:fix && pnpm format
  ```

### デプロイ方法

なし（spec/design 配下のモック・ドキュメントの変更のみ。検証環境のブラウザ表示で完結する）。

## 確認項目

### 1. P48 文字起こし設定モックの構造（デスクトップ）

- **対応する受け入れ基準:** AC-1, AC-2, AC-5
- **目的:** P48 が出荷済み `SpeechSettingsForm` を 1:1 で絵にできていること。
- **手順:**
  1. `spec/design/pages/P48-admin-speech.html` をブラウザで開く。
  2. ヘッダー・admin-nav・ページ見出し・フォームセクション構造が P41（`P41-admin-llm.html`）と同型か見比べる。
  3. provider select（OpenAI option）、既定モデル input（例示 `gpt-4o-transcribe`）、新しい API キー input、接続テストボタンがあることを確認。
  4. **baseURL 欄が存在しないこと**を確認（P41 との差分）。
- **期待結果:** P41 と同じ管理シェルの上に、文字起こし設定の 3 セクション（プロバイダ / API キー / モデル）が並び、baseURL がない。
- **確認ポイント:** admin-nav に「文字起こし設定」項目が active で含まれること。

### 2. P48 の env 固定・状態表現

- **対応する受け入れ基準:** AC-3, AC-4
- **目的:** env 固定・API キー現在状態・provider 変更警告・接続テスト結果の各表現が実装に忠実なこと。
- **手順:**
  1. P48 で env 固定（ロックバッジ「環境変数で固定中」+ disabled + `ADMIN_SPEECH_PROVIDER/MODEL/API_KEY` のロックヒント）の表現を確認。
  2. 全固定時の「すべて環境変数で固定中」バナーがあるか確認。
  3. API キー現在状態（「環境変数から読み込み中」/「DB に保管されたキーを使用中 (マスク)」/「未設定」）の表現を確認。
  4. provider 変更時の「API キー再入力が必要」警告（必須バッジ）、接続テスト結果バナー（成功「接続成功 · 応答 NNNms」/ 失敗）を確認。
- **期待結果:** 各状態が `.alert` / lock-badge / required-badge で実装通りに表現されている。
- **確認ポイント:** alert の role 使い分けが実装と整合（provider 変更=alert 系）。

### 3. P13 録音UI導線（各状態）

- **対応する受け入れ基準:** AC-7, AC-8, AC-9
- **目的:** `AudioRecorder` の状態機械が P13 モックに反映されていること。
- **手順:**
  1. `spec/design/pages/P13-upload.html` と `P13-upload-modal.html` を開く。
  2. DropZone に並ぶ位置に録音 UI カードがあることを確認。
  3. 各状態が表現されているか確認: idle（「録音を開始」+「最大 30 分・24 MB」案内）、recording（赤ドット + 経過時間 + MB + 上限間近 warning + 「録音を停止」）、stopped（audio プレビュー + 取り込む / 録り直す / 取り消す + 自動停止 alert）、permission-denied（権限拒否 alert + ファイルアップロード誘導）。
- **期待結果:** 4 状態（+ requesting-permission 補助）が実装の文言・ボタン・アイコンに忠実に並ぶ。
- **確認ポイント:** モックは全状態を並べて見せる慣行のため、各状態に状態名コメントが付き「実装では排他表示」と分かること。

### 4. モバイル版 P48 の崩れ確認

- **対応する受け入れ基準:** AC-12
- **目的:** モバイル版が 1:1 で併置され、横スクロールが出ないこと。
- **手順:**
  1. `spec/design/pages/mobile/P48-admin-speech.html` を開く。
  2. devtools で幅 320〜430px に変えて表示を確認。
  3. コンソールで `document.documentElement.scrollWidth === document.documentElement.clientWidth` が true か確認。
- **期待結果:** 各幅で横スクロールが発生しない。admin-nav に P48 active。
- **確認ポイント:** `:root` トークンがデスクトップ版と逐語一致。

### 5. index.md の SSOT 更新

- **対応する受け入れ基準:** AC-10, AC-11
- **目的:** ドキュメント側の追従。
- **手順:**
  1. `spec/design/index.md` の admin 範囲が P40〜P48 に更新されているか確認。
  2. 参照モック一覧に P48 が追記されているか確認。
  3. P13 節またはモーダル記述に録音 UI 導線の記述があるか確認。
- **期待結果:** SSOT に欠落がない。
- **確認ポイント:** P41 と並列の文字起こし設定として位置づけられている。

### 6. 実装画面との突き合わせ

- **対応する受け入れ基準:** AC-1〜AC-9, AC-13
- **目的:** モックが出荷済み実装と乖離していないこと。
- **手順:**
  1. `pnpm seed:dev-admin` で管理者シードを投入。
  2. `pnpm dev` で起動し管理者でログイン。
  3. `/admin/speech` を開き、P48 モックと見た目（セクション構成・lock-badge・接続テスト・余白）を突き合わせる。
  4. 取り込み画面のアップロードモーダル内 `AudioRecorder` を開き、P13 録音 UI モックと突き合わせる。
- **期待結果:** モックと実装の見た目が一致。乖離があれば軽微なら実装を整え（AC-13）、大きければ別 Issue 化。
- **確認ポイント:** モックは実装に合わせる（実装が正）。

## エッジケース・異常系

### 1. admin-nav の整合（全 admin モック）

- **目的:** P48 追加に伴い全 admin モック（P40〜P47, 該当 mobile）の admin-nav が食い違わないこと。
- **手順:**
  1. P40〜P47 を順に開き、admin-nav に「文字起こし設定」リンクが含まれるか確認。
- **期待結果:** 全 admin モックで admin-nav が同一骨格を保つ。

## 既存機能への影響確認

- spec/design 配下のみの変更（AC-13 で実装を触る場合を除く）。コード変更がなければアプリ挙動への影響はない。AC-13 で実装を変更した場合は、`/admin/speech` と取り込み画面の録音 UI が変更前と同じ操作で動作することを `pnpm dev` で確認する。
