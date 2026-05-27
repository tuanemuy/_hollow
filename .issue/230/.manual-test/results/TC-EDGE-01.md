# TC-EDGE-01: キー rename での重複キー reject

**結果:** PASS

## 手順と結果

1. ノート 2303 (TC-06 で `b → xyz` 済み、現状 `a, xyz, c`) を開く
2. `xyz` のキー入力欄に `a` を fill → Tab で blur
3. インライン alert `"key already exists: a"` が FrontMatter エディタ上部に表示
4. 「保存」ボタンが disabled になる
5. 既存 `a` 行はそのまま (値 `1`), `xyz` 行のキーラベル (textbox/delete button) は `xyz` のまま保持

## 確認ポイント

- 重複キーが reducer の重複ガードで弾かれ、role=alert で UI 通知される
- 保存がブロックされる (保存ボタン disabled)
- 既存データは破壊されない

## スクリーンショット

- /Users/hikaru/.agent-browser/tmp/screenshots/screenshot-1779845153449.png
