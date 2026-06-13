# TC-2（AC-2）: メタデータ編集領域が画面下部に常設

**結果**: PASS

| # | 操作 | 期待結果 | 実際の結果 | 判定 |
|---|------|----------|------------|------|
| 1 | FrontMatter 付きノート編集画面を開く（既定モード確認） | 既定は「ビジュアル」 | 既定タブ = ビジュアル（aria-selected=true） | PASS |
| 2 | 本文エディタ下部のメタデータ編集領域を確認 | キー/値入力・「キーを追加」・「生編集（JSON）」が表示 | 本文（メディアを追加の下）にメタデータ領域あり。「キーを追加」「生編集（JSON）」ボタン、「追加するキー名」入力を確認 | PASS |
| 3 | 既存キー status / reviewer の表示確認 | status・reviewer が表示 | combobox "FrontMatter キー" = status（値 edited）, reviewer（値 tc-004-edited）を確認 | PASS |
| 4 | 「追加するキー名」に `tc2key` を入力し「キーを追加」を押す | キー行が増える | 入力で「キーを追加」ボタンが有効化（disabled→false）、クリックでキー = [status, reviewer, tc2key] に増加 | PASS |
| 5 | 「HTML」タブに切替（未保存変更 confirm を受け入れ）、下部メタデータ領域の常設確認 | HTML モードでもメタデータ領域が表示継続、追加キー維持 | 切替後 selectedTab=HTML、キー=[status, reviewer, tc2key] 維持、「キーを追加」「生編集（JSON）」継続表示 | PASS |
| 6 | 「WYSIWYG」タブに切替、同様に確認 | WYSIWYG でもメタデータ領域が表示継続、追加キー維持 | 切替後 selectedTab=WYSIWYG、キー=[status, reviewer, tc2key] 維持、各ボタン継続表示 | PASS |

## 備考
- 本文モード切替時に window.confirm（未保存変更ガード）が発火する。agent-browser のネイティブ自動ダイアログ処理は confirm を「dismiss（キャンセル）」扱いするため、`window.confirm = () => true` を eval で注入して受け入れさせたうえで切替を実施した（confirm 自体は正常に発火しており、テスト判定には影響なし）。
- 本文モードを ビジュアル → HTML → WYSIWYG と切り替えても、下部メタデータ領域は常設表示され、追加した tc2key を含むキー値が再マウントでリセットされず維持されることを確認。
