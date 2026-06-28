# TC-5（エッジ）: 候補ゼロ・新規作成のみ

結果: PASS

## 概要
viewport 1280x440 で既存非マッチ文字列 "zzz" を入力し、「＋『zzz』を新規作成」インジケータのみの小パネルが viewport 内に収まり、外側クリックで閉じることを検証。

## 実行ログ
| 手順 | 操作 | 結果 |
|---|---|---|
| 1 | type "zzz" | role=option=0, expanded=true（listbox は無し）|
| 2 | パネル要素計測 | text="＋「zzz」を新規作成", position=absolute, top=313, bottom=363, transform=none, innerH=440, fits(<=432)=true |
| 3 | 外側（タイトル input）click | expanded=false, パネル消滅, draft "zzz" は blur コミットで "#zzz" 化 |

## 判定
- 新規作成行のみの小パネルが viewport 内に収まる（bottom 363<=432）。PASS
- 外側クリックで閉じる。PASS

備考: 候補ゼロ時はパネルに role=listbox を持たず、新規作成行のみの絶対配置 div として描画される。小サイズ（約50px）のため viewport 440 では shift 不要（transform=none）。
