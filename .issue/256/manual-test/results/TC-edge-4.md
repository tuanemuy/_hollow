# Edge Case 4: editing view 内での再 render で focus が再強制されない

**結果**: PASS
**セッション**: verify-tc-005

## 実行ログ

| # | 操作 | 期待 | 実測 | 判定 |
|---|---|---|---|---|
| 1 | editing 突入直後、focus が title input (id=_r_b_, placeholder="ノートのタイトル") | OK | id="_r_b_", tag=INPUT, placeholder=ノートのタイトル | PASS |
| 2 | Tab を 3 回押下し、タグ入力 (id=_r_c_) に移動 | OK | id="_r_c_", placeholder="例: idea, draft" | PASS |
| 3 | タグ入力に "test-edge-4" を入力（再 render を発火） | focus はタグ入力に留まる | id="_r_c_", value="test-edge-4" | PASS |

`view.kind` をキーにした useEffect なので、editing 内のフィールド変更で focus が title input に戻ることはない。実装どおりの挙動を確認。

## スクリーンショット

- タイピング後: `screenshots/tc-edge-4/after-typing.png`
