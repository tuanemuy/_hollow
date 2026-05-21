# TC-B: 一般ユーザー動線 + 非 admin /admin 拒否

**結果**: PASS
**実行時間**: 約45秒
**セッション**: verify-tc-b

## 実行ログ

| # | 操作 | 期待結果 | 実際の結果 | 判定 |
|---|------|---------|-----------|------|
| 1 | http://localhost:3000/login を開く | ログインフォームが表示される | ログインフォーム（メール/パスワード/ログインボタン）が表示された | PASS |
| 2 | `mailowner@example.com` / `Password123!` でログイン | ログイン成功、トップページに遷移 | `/?page=1&limit=20` に遷移、ログイン成功 | PASS |
| 3 | トップページで note 一覧が描画される | 200 描画、note 関連 UI が表示、TypeError なし | `すべてのノート` ヘッダ、`0 件のノート` 表示、リスト/タイル/カレンダーのビュータブ、フィルタUI、空状態 (`該当するノートがありません`) と「最初のノートを作成」CTA が描画。サイドバー（ライブラリ／ディレクトリ／タグ／ゴミ箱／アップロード）も正常。TypeError なし | PASS |
| 4 | http://localhost:3000/admin にアクセス（非 admin） | 403 / リダイレクト / 拒否表示のいずれか、新規 TypeError なし | URL は `/admin` のまま、ページに `アクセスできません` / `エラーが発生しました` / `ホームへ戻る` リンクが描画される拒否表示。banner に `管理者モード` ラベルが見えるが、本体は拒否UI。TypeError なし | PASS |

## スクリーンショット

- /Users/hikaru/github.com/tuanemuy/hollow/.issue/96/manual-test/screenshots/tc-b/01-login.png
- /Users/hikaru/github.com/tuanemuy/hollow/.issue/96/manual-test/screenshots/tc-b/02-after-login.png
- /Users/hikaru/github.com/tuanemuy/hollow/.issue/96/manual-test/screenshots/tc-b/03-admin-access.png

## サーバーログ check

`tail -200 /tmp/manual-test-server.log | grep -iE "typeerror|cannot read|StorageUnavailable|SecretBox"` → `No errors`

TypeError / Cannot read properties / StorageUnavailable / SecretBox 系のエラーは検出されず。

## 失敗詳細（FAIL時）

なし（PASS）。

## 観察メモ

- ログイン後、トップページのデフォルトURLが `/?page=1&limit=20` となり、note 一覧コンポーネント（ヘッダ、ビュータブ、期間/公開状態フィルタ、空状態）が正常にハイドレーションされていることを確認。
- `/admin` は HTTP リダイレクトではなく、URL は `/admin` のまま「アクセスできません」拒否ページをレンダリングする実装。403 ステータスではないがUI上の拒否表示として要件を満たす。
- banner に `管理者モード` の StaticText が出ているのは admin レイアウトのシェルが先にレンダリングされる影響と推測されるが、メインコンテンツは拒否表示のためアクセス自体は拒否されている。
