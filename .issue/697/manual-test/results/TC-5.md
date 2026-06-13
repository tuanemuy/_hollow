# TC-5（AC-5）: モード切り替えで FrontMatter 編集内容が失われない

**結果**: PASS

## 操作ログ

| # | 操作 | 結果 |
|---|------|------|
| 1 | FrontMatter付きノート編集画面を開く（ビジュアルモード） | OK |
| 2 | 「追加するキー名」(aria-label) に `tc5tmp` を入力し「キーを追加」クリック | OK。新キー `tc5tmp`（値欄空）が追加された（未保存dirty状態） |
| 3 | `tc5tmp の値` 欄に `keepme` を入力 | OK |
| 4 | 本文モードタブを ビジュアル→HTML に切り替え | OK。HTMLタブが selected に。dialog status は「No dialog」= ビジュアル(inline)→HTML 切替では未保存confirmは発火しなかった（保険として window.confirm を true にパッチ済み） |
| 5 | 切替後の下部メタデータ領域を確認 | OK。`tc5tmp` = `keepme` が保持。status=edited, reviewer=tc-004-edited も保持 |

## 判定

- 本文モード切替（ビジュアル→HTML）後も、未保存で追加したキー `tc5tmp` と値 `keepme` が保持された。AC-5 を満たす。
- 操作上の注記: agent-browser の ref クリックではタブが切り替わらず、`element.click()` を eval で実行して切替を成立させた。ビジュアル(inline)→HTML の切替では未保存変更 confirm は出なかった（このペアはデータ損失リスクがないため）。
