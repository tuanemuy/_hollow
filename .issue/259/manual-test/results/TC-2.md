# TC-2: FrontMatter のデフォルト折りたたみ / 開閉

**判定**: PASS
**実施日**: 2026-05-28
**実施者**: agent-browser 自動検証

## 目的
FrontMatter セクションが初期状態で閉じていて、クリックで展開・再クリックで閉じることを確認する。

## 手順と結果

| # | 操作 | 期待 | 実際 |
|---|---|---|---|
| 1 | editing モーダル初期表示 | `<details>` が閉じている、textarea 非表示 | OK（`DisclosureTriangle [expanded=false]`、`details.open === false`） |
| 2 | `<summary>` をクリック | 展開、textarea 表示 | OK（`DisclosureTriangle [expanded=true]`、`textbox "FrontMatter（JSON）"` 出現） |
| 3 | もう一度クリック | 閉じる | OK（`details.open === false`） |

## 補足
- agent-browser CLI の `click "summary"` セレクタは効かなかったため、`eval` で `document.querySelector('details summary').click()` を発行して開閉確認した（同じイベントが発火する）
- キーボード操作（Tab → Space）の挙動はネイティブ `<details>` の標準動作のため、別途自動テストでカバー済みとみなす

## スクリーンショット
- `screenshots/tc-2/01-frontmatter-collapsed.png`
- `screenshots/tc-2/02-frontmatter-expanded.png`
- `screenshots/tc-2/03-frontmatter-reclosed.png`
