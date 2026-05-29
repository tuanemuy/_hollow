# TC-002 ノート詳細ページの NoteActions

結果: FAIL（danger ボタンの赤が表示されない回帰）

## 対象
ノート詳細 `/notes/019e7368-a581-743f-b10f-fc366c8e1f9e` の NoteActions pill ボタン群。

## 操作ログ

| 手順 | 操作 | 期待 | 実際 | 判定 |
|---|---|---|---|---|
| 1 | ノート詳細を開く | 詳細表示 | 表示 | PASS |
| 2 | screenshot | ボタン群表示 | 編集/公開設定/移動/URLコピー/複製/エクスポート/履歴/削除 表示 | PASS |
| 3 | 編集の属性/class | primary | data-primary="true", data-[primary]:bg-accent 系あり | PASS |
| 4 | plain群 class | bg-surface + active:scale | 公開設定/移動/複製/履歴 すべて bg-surface + active:scale-[0.985] | PASS |
| 5 | 削除 class | danger 表示（赤） | class に bg-error-surface/text-error あり **だが描画は赤にならず** | FAIL |
| 6 | 削除に hover → screenshot | 赤を維持 | hover でも灰色（赤が一度も出ない） | FAIL |

## class / 描画 検証（期待 vs 実際）

- 編集（primary）: 期待 `data-[primary]:bg-accent` + `data-primary` 属性 → 実際 一致（PASS）
- plain（公開設定/移動/複製/履歴）: 期待 `bg-surface` + `active:scale-[0.985] motion-reduce:active:scale-100` → 実際 すべて含む（PASS）
- 削除（danger）:
  - class 文字列: `... bg-surface ... text-ink ... active:scale-[0.985] ... bg-error-surface text-error hover:bg-error-surface`（pillBtnDanger）→ 文字列としては含む
  - **描画（computed style）**: background-color = rgb(245,245,247) = #f5f5f7（surface）, color = rgb(29,29,31) = #1d1d1f（ink）
  - 期待: background = error-surface #fbebeb, color = error #c43e3e
  - **不一致＝回帰**。hover 時も同じく灰色のまま。
- `PILL_BTN` 等の定数名残存: なし
- enabled: 全ボタン押下可能（disabled なし）

## 根本原因（検出のみ・コード未修正）

`pillBtnDanger`（app/components/common/styles.ts:20）は

```
export const pillBtnDanger = `${pillBtn} bg-error-surface text-error hover:bg-error-surface`;
```

と定義され、`pillBtn` に含まれる `bg-surface` / `text-ink` と、後段の `bg-error-surface` / `text-error` が
同一要素の class に**両方**載る。Tailwind の勝敗は class 属性の並び順ではなく生成 CSS の出力順で決まるため、
`bg-surface` / `text-ink` が `bg-error-surface` / `text-error` に勝ち、danger ボタンが灰色描画になっている。
NoteActions.tsx:175 は `className={pillBtnDanger}` 単独適用。

## スクリーンショット
- screenshots/note-detail.png
- screenshots/note-detail-danger-hover.png
