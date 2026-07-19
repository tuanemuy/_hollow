# TC-3（確認項目3 / 候補C）— 空プレースホルダブロックへの1文字入力が定着する

- **対応 AC:** AC-4
- **対象ノート:** ノートB（ID `019f799f-27ac-7729-9620-2f4b058d7e48`）
- **実行日:** 2026-07-19
- **実行環境:** wrangler dev（`http://localhost:8787`）/ agent-browser 0.32.0 セッション `verify-tc-noteb`

## 結果: PASS

空 `<td><br></td>` / `<p><br></p>` への非 IME 1 文字入力は、プレースホルダ `<br>` の remove を伴っても rollback されず定着し、自動保存・再読み込み後も永続した。

> 注記: 本項目の入力操作は TC-2（確認項目2）の手順4・手順6と同一操作のため、同じ実行系列で観測・検証した（td への `X`、空段落への `Y`）。両ブロックとも 1 文字目から定着している。

## 実行ログ

| # | 手順 | 操作 | 観測結果 | 判定 |
|---|------|------|----------|------|
| 1 | ノートBをビジュアルタブで開く | `/notes/{id}/edit` を開く | 空 td `<td contenteditable="true"><br></td>` / 空段落 `<p contenteditable="true"><br></p>` を確認 | PASS |
| 2 | 空 `<td>` に非IMEで1文字入力 | td を focus し `X` を入力 | `<td contenteditable="true">X</td>`。即時巻き戻りなし、`<br>` は解消 | PASS |
| 3 | 空 `<p>` に1文字入力 | 空段落を focus し `Y` を入力 | `<p contenteditable="true">Y</p>`。即時巻き戻りなし | PASS |
| 4 | 自動保存後の永続確認 | 「保存しました」待ち→`/edit` 再読み込み・HTMLタブ | td=X / p=Y が永続。構造タグ健全、`contenteditable` 漏れなし | PASS |

### 再読み込み後の該当ブロック（永続）

```
<p contenteditable="true">Y</p>
<td contenteditable="true">X</td>
```

### 保存 HTML（該当部）

```html
<p>Y</p>
<table><tbody><tr><td>X</td></tr></tbody></table>
```

## 期待結果との対照

- `<td>A</td>` 相当（本テストでは `X`）として1文字目が残り即時巻き戻らない → **達成**
- `<p>B</p>` 相当（本テストでは `Y`）として残る → **達成**
- セル/段落の構造タグは壊れない、`contenteditable` は保存 HTML に漏れない → **達成**

要素子が残らない空プレースホルダブロックへのテキスト入力バッチが allowed になり定着することを確認。TC-007.md の「td 1文字目が即座に巻き戻る」実害は解消。
</content>
