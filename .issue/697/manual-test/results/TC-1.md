# TC-1（AC-1）: 編集モードタブから FrontMatter が消えている

**結果**: PASS

| # | 操作 | 期待結果 | 実際の結果 | 判定 |
|---|------|----------|------------|------|
| 1 | FrontMatter 付きノート編集画面（`/notes/019ebe30-17ac-75e1-a9c9-a0ea8efae572/edit`）を開き、編集モードタブ（role=tab, aria-label="編集モード"）のラベルを列挙 | `["ビジュアル","WYSIWYG","HTML"]`、FrontMatter なし、WYSIWYG あり | `["ビジュアル","WYSIWYG","HTML"]` | PASS |
| 2 | 新規作成画面（`/notes/new`）を開き、同様にタブのラベルを列挙 | `["WYSIWYG","HTML"]`、FrontMatter なし、WYSIWYG あり | `["WYSIWYG","HTML"]`（tablist aria-label="編集モード"） | PASS |

## 備考
- 認証は `__Host-session=dev-admin-session-token` cookie 注入で成功（ヘッダーに "Dev Admin / dev-admin@example.com" 表示を確認）。
- 補足: `/notes`（一覧）URL は当環境では 404（別ルート構成）。編集・新規画面は 200 で正常表示され、テスト対象には影響なし。
- どちらの画面にも「FrontMatter」タブは存在せず、WYSIWYG タブ（#696 由来）は残存していることを確認。
