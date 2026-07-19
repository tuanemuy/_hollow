# TC-1（確認項目1 / TC-005 相当）— img 付近テキスト入力 → img Backspace 削除試行で直前テキストが道連れ消失しない

- **対応 AC:** AC-1, AC-2
- **対象ノート:** ノートA（`<img>` 入り、ID `019f79a9-6794-743b-8d81-e21d75028b5c`、`/media/019f79a9-b13d-72d6-a8e2-b0ee1d7a8c03`）
- **実行日:** 2026-07-19
- **実行環境:** wrangler dev（`http://localhost:8787`）/ agent-browser 0.32.0 セッション `verify-tc-img`

## 結果: PASS

img 直後に入力した未保存テキスト `TAIL` は、img の Backspace 削除試行で rollback が発動しても道連れ消失せず DOM に保持された。修正前の「最後の rebuild snapshot（`before<img>after`）まで丸ごと巻き戻る」実害は解消。

## img アップロード

agent-browser の `upload input[type=file]` で 1x1 PNG を MediaUploader の file input に添付し、「ノートに挿入しました」表示 → `/media/<id>` の img 挿入まで完走できた。HTML モードで `<p>before<img src="/media/<id>" alt="">after</p>` に整形・保存して初期構造を用意した。

## 実行ログ

| # | 手順 | 操作 | 観測結果 | 判定 |
|---|------|------|----------|------|
| 1 | ノートAをビジュアルタブで開く | `/notes/{id}/edit` を開く | `<p contenteditable="true">before<img src="/media/019f79a9-b13d-72d6-a8e2-b0ee1d7a8c03" alt="">after</p>` | PASS |
| 2 | img 直後（`after` 末尾）に `TAIL` を入力（保存待たず） | 段落末尾にキャレット → `keyboard type TAIL` | DOM が `before<img>afterTAIL` に | PASS |
| 3 | DOM が `before<img>afterTAIL` を含むこと確認 | eval で outerHTML 取得 | `<p ...>before<img ...>afterTAIL</p>` 確認 | PASS |
| 4 | img 直後にキャレット → `Backspace` で img 削除試行 | img 直後（後続テキストノード offset 0）にキャレット → `press Backspace` | DOM が `before<img>afterTAIL` に**復元**（img 保持・`TAIL` 保持・`before`/`after` 保持）。rollback は当該 1 バッチ分のみ | PASS |
| 5 | rollback 直後のエディタ操作性（エッジ1） | 段落末尾に `Z` を追加入力 | `before<img>afterTAILZ`。通常入力は巻き戻らず定着、img/`TAIL` 保持 | PASS |

## 期待結果との対照

- `<img>` は削除されず復元される（構造保持・仕様どおり） → **達成**
- 直前に入力した `TAIL` が DOM に保持される（`before<img>after` まで巻き戻らない） → **達成**
- img 前 `before`・img 後 `after` も保持される → **達成**
- 段落・構造タグは壊れない → **達成**
- rollback 直後もエディタは操作可能（エッジケース1） → **達成**

rollback が「許可外を含んだその 1 バッチ分だけ」を巻き戻し、直前の正当編集 `TAIL` を保持することを確認。TC-005.md の道連れ消失は解消。

## 補足

- rollback 発動は最終 DOM 状態から推定（img 削除試行後も img が存在＝当該バッチが巻き戻された）。agent-browser では rollback の中間状態を直接観測できないため、判定は最終 DOM の一致で行った。
- 手順 2 以降は自動保存（`保存しました`）がバックグラウンドで走り、`before<img>afterTAILZ` まで永続保存された（別途 reload で確認済み）。
