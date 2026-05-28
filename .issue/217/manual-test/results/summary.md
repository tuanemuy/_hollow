# Manual Test Summary — Issue #217

**実行日**: 2026-05-29
**サーバー**: http://localhost:3001/ (`pnpm dev --port 3001`)
**ブランチ**: issue/219/view-toggle-instant-switch
**実行ツール**: agent-browser

## 結果サマリー

| TC | 名称 | 結果 |
|----|------|------|
| TC-1 | `/upload` から「取り込みキュー」見出しが消えていること | PASS |
| TC-2 | サイドバーの「アップロード」が `/upload` への遷移リンクになっていること | PASS |
| TC-3 | ヘッダー右上「アップロード」ボタンでモーダルは引き続き開くこと（回帰確認） | PASS |
| TC-4 | 管理画面のヘッダー〜タブヘッダー〜コンテンツの縦リズム | PASS |
| TC-Edge-1 | モバイル幅（360px）で管理ヘッダーが縦リズムを保つ | PASS |

**合計**: 5 件 / **PASS**: 5 件 / **FAIL**: 0 件
**SKIP**: 1 件 (TC-Edge-2: 未ログイン時 `/upload` はサーバーレベルリダイレクトのため省略)

## 主な観察事項

- `<h2>取り込みキュー</h2>` は完全に削除（`document.querySelectorAll('h2')` が空配列）。
- サイドバー「アップロード」は `<a href="/upload">` の純粋リンクで、`#upload` ハッシュやモーダル起動は無し。`data-active=""` ／`aria-current="page"` でハイライト機能も確認。
- ヘッダーCTAは `/#upload` リンクのままで、クリックでダイアログが開き URL にハッシュが付与される（モーダル動線維持）。
- 管理画面でヘッダー高 64px、タブナビが gap=0 で直下接続。500px スクロール後も両者 sticky で `headerBottom=64 / navTop=64` を維持。
- 360px 幅モバイルでもヘッダー高さは 64px に固定。旧 `max-sm:py-3` 由来の縮みは解消され、タブナビとの隙間ゼロも維持。

## 失敗詳細

なし。

## 詳細レポート

- [TC-1.md](./TC-1.md)
- [TC-2.md](./TC-2.md)
- [TC-3.md](./TC-3.md)
- [TC-4.md](./TC-4.md)
- [TC-Edge-1.md](./TC-Edge-1.md)
