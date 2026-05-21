# TC-3: マージ実行中に indeterminate progressbar が描画される + ARIA 属性確認

**Status:** PASS
**Date:** 2026-05-20
**Session:** verify-merge

## 手順実行

1. `#alpha`（4 件のノート紐付け）の統合ダイアログを `#beta` を target として開いた状態から
2. 「統合」ボタンをクリックし、直後に DOM (`role="progressbar"`) と `<form aria-busy>` の属性を JS eval で取得
3. ダイアログクローズ後に `#alpha` がタグ一覧から消えていること、`#beta` の件数が増えていることを確認

## 期待結果

- progressbar `<div>` に以下属性が付与される:
  - `role="progressbar"`
  - `aria-busy="true"`
  - `aria-valuemin="0"`
  - `aria-valuemax="4"`
  - `aria-label="4 件のノートを更新中"`
  - `aria-valuenow` 属性なし
- `<form>` に `aria-busy="true"` が付与される
- マージ完了で `#alpha` が一覧から消え、`#beta` の noteCount が増える

## 実測結果

### progressbar ARIA 属性

クリック直後に JS eval で取得した DOM:

```html
<div role="progressbar"
     aria-busy="true"
     aria-valuemin="0"
     aria-valuemax="4"
     aria-label="4 件のノートを更新中"
     class="relative h-1 w-full overflow-hidden rounded-pill bg-surface mt-3">
  <div class="absolute inset-0 rounded-pill bg-accent/60 motion-safe:animate-pulse"></div>
</div>
```

JS 取得結果（属性一覧）:

| 属性 | 期待値 | 実測値 |
| --- | --- | --- |
| `role` | `progressbar` | `progressbar` ✓ |
| `aria-busy` | `true` | `true` ✓ |
| `aria-valuemin` | `0` | `0` ✓ |
| `aria-valuemax` | `4` | `4` ✓ |
| `aria-label` | `4 件のノートを更新中` | `4 件のノートを更新中` ✓ |
| `aria-valuenow` | （属性なし） | `null`（属性なし） ✓ |

### form aria-busy

`document.querySelector("form[aria-busy]")` から `aria-busy="true"` 取得 ✓

### マージ後のタグ一覧

| タグ | マージ前 | マージ後 |
| --- | --- | --- |
| 合計タグ数 | 12 | 10（途中で `#empty` も統合のため、TC-3 単体直後は 11） |
| `#alpha` | 4 件のノート | 一覧から消失 ✓ |
| `#beta` | 1 件のノート | 5 件のノート（4 件加算） ✓ |

`router.invalidate()` 後にダイアログクローズ、一覧再描画を確認。

## エビデンス

- スクリーンショット:
  - `screenshots/tc-003-step-1.png`（progressbar 描画中 / クリック直後の JS eval と並行撮影）
  - `screenshots/tc-003-step-2.png`（マージ完了後、`#alpha` 消失 + `#beta` 5 件）
