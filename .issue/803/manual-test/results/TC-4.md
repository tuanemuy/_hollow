# TC-4: 既存キーボード/コミット非回帰（AC-4）

結果: PASS（IME サブ項目のみ tooling 制約で未検証）

## 実行ログ
| # | 操作 | 結果 | 判定 |
|---|---|---|---|
| 1 | "t" → ArrowDown | aria-activedescendant が #tag-alpha を指す（aria-selected=true）| PASS |
| 1 | 続けて Enter | チップ "#tag-alpha" 追加, draft="" | PASS |
| 2 | "brandnewtag" → Enter（既存非マッチ）| 新規チップ "#brandnewtag" 追加 | PASS |
| 4 | "t" でパネル開く → Escape | expanded=false, listbox=0, draft="t" 保持 | PASS |
| 5 | draft クリア後、空欄で Backspace | 直前チップ "#brandnewtag" 削除（→ "#tag-alpha" のみ）| PASS |
| 6 | 有効 draft のまま blur | TC-3 で確認済み（"t" → チップ "#t" コミット）| PASS |
| 3 | IME 変換確定 Enter の非コミット | agent-browser で composition イベントを忠実に再現できず未検証 | N/A |

## 判定
- ↑↓ハイライト→Enter で既存タグコミット、非マッチ Enter で新規タグ、Escape クローズ＋draft 維持、空欄 Backspace でチップ削除、blur コミットがいずれも従来通り動作。PASS
- Escape クローズと外側クリッククローズの二重競合による draft 喪失なし（Escape 後 draft="t" 保持を確認）。PASS

## 制約
- IME 変換確定 Enter（#3）はブラウザ自動化での composition イベント再現が不安定なため自動検証から除外。コードレビュー round-3 で APPROVED 済みであり、本項のみ手動 IME 確認を推奨。
