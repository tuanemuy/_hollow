# 動作確認計画 — Issue #306: ingestion commit パスで directoryNameToCreate ありの場合に Sidebar が stale になる

**Issue:** #306
**作成日:** 2026-05-29

---

## 確認環境

### 検証環境の起動

```bash
pnpm dev
```

ローカル開発サーバー（Cloudflare Workers + D1 + Vite）が起動し、Web UI 経由で ingestion フローを操作できる状態になる。

### デプロイ方法

なし（ローカル検証環境で確認可能）。

## 確認項目

### 1. IngestionPreviewForm: 新規ディレクトリ指定 commit → Sidebar 即時反映

- **目的:** `pendingDirectoryName` を指定した commit 成功後、Sidebar の directory tree に新ディレクトリが即座に反映されることを確認する。
- **手順:**
  1. ログイン済みの状態でアップロードダイアログを開く
  2. ファイルをアップロードして preview 表示まで待機
  3. DirectoryPicker で「新規ディレクトリを作成」を選び、ユニークな名前を入力（例: `test-dir-{timestamp}`）
  4. 「登録」ボタンをクリック
  5. ノート詳細ページに遷移後、Sidebar の directory tree を確認
- **期待結果:** 入力した新規ディレクトリ名が Sidebar に表示されている。
- **確認ポイント:** ページリロードしなくても Sidebar に反映されること。

### 2. ~~IngestionJobRow: 新規ディレクトリ系 commit~~ → 削除

`IngestionJobRow.onCommit` は `directoryNameToCreate` を送らない設計のため、新規ディレクトリ作成自体が発生しない。詳細は `adr.md` ADR-001 を参照。

### 3. 既存ディレクトリ選択 commit パスでの挙動

- **目的:** 既存ディレクトリ ID を選択した commit パスでは Sidebar tree が変わらないことを確認する（不要な invalidate が走っていないことの間接確認）。
- **手順:**
  1. ファイルをアップロードして preview 表示まで待機
  2. DirectoryPicker で既存のディレクトリを選択
  3. 「登録」ボタンをクリック
  4. ノート詳細ページに遷移後、Sidebar の状態を確認
- **期待結果:** 遷移は正常に行われ、Sidebar tree は変化していない（既存のまま）。
- **確認ポイント:** 余計な再描画やフリッカーが起きないこと。

## エッジケース・異常系

### 1. commit エラー時に invalidate が走らない

- **目的:** commit がエラーになった場合に `router.invalidate()` が呼ばれないことを確認する。
- **手順:**
  1. ネットワークを切断するか、サーバー側でエラーを発生させる状態を作る
  2. 新規ディレクトリ指定で commit を試みる
- **期待結果:** エラーメッセージが表示され、Sidebar は元のまま。画面遷移は発生しない。

## 既存機能への影響確認

- **discard パス（IngestionPreviewForm/IngestionJobRow）**: 既存の `router.invalidate()` 呼び出しは変更しない。挙動が変わらないこと。
- **regenerate パス（IngestionJobRow）**: 既存の `router.invalidate()` 呼び出しは変更しない。挙動が変わらないこと。
- **UploadDialog の commit パス**: 直接の変更対象外だが、内部で `IngestionPreviewForm` を使う場合は同経路を通る。挙動を確認する。

## 確認チェックリスト

- [ ] IngestionPreviewForm で新規ディレクトリ指定 commit → Sidebar 即時反映
- [ ] 既存ディレクトリ選択 commit では Sidebar が変わらない
- [ ] commit エラー時に invalidate が走らない
- [ ] discard / regenerate パスの既存挙動が変わらない
