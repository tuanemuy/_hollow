# TC-4: アクセシビリティ・レール挙動の維持 (AC-5)

結果: PASS

対象: 非公開ノート詳細 390px。

| 項目 | 期待 | 実測 | 判定 |
| --- | --- | --- | --- |
| `role="toolbar"` | 存在 | 存在 | PASS |
| 各アクションの aria-label | 全て付与 | 編集 / 公開状態: 非公開 / 移動 / URLをコピー / エクスポート / その他の操作 | PASS |
| レール overflow-x | auto | auto | PASS |

レール要素の className（overflow-x: auto を持つ要素）:
`contents flex-wrap gap-2 items-center max-sm:flex max-sm:flex-1 max-sm:min-w-0 max-sm:flex-nowrap max-sm:gap-1 max-sm:overflow-x-auto max-sm:pb-0.5 max-sm:[&>*]:shrink-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`

備考:
- `MENU_RAIL` が `max-sm:overflow-x-auto` + `max-sm:flex-nowrap` + `[&>*]:shrink-0` で横スクロールレールとして隔離されていることを確認。
- aria-label は全 6 ピルに付与され、縮小によって欠落していない。
