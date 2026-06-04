# EDGE-1: 未認証で設定画面に直アクセス → `/` にリダイレクト

## 結果

PASS

未認証の新規セッションで `/settings/profile` に直接アクセスしたところ、`/`（landing ページ）へリダイレクトされた。設定画面の中身（プロフィールフォーム等）は表示されなかった。`/login` でも `/settings/profile` でもなく `/` へ統一されており、本Issue（`_app` 配下への移動）の期待挙動どおり。

## 操作ログ

```
session: verify-edge-unauth（認証 cookie 未注入のクリーンな未認証状態）

agent-browser --session verify-edge-unauth navigate "http://localhost:3000/settings/profile"
agent-browser --session verify-edge-unauth wait --load networkidle
agent-browser --session verify-edge-unauth get url
  → http://localhost:3000/
```

## 最終 URL

`http://localhost:3000/`（期待どおり。`/login` でも `/settings/profile` でもない）

## スナップショット所見

- banner に「ログイン」「アカウント作成」リンク（未ログイン状態のトップ）
- main は landing のヒーロー（「散らかった頭の中に、静かな置き場所を」）・機能紹介・公開検索導線
- プロフィールフォーム等の設定 UI は一切表示されていない

## スクリーンショット

`/Users/hikaru/github.com/tuanemuy/hollow3/.issue/486/manual-test/screenshots/edge1-unauth-redirect.png`
