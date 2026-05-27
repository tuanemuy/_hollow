# TC-EDGE-04: 配列値の行で削除ボタンを押す

**結果:** PASS

## 手順と結果

1. ノート 2302 (現状 `tags: ["legacy","old"], description: "test-desc"`) を開く → FrontMatter タブ
2. `tags` 行 (array disabled 表示) の「tags を削除」ボタンをクリック
3. 行が即時消える (構造モード)
4. 「保存」 → リロード → raw JSON で確認:

```json
{
  "description": "test-desc"
}
```

5. `tags` キーがエディタからも保存後も消えている

## 確認ポイント

- disabled は値の編集だけで、削除は可能 (期待通り)
- autosave / 保存後に persist

## スクリーンショット

- /Users/hikaru/.agent-browser/tmp/screenshots/screenshot-1779845312147.png
