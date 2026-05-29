# TC-003 タグ管理ページの TagActions

結果: FAIL（danger ボタンの赤が表示されない回帰／TC-002 と同一原因）

## 対象
タグ管理 `/tags` の TagActions pill ボタン。

## 操作ログ

| 手順 | 操作 | 期待 | 実際 | 判定 |
|---|---|---|---|---|
| 1 | /tags を開く | タグ管理表示 | 表示（#design-review 1件） | PASS |
| 2 | screenshot | ボタン表示 | リネーム（plain）/ 削除（danger）表示。統合は当該行に非表示 | PASS（部分表示は許容） |
| 3 | 追加（primary）class | accent 背景 | bg=oklch(0.371 0 0)＝accent, color=白 | PASS |
| 4 | リネーム class | plain + active:scale | bg-surface + active:scale-[0.985] | PASS |
| 5 | 削除 class/描画 | danger 表示（赤） | class に bg-error-surface あり **だが描画は灰色** | FAIL |

## class / 描画 検証（期待 vs 実際）

- 追加（primary）: 期待 accent → 実際 oklch accent + 白文字（PASS）
- リネーム（plain）: 期待 bg-surface + active:scale → 実際 一致（PASS）
- 削除（danger）:
  - class に `bg-error-surface` 含む（true）, `active:scale-[0.985]` 含む（true）, `PILL_BTN` 残存なし（false）
  - **描画**: background = rgb(245,245,247)＝surface, color = rgb(29,29,31)＝ink
  - 期待 error-surface/error → **不一致＝回帰**
- 全ボタン enabled（disabled なし）
- `統合` ボタンは当該タグ行に出ていない（タグ件数依存の条件表示と判断、回帰ではない）

## 根本原因
TC-002 と同一。`pillBtnDanger` 内の `bg-surface`/`text-ink`（base 由来）が `bg-error-surface`/`text-error` を
CSS 出力順で上書きしているため。TagActions も danger を単独適用。

## スクリーンショット
- screenshots/tags.png
