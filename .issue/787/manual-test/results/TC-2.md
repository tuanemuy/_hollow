# TC-2: 実装とモックの一致（モバイル幅 390px） (AC-3 / AC-6)

結果: PASS

対象: 非公開ノート詳細 `http://localhost:3000/notes/01950010-0000-7000-8000-000000000201`（ログイン後、viewport 390x800、`max-sm` 発火 = `matchMedia('(max-width: 639px)')` true）

`[role=toolbar]` の computed style と icon-only ピル内 svg 幅を計測。3レバー（gap / 縦マージン / アイコン密度）がモック（TC-1）と一致。

| レバー | モック値(TC-1) | 実装値(390px) | 判定 |
| --- | --- | --- | --- |
| gap | 4px | 4px | PASS |
| margin-top | 12px | 12px | PASS |
| margin-bottom | 16px | 16px | PASS |
| icon-only グリフ svg | 18px | 18px (×4) | PASS |

備考:
- svg 一覧 = [18(編集), 16(公開状態ピル内ステータス), 18(移動), 18(URLコピー), 18(エクスポート), 18(その他)]。16px はラベル付き「公開状態」ピル内の小型アイコンで本Issue対象外。
- 初回計測時に `open --viewport` が反映されず innerWidth=1280（desktop 値が出た）。`set viewport 390 800` で 390px を確定させてから再計測し一致を確認した。
- 編集(Pencil)ボタンの有無や rail 先頭構成差は AC-6 対象外（testing.md 注記どおり誤判定せず）。
