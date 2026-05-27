# TC-7: spec/design への反映

**判定**: PASS
**実施日**: 2026-05-27

## 手順と結果

### 7.1 `spec/pages/index.md` の P13 節

- ヘッダー／サイドバー／ノート一覧ツールバーから開く共通モーダル（URL hash `#upload`）として記述 — OK
- モーダル内で「ファイル選択 → 推論待ち → プレビュー編集 → 登録 or 破棄」フローを説明 — OK
- 本文 HTML はモーダル内では読み取り専用、編集は別 Issue（フォローアップ）と明示 — OK
- L168〜L174 の記載が新フローと一致

### 7.2 `spec/scenario/ingest.md` B1 / B2 / B4 節

- **B1（単一ファイル）**: 「アップロードモーダル内で連続して起こる（同一 UI 内で完結）」と明示。スケルトン → preview → 登録 の流れ + 180秒タイムアウト + 失敗フォールバックを記述 — OK
- **B2（複数ファイル一括）**: 「全件キューに積み、キュー画面で 1 件ずつプレビュー編集」+「N 件中 K 件をキューに追加、M 件失敗」集計表示 — OK
- **B4（タイトル・保存先修正）**: モーダル内 preview 編集 + raw JSON FrontMatter 編集 + `getDirectoryTreeFn` の lazy load 言及 — OK
- 異常系も `FRONT_MATTER_JSON_INVALID` まで含めて記載 — OK

### 7.3 `spec/design/pages/P13a-upload-modal.html`

- 新規ファイル存在 — OK（12 KB）
- 3 ステート: `State 1 — select` / `State 2 — waiting` / `State 3 — editing` がパネル分割で表現 — OK
- モバイル幅サンプル: `max-width: 360px` の宣言あり — OK
- 説明文: 「Issue #226 で導入する新フロー。ファイル選択 → 推論待ち → プレビュー編集 → 登録 までを 1 つのモーダル内で完結させる。」 — OK
- ADR-002（本文 HTML 編集はフォローアップ）への参照あり — OK

### 7.4 `spec/design/pages/P13-upload.html`

- 既存ファイル（46 KB）が維持 — OK
- `/upload`（キュー閲覧）位置付け用に残置されている

## 完了条件③への適合

- 完了条件③「spec/design 配下のページ設計に新フロー反映」 — 全項目クリア
