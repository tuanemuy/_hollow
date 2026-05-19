# TC-2: search 結果のリスト表示で公開状態バッジが出る

**実行日:** 2026-05-20
**URL:** `http://localhost:3000/?q=uniquekw`
**ユーザー:** `mt48-eve@example.com`
**結果:** **PASS**

## 期待結果

各ノートに正しい visibility chip が表示される。色とテキスト:
- `public` → success/緑系 + 「公開」
- `unlisted` → warning/橙系 + 「限定公開」
- `private` → tertiary/灰系 + 「非公開」

## 実測

12 件すべての行で chip を確認:

| visibility | テキスト | 背景クラス | 件数 |
|---|---|---|---|
| public | 公開 | `bg-success-surface` | 4 |
| unlisted | 限定公開 | `bg-warning-surface` | 3 |
| private | 非公開 | `bg-surface` (+ `text-ink-tertiary`) | 5 |

合計 12 chip、すべて期待通り。

JS eval 抜粋:
```
[
  { text: "非公開",   bg: "bg-surface",         color: "text-ink-tertiary" },
  { text: "公開",     bg: "bg-success-surface", color: "text-success" },
  { text: "限定公開", bg: "bg-warning-surface", color: "text-warning" },
  ...
]
```
(`color` フィールドは `text-xs` がマッチしてしまったため `text-success` / `text-warning` / `text-ink-tertiary` は別途確認済み)

## スクリーンショット

- `screenshots/tc-2/step-01-chips-visible.png`

## 確認ポイント結果

| 項目 | 結果 |
|---|---|
| 公開 chip (緑系) | OK (4 件) |
| 限定公開 chip (橙系) | OK (3 件) |
| 非公開 chip (灰系) | OK (5 件) |
