# EDGE-2: bare `/settings`（index ルートなし）への遷移

## 結果

PASS

認証済みセッションで `/settings`（末尾サブパスなし）に直接アクセスしたところ、クラッシュ・500 エラーは発生しなかった。共通 chrome（Header / banner）と設定サブナビ（サイドバー）が表示され、メイン領域は空。現状の挙動と同等で「悪化していない」ことを確認できた。profile への自動 redirect は本Issue対象外（#487）であり、redirect されないことは FAIL ではない。

## 操作ログ

```
session: verify-edge-auth（認証済み）

agent-browser --session verify-edge-auth cookies set "__Host-session" "dev-admin-session-token" \
  --url http://localhost:3000 --path / --secure --sameSite Lax
agent-browser --session verify-edge-auth navigate "http://localhost:3000/settings"
agent-browser --session verify-edge-auth wait --load networkidle
agent-browser --session verify-edge-auth get url
  → http://localhost:3000/settings
```

## 最終 URL

`http://localhost:3000/settings`（redirect されず。これは #487 対象のため FAIL ではない）

## スナップショット所見

- ページタイトル「設定 — TanStack Start Template」、500 等のエラー画面なし
- banner（Header）: Hollow ロゴ・ノート検索・新規作成・アップロード・ユーザーメニュー（Dev Admin）を表示 → 認証済み chrome が正常
- complementary「サイドバー」内に navigation「設定ナビゲーション」: プロフィール / セキュリティ / プロンプト / アカウント削除 のリンク → 設定サブナビが正常表示
- main は空（設定レイアウトのみ）。期待どおりクラッシュせず空メイン

## スクリーンショット

`/Users/hikaru/github.com/tuanemuy/hollow3/.issue/486/manual-test/screenshots/edge2-bare-settings.png`
