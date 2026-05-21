# TC-6: 削除確認ダイアログで noteCount === 0 のとき件数表示が省略される

**Status:** PASS
**Date:** 2026-05-20
**Session:** verify-delete

## 手順実行

1. `/tags` 画面の CreateTagForm で `empty-del` タグを新規作成（noteCount = 0）
2. `#empty-del` 行の「削除」ボタンをクリック
3. 開いた `[role=alertdialog]` の textContent を JS eval で取得し件数フレーズ有無を確認
4. キャンセル

## 期待結果

- description に「対象ノート: N 件」フレーズが含まれず、既存文言「参照ノートからも除去され、…続行しますか？」のみ表示される

## 実測結果

JS eval 取得結果:

```json
{
  "title": "タグ \"#empty-del\" を削除",
  "desc": "タグ \"#empty-del\" を削除参照ノートからも除去され、同名タグは今後自動抽出されなくなります（再追加するには手動で再作成が必要）。続行しますか？キャンセル削除",
  "includesCount": false
}
```

| 観点 | 期待 | 実測 |
| --- | --- | --- |
| タイトル | `タグ "#empty-del" を削除` | 一致 ✓ |
| 「対象ノート」フレーズ | 含まれない | 含まれない（regex 検出 false） ✓ |
| 既存文言「参照ノートからも除去され…」 | 含まれる | 含まれる ✓ |

「キャンセル」押下後、ダイアログ閉じ、タグ一覧不変（`#empty-del` 残存）。

## エビデンス

- スクリーンショット:
  - `screenshots/tc-006-step-1.png`（0 件タグの削除確認ダイアログ）
