# TC-MAIN: Issue #13 メインフロー検証

**結果**: PASS
**実行時間**: 約 3 分
**セッション**: verify-issue13-main
**対象**: TC-A-1 (BulkActionBar ConfirmDialog) / TC-A-3 (SavedViewsList) / TC-A-6 (TagActions) / TC-D-1 (ホーム遷移) / TC-F-1 (表示モード切替)

## 実行ログ

| # | 操作 | 期待結果 | 実際の結果 | 判定 |
|---|------|---------|-----------|------|
| 1 | `http://localhost:3000/` を開く | ランディングまたはログインに到達 | ランディングが表示。`?page=1&limit=20` 付き URL に正規化 | PASS |
| 2 | ヘッダー「ログイン」リンクをクリック | ログインフォーム表示 | `/login` でメール/パスワード入力フォーム表示 | PASS |
| 3 | `existing@example.com` / `Password123!` でログイン | ホームへ遷移 | `http://localhost:3000/?page=1&limit=20` に遷移 | PASS |
| 4 | **TC-D-1**: URL に `?page=1&limit=...` が含まれるか | `?page=1&limit=20` 付与 | `?page=1&limit=20` を確認 | PASS |
| 5 | ノート一覧表示 (リスト) | 6 件のノートが表示 | "6 件のノート" 表示、6 件のチェックボックス＋リンクが描画 | PASS |
| 6 | **TC-F-1**: タイル表示に切替 | 一覧がタイル表示、`1970-01-01` 等の sentinel 無し | タブ "タイル" selected。6 件のカード描画、sentinel 日付なし | PASS |
| 7 | **TC-F-1**: カレンダー表示に切替 | グルーピング表示、エラー無し、sentinel 無し | `2026年5月19日(火)` / `2026年5月18日(月)` でグルーピング表示、エラー無し | PASS |
| 8 | リストに戻る + ノート 2 件選択 | BulkActionBar 表示 | `region "一括操作"` 出現、"2 件選択中"、ボタン: 移動 / 公開設定 / エクスポート / ゴミ箱へ / 選択解除 | PASS |
| 9 | **TC-A-1**: 「ゴミ箱へ」クリック | OS の `confirm()` ではなくアプリ内 `alertdialog` モーダル | `alertdialog "一括ゴミ箱移動"` (heading + "2 件のノートをゴミ箱に移動しますか？" + キャンセル/ゴミ箱へボタン) を確認 | PASS |
| 10 | 「キャンセル」クリック | ダイアログ閉、ノートは未削除 | alertdialog 消失、選択状態維持、ノート 6 件のまま | PASS |
| 11 | `/views` に遷移 | 保存ビュー一覧表示 | "Issue32 TC04 View" (個人ビュー) 表示、リネーム/既定にする/削除ボタンあり | PASS |
| 12 | **TC-A-3**: ビュー「削除」クリック | アプリ内 `alertdialog` 表示 | `alertdialog "保存ビューを削除"` (「Issue32 TC04 View」を削除しますか？) を確認 | PASS |
| 13 | 「キャンセル」クリック | ダイアログ閉、ビューは未削除 | alertdialog 消失、ビュー保持 | PASS |
| 14 | `/tags` に遷移 | タグ一覧表示 | 3 件 (#gamma, #issue13-alpha, #issue13-beta) 各リネーム/統合/削除あり | PASS |
| 15 | **TC-A-6**: `#gamma` (0件) の「削除」クリック | アプリ内 `alertdialog` 表示 | `alertdialog "タグ \"#gamma\" を削除"` (参照ノート除去と自動抽出停止の説明) を確認 | PASS |
| 16 | 「キャンセル」クリック | ダイアログ閉、タグは未削除 | alertdialog 消失、3 件保持 | PASS |
| 17 | ヘッダー「Hollow」ロゴ (banner > link) クリック | `/?page=1&limit=20` に遷移 | `http://localhost:3000/?page=1&limit=20` に遷移 | PASS |

## スクリーンショット

- `01-login.png` — ルートアクセス時のランディング (未ログイン)
- `01b-login-form.png` — `/login` フォーム
- `02-home.png` — ログイン直後のホーム (リスト表示)
- `03-home-list.png` — ホームのリスト表示
- `04-tile.png` — タイル表示
- `05-calendar.png` — カレンダー表示
- `06-confirm-dialog.png` — BulkActionBar 「ゴミ箱へ」の ConfirmDialog (TC-A-1)
- `07a-views.png` — `/views` 一覧
- `07-view-confirm.png` — SavedViewsList 「削除」の ConfirmDialog (TC-A-3)
- `08-tag-confirm.png` — TagActions 「削除」の ConfirmDialog (TC-A-6)
- `09-home-via-logo.png` — Hollow ロゴクリックで戻ったホーム

## 失敗詳細

なし。

## メモ

- すべての確認系操作で OS の `window.confirm()` ではなくアプリ内 `alertdialog` (= `role="alertdialog"` を持つコンポーネント) が表示されることをアクセシビリティスナップショットで確認。
  - BulkActionBar (一括ゴミ箱移動): `alertdialog "一括ゴミ箱移動"` heading + 内容文 + キャンセル/ゴミ箱へ
  - SavedViewsList (個人ビュー削除): `alertdialog "保存ビューを削除"` heading + 内容文 + キャンセル/削除
  - TagActions (タグ削除): `alertdialog "タグ \"#gamma\" を削除"` heading + 詳細説明 + キャンセル/削除
- TC-D-1: ヘッダー「Hollow」ロゴクリック後 URL が `/?page=1&limit=20` に正規化されることを実機で確認。
- TC-F-1: list/tile/calendar の 3 モードすべて表示成功、`1970-01-01` などの sentinel 日付は一切出現せず、表示は実データの作成日 (`2026年5月19日` / `2026年5月18日`) を反映。
- BulkActionBar の選択数バッジは "2 件選択中" と正しくカウント。
- テストデータ保全のため、すべての確認ダイアログは「キャンセル」で閉じた。ノート/ビュー/タグの実数値に変動なし。
- ログインフォーム自体は `01b-login-form.png` で取得 (`01-login.png` は初回ルートアクセス時の未ログインランディングを撮影しているので命名はやや誤解を与えるが、内容は確認可能)。
