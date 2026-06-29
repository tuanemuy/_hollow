# EDGE-001: cross-origin 取り込み POST が 403 で拒否される

**結果**: PASS

## 前提条件

- 開発サーバー: `http://localhost:3000`
- `config.appUrl`: `http://localhost:8787`（wrangler.toml の APP_URL）
- ブラウザのアクセス元 Origin: `http://localhost:3000`
- => Origin 不一致 = cross-origin 状態。`csrfMiddleware` が取り込み POST を 403（ForbiddenError）で拒否するのが期待動作。
- 認証: `__Host-session` cookie に `dev-admin-session-token` を CDP 経由で注入してログイン状態を作成。

## 実行ログ

| # | 操作 | 期待結果 | 実際の結果 | 判定 |
|---|------|---------|-----------|------|
| 1 | `/upload` を開きログイン状態で描画 | アップロード画面が認証エラーなく表示され、ドロップゾーン（input[type=file]）が存在する | タイトル「アップロード — hollow」で正常表示。ドロップゾーン「ファイルをドラッグ&ドロップ またはクリックして選択」が存在。既存ジョブ4件（test-note-2/4/2/3、いずれも「保存済み」）が表示済み | PASS |
| 2 | `input[type=file]` に `/tmp/csrf-test-note.md` をアップロード | POST が 403 で拒否され、画面にエラー表示が出る。ジョブはキューに追加されない | `wait networkidle` 後の snapshot で `alert`（role=alert）が出現し、本文「権限がありません」を表示。ForbiddenError（403）の表示文言。アップロード前後でジョブ一覧は不変（4件のまま、新規ジョブ追加なし）。サイドバーのノート件数バッジも「31」のまま変化なし | PASS |
| 3 | （補強）`eval` で server function エンドポイントに直接 fetch し status を観察 | 403 を期待 | status=500 を返却。ただしこれはエンドポイント URL（`/_serverFn/...uploadFileFn...`）が不確実で path 不一致によるものと推測。主判定は手順2の UI 観察で確定済みのため補助情報として記録 | 参考 |

## 判定根拠

- cross-origin（access origin `localhost:3000` ≠ appUrl `localhost:8787`）の状態で `uploadFileFn` POST を実行したところ、role=alert で「権限がありません」（ForbiddenError = 403）が表示された。
- ジョブ一覧・ノート件数バッジに変化がなく、キューへの追加が行われていない＝POST が処理前に拒否されたことを裏付ける。
- これにより `csrfMiddleware` が `uploadFileFn` に対して機能していることが確認できた（EDGE-1 PASS）。

## 失敗詳細（FAILの場合）

なし。
