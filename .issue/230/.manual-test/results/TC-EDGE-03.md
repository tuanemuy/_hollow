# TC-EDGE-03: raw JSON モードで不正な JSON 入力

**結果:** PASS

## 手順と結果

1. ノート 2301 を開く → FrontMatter タブ → 「生編集（JSON）」に切替
2. JSON テキストエリアに `{ invalid json` を入力
3. 行・列番号付きエラー (2 つの alert) が表示:
   - `JSON エラー: Expected property name or '}' in JSON at position 2 (line 1 column 3)`
   - `JSON が解析できません: ...`
4. 「保存」ボタンが disabled となり、保存はブロックされる

## スクリーンショット

- /Users/hikaru/.agent-browser/tmp/screenshots/screenshot-1779845266156.png
