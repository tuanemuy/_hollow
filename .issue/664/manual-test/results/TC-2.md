# TC-2: 選択済みタグの解除（AC-2）

**結果**: PASS
**セッション**: verify-tc-002

| # | 操作 | 期待結果 | 実際の結果 | 判定 |
|---|------|----------|------------|------|
| 1 | `/?tagNames=%5B%22test-tag-01%22%5D` を開く | test-tag-01 選択済みで表示 | チップ `#test-tag-01` 表示（ref=e13） | PASS |
| 2 | `#test-tag-01` チップをクリック | 選択解除される | クリック成功 | PASS |
| 3 | networkidle 後に URL と aria-pressed を確認 | URL から `tagNames` が消え、aria-pressed=false | URL: `http://localhost:3001/`、aria-pressed="false" | PASS |
