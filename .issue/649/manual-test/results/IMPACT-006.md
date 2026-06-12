# IMPACT-006 既存 Popover 利用箇所の開閉・キーボード操作（PopupRole 拡張の波及確認）

結果: PASS

## 実行ログ

| # | 対象 | 操作 | 実際 |
| --- | --- | --- | --- |
| 1 | ユーザーメニュー（Dev Admin のメニュー, menu 系） | クリックで開く | `aria-expanded=true`、menuitem「設定」「ログアウト」表示 |
| 2 | 同上 | ArrowDown でフォーカス移動 | ログアウト → 設定 とロービングフォーカスが循環 |
| 3 | 同上 | Escape | 閉鎖（`expanded=false`）し、フォーカスがトリガー（aria-label「Dev Admin のメニュー」）へ復帰 |
| 4 | ディレクトリ操作メニュー（Research の操作, menu 系） | クリックで開く → Escape | menuitem「子ディレクトリを作成 / リネーム / 移動 / 削除」表示 → 閉鎖 |
| 5 | FilterBar 期間（dialog 系） | クリック → Escape | dialog 表示 → 閉鎖（IMPACT-005 #6） |
| 6 | FilterBar 公開状態（menu 系） | クリック → Escape | menu 表示 → 閉鎖（IMPACT-005 #7） |
| 7 | FilterBar 内部リンク参照（dialog 系） | クリックで dialog 表示 | 表示・選択操作も正常（IMPACT-005 #3-4） |
| 8 | アップロードダイアログ | クリック → Escape | 表示 → 閉鎖（IMPACT-004） |

備考: 検証途中にブラウザコンテキストが再起動しセッション Cookie（session-scoped）が消失したため再注入して継続。アプリ側の不具合ではない。
