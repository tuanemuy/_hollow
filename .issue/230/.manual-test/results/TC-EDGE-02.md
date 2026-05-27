# TC-EDGE-02: 新規キー追加での重複キー reject

**結果:** PASS

## 手順と結果

1. ノート 2301 (`mood: focused`, `project: alpha`) を開く → FrontMatter タブ
2. 「追加するキー名」に `mood` 入力 → 「キーを追加」クリック
3. インライン alert `"key already exists: mood"` が表示
4. 既存 `mood`, `project` の 2 行のままで、3 行目は追加されない
5. 既存 `mood` の値 (`focused`) は壊れない

## スクリーンショット

- /Users/hikaru/.agent-browser/tmp/screenshots/screenshot-1779845228200.png
