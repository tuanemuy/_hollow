# TC-3: 全タグ解除で URL クリア（AC-3）

**結果**: PASS
**セッション**: verify-tc-002

| # | 操作 | 期待結果 | 実際の結果 | 判定 |
|---|------|----------|------------|------|
| 1 | `/?tagNames=%5B%22test-tag-01%22%2C%22test-tag-02%22%5D` を開く | 2 タグ選択済みで表示 | チップ 2 件表示 | PASS |
| 2 | `#test-tag-01` をクリック → networkidle | URL が test-tag-02 のみ | URL: `/?tagNames=["test-tag-02"]` | PASS |
| 3 | `#test-tag-02` をクリック → networkidle | `tagNames` パラメータが消える | URL: `http://localhost:3001/`（クエリなし） | PASS |
| 4 | 一覧が全件に戻ることを確認 | test-note-01〜14 が表示 | Test Note 01〜14 の 14 件（全 19 件のノート）を確認 | PASS |
