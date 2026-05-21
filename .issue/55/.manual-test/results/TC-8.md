# TC-8: 削除実行中に progressbar が描画されない（noteCount === 0）

**Status:** PASS
**Date:** 2026-05-20
**Session:** verify-delete

## 手順実行

1. `#empty-del`（0 件、TC-6 で作成）の「削除」ボタンをクリック → ダイアログ表示
2. クリック直前に `MutationObserver` を仕込み `[role=progressbar]` の出現を逐次キャプチャ
3. ダイアログ内「削除」ボタンを押下した直後に `document.querySelector('[role=progressbar]')` を同期的にチェック
4. 削除完了まで待機し、observer に蓄積された capture 数を確認

## 期待結果

- description は「**削除中…**」のみ（progressbar なし）
- 即座にダイアログクローズ
- `#empty-del` が一覧から消える

## 実測結果

| 観点 | 期待 | 実測 |
| --- | --- | --- |
| 削除クリック直後の `[role=progressbar]` | `null` | `null`（immediatePbExists: false） ✓ |
| MutationObserver の capture 数（削除完了まで） | `0` | `0`（pbCaptureCount: 0） ✓ |
| 削除完了後 `#empty-del` 存在 | 消失 | 消失（hasEmptyDel: false） ✓ |
| ダイアログ open 状態 | close | close（dialogOpen: false） ✓ |

```json
{
  "pbCaptureCount": 0,
  "pbCaptures": [],
  "hasEmptyDel": false,
  "dialogOpen": false
}
```

progressbar は **削除実行全期間を通じて一度も DOM に出現しなかった**（MutationObserver の捕捉数 = 0）。

## エビデンス

- スクリーンショット:
  - `screenshots/tc-008-step-1.png`（削除実行中 / progressbar なし）
