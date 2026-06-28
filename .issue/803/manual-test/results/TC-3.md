# TC-3: 外側クリッククローズ（AC-2）

結果: PASS

## 概要
viewport 1280x900 で候補パネルを開き、タグコンテナ外側クリックで閉じること、および候補クリックでのタグ追加がクローズ処理に妨げられないことを検証。

## 実行ログ
| 手順 | 操作 | 結果 |
|---|---|---|
| 1 | combobox click → type "t" | listbox 表示, expanded=true, 候補5件 |
| 2 | 外側（タイトル input）を click | listbox=0, opts=0, expanded=false（パネル閉じる）|
| 3 | 副次確認: draft "t" は blur コミットされチップ "#t" 化 | tagGroup="#t"（AC-4 #6 の blur コミットも同時確認）|
| 4 | reload → type "t" → 候補 tag-alpha を click | チップ "#tag-alpha" 追加, draft="", expanded=false |

## 判定
- 外側クリックで候補パネルが非表示（expanded=false, listbox 消滅）。PASS
- パネル内候補クリックでタグが追加されチップ "#tag-alpha" 表示（外側クリックのクローズが候補選択を妨げない）。PASS

備考: h1 見出しは sticky タブに覆われ click ターゲットにできなかったため、外側クリック対象はタイトル input を使用。これは blur も同時に発生するが、いずれにせよパネルは閉じ、AC-2 のクローズ挙動を満たす。
