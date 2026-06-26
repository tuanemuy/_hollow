# TC-EDGE-1: 非操作時に焦点を奪わない（AC-4）

結果: PASS

環境: http://localhost:5176/tags（reload、dev-admin 認証済み）

## 手順と生データ

| ステップ | 操作 | activeElement (tag/role) |
| --- | --- | --- |
| 1 | /tags reload 後、矢印操作なしで document.body.focus() | BODY / null |
| 2 | wait 1500ms 後に再確認 | BODY / null（text="ノート検索アップロード新規作成ライブラリ"）|

## 判定

- 矢印操作をしていない状態では、wait 後も activeElement は BODY のまま。
- radiogroup（並び替え軸）が勝手に focus を奪う挙動は観測されなかった。
