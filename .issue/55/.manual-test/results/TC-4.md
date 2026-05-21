# TC-4: マージ実行中に progressbar が描画されない（noteCount === 0）

**Status:** PASS
**Date:** 2026-05-20
**Session:** verify-merge

## 手順実行

1. `#empty`（0 件のノート）の統合ダイアログを開き、`#target` を target に選択
2. 「統合」ボタンをクリックし、直後に DOM (`role="progressbar"`) と `<form aria-busy>` の属性を JS eval で取得
3. マージ完了後に `#empty` がタグ一覧から消えていることを確認

## 期待結果

- progressbar 描画なし
- 即座にダイアログクローズ
- `#empty` が一覧から消える

## 実測結果

### progressbar の不在

クリック直後の JS eval 結果:

```json
{
  "progressbar": null,
  "formAriaBusy": "true"
}
```

`document.querySelector("[role=progressbar]")` の結果が `null` であり、progressbar 要素が DOM に描画されていないことを確認 ✓

form は引き続き `aria-busy="true"` を持つが（送信中の状態管理のため）、件数フレーズ・progressbar はチラつかない。

### マージ後のタグ一覧

| タグ | マージ前 | マージ後 |
| --- | --- | --- |
| 合計タグ数 | 11 | 10 ✓ |
| `#empty` | 0 件のノート | 一覧から消失 ✓ |
| `#target` | 1 件のノート | 1 件のノート（変動なし、`#empty` の参照ノートが 0 件のため） ✓ |

## エビデンス

- スクリーンショット:
  - `screenshots/tc-004-step-1.png`（送信直後 / progressbar 不在）
  - `screenshots/tc-004-step-2.png`（マージ完了後、`#empty` 消失）
