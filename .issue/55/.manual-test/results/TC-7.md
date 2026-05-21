# TC-7: 削除実行中も削除確認ダイアログが開いたまま progressbar が描画される + ARIA 属性確認

**Status:** PASS
**Date:** 2026-05-20
**Session:** verify-delete

## 手順実行

1. `#delete-me`（4 件のノート紐付け）の「削除」ボタンをクリック → ダイアログ表示
2. クリック直前に `MutationObserver` を仕込み `[role=progressbar]` の出現を逐次キャプチャ
3. ダイアログ内「削除」ボタンを押下し、削除完了までの DOM 変化を観測
4. 完了後ダイアログクローズ + `#delete-me` 消失を確認

## 期待結果

- description が「**4 件のノートを更新中…**」+ progressbar に切り替わる（ダイアログは開いたまま）
- progressbar `<div>` に以下属性:
  - `role="progressbar"`
  - `aria-busy="true"`
  - `aria-valuemin="0"`
  - `aria-valuemax="4"`
  - `aria-label="4 件のノートを更新中"`
  - `aria-valuenow` 属性なし
- 削除完了で `router.invalidate()` 後にダイアログが閉じ、`#delete-me` が一覧から消える

## 実測結果

### progressbar ARIA 属性（MutationObserver で 5 回キャプチャ、全て同一）

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

| 属性 | 期待値 | 実測値 |
| --- | --- | --- |
| `role` | `progressbar` | `progressbar` ✓ |
| `aria-busy` | `true` | `true` ✓ |
| `aria-valuemin` | `0` | `0` ✓ |
| `aria-valuemax` | `4` | `4` ✓ |
| `aria-label` | `4 件のノートを更新中` | `4 件のノートを更新中` ✓ |
| `aria-valuenow` | （属性なし） | `hasAttribute('aria-valuenow') === false` ✓ |

### 削除後のタグ一覧

| 観点 | 期待 | 実測 |
| --- | --- | --- |
| `#delete-me` 存在 | 消失 | 消失 ✓ |
| ダイアログ open 状態 | 完了後 close | close ✓ |
| 残存タグ件数 | 10 | 10 ✓ |

`router.invalidate()` 後にダイアログクローズ・一覧再描画を確認。

## エビデンス

- スクリーンショット:
  - `screenshots/tc-007-step-1.png`（削除クリック直後 / progressbar 描画中）
  - `screenshots/tc-007-step-2.png`（削除完了後、`#delete-me` 消失）
