# TC-3: ヘッダー右上「アップロード」ボタンでモーダルは引き続き開くこと（回帰確認）

**結果**: PASS
**実行時間**: 約20秒
**セッション**: verify-217-tc-3

## 実行ログ

| # | 操作 | 期待結果 | 実際の結果 | 判定 |
|---|------|---------|-----------|------|
| 1 | member ログイン → ホーム表示 | `/?page=1&limit=20` | 同上 | PASS |
| 2 | ヘッダー内の「アップロード」要素を抽出 | `href="/#upload"` のリンク | `[{ tag: "A", text: "アップロード", href: "/#upload" }]` | PASS |
| 3 | ヘッダー「アップロード」をクリック | URL に `#upload`、モーダル表示 | `href = "http://localhost:3001/?page=1&limit=20#upload"`, `[role=dialog]` 存在 | PASS |

## 観察

- ヘッダーCTAは `/#upload` リンクのままで、サイドバーとの動線分離が機能している。
- ダイアログ DOM が出現し、URLハッシュも期待どおり付与された。

## スクリーンショット
- Step 1 (modal open): `screenshots/tc-3/step-1-modal-open.png`
