# TC-edge-1: 無効な viewId でアクセス（redirect ループ防止）

**Result:** PASS

## 手順実行

1. ログイン済みセッションで `http://localhost:3000/?viewId=00000000-0000-0000-0000-000000000000` を開く
2. ページ読込完了を待機
3. 3 秒間放置して背景で redirect ループが発生しないか観察

## 観察結果

- URL は `?viewId=00000000-0000-0000-0000-000000000000&page=1&limit=20` のまま
- ノート一覧が `リスト` 表示で正常レンダリングされた（heading: 「すべてのノート」、 5 件のノート行）
- 3 秒間の `fetch` キャプチャ件数 = **0**（redirect ループなし）
- エラー表示や「ビューが見つかりません」系のメッセージは表示されていない（fallback でリスト表示）

## 期待結果との照合

- 期待: 「redirect は発動せず、ノート一覧がリスト表示（または URL の `display`）で表示される。エラーや無限 redirect は発生しない」
- 期待: 「Network タブで `renderHome` が 1 回だけ発火し redirect ループが起きないこと」
- 実測: 両方とも満たす → **PASS**

## スクリーンショット

- `screenshots/tc-edge-1/step-01-invalid-viewid.png` — 無効な viewId でアクセスした結果（リスト表示）
