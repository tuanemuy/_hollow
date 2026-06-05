# TC-Edge 未認証 redirect

**結果: PASS**

cookie を注入しない別セッション（verify-475-noauth）で認証必須ルートへ直アクセスし、`/`（ランディング）へ redirect されることを確認した。

| # | 操作 | 期待 | 実際 | 判定 |
|---|------|------|------|------|
| 1 | 未認証で `/views` を open | `/` へ redirect | URL `http://localhost:3000/`、ランディング（navigation "Primary" に「ログイン」「アカウント作成」、heading「散らかった頭の中に、静かな置き場所を」） | PASS |
| 2 | 未認証で `/exports` を open | `/` へ redirect | URL `http://localhost:3000/`、同上ランディング表示 | PASS |

`_app` loader 経由の認証ガードが委譲後も機能し、未認証アクセスは AppShell ではなく `/`（公開ランディング）へ redirect される。Issue の意図（取り込み前の `/login` redirect から `_app` 挙動の `/` redirect へ統一）通り。

スクリーンショット:
- screenshots/tc-edge-noauth.png
- screenshots/tc-edge-noauth-exports.png
