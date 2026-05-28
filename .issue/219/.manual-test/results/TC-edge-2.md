# TC-edge-2: `/?display=tile` 直アクセスでタイル表示

**Result:** PASS

## 手順実行

1. ログイン済みセッションで `http://localhost:3000/?display=tile` を直接開く
2. ページ読込完了を待機
3. 表示形式タブの selected 状態を確認

## 観察結果

- URL = `http://localhost:3000/?display=tile&page=1&limit=20`
- タブの selected 状態: **タイル** が selected（リスト・カレンダーは未選択）
- リスト → タイルの一瞬の切替によるチラつき無し（スクリーンショット参照）

## 期待結果との照合

- 期待: 「初回ロード時点でタイル表示で開く。リスト表示が一瞬出てからタイルに切り替わる、というチラつきが無い」
- 実測: 直接タイル表示で開く → **PASS**

## スクリーンショット

- `screenshots/tc-edge-2/step-01-direct-tile.png` — 直アクセス時のタイル表示
