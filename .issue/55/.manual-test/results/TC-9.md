# TC-9: リネームには進捗 UI が出ない

**Status:** PASS
**Date:** 2026-05-20
**Session:** verify-delete

## 手順実行

1. `#beta`（5 件のノート紐付け、TC-3 マージで増加）の「リネーム」ボタンをクリック → インライン編集 UI 表示
2. クリック直前に `MutationObserver` を仕込み `[role=progressbar]` の出現を逐次キャプチャ
3. インライン input を `beta` → `beta-renamed` に書き換え（React の native value setter 経由）
4. 「保存」ボタンを押下し、保存処理完了まで観測
5. リネーム完了後、一覧で `#beta-renamed` が表示されることを確認

## 期待結果

- インライン編集 UI のまま「保存」ボタンが disabled になるのみ
- progressbar / 件数フレーズは描画されない
- ADR-004 のスコープ判断通り

## 実測結果

| 観点 | 期待 | 実測 |
| --- | --- | --- |
| インライン編集表示 | input + 「保存」「キャンセル」ボタン | input + 「保存」「キャンセル」 ✓ |
| 保存クリック直後の `[role=progressbar]` | `null` | `null`（immediatePbExists: false） ✓ |
| MutationObserver の capture 数 | `0` | `0`（pbCaptureCount: 0） ✓ |
| 旧 `#beta` 存在 | 消失 | 消失（hasOldBeta: false） ✓ |
| 新 `#beta-renamed` 存在 | 表示 | 表示（hasBetaRenamed: true） ✓ |

```json
{
  "pbCaptureCount": 0,
  "pbCaptures": [],
  "hasOldBeta": false,
  "hasBetaRenamed": true
}
```

progressbar は **リネーム実行全期間を通じて一度も DOM に出現しなかった**（MutationObserver の捕捉数 = 0）。
ADR-004 のスコープ判断通り、リネームでは進捗 UI が描画されないことを確認。

## エビデンス

- スクリーンショット:
  - `screenshots/tc-009-step-1.png`（保存実行中 / progressbar なし）
  - `screenshots/tc-009-step-2.png`（リネーム完了後、`#beta-renamed` 表示）
