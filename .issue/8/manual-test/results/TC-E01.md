# TC-E01: `?visibility=` 空値 → 全件表示にフォールバック

- **Issue:** #8
- **実行日時:** 2026-05-17
- **検証者:** Claude Code (agent-browser session `verify-tc-issue8-b`)
- **対象 URL:** `http://localhost:3000/?visibility=`
- **結果:** **PASS**

## 目的

URL に `visibility=` とだけ書かれた空値が zod schema `.catch(undefined)` でフォールバックされ、フィルタなしと同じ全件表示になることを確認。

## 手順

1. シードユーザーでログイン
2. `http://localhost:3000/?visibility=` にアクセス
3. URL と一覧件数を確認

## 期待結果

- フィルタなし扱いで全 10 件表示
- 公開状態 select: 「すべて」
- エラーは出ない

## 実際の結果

- 入力 URL: `http://localhost:3000/?visibility=`
- 遷移後 URL: `http://localhost:3000/?page=1&limit=20`
  → 空 visibility は schema レベルで除去され、URL も書き換わった
- 一覧: 全 10 件表示
- 件数表示: `10 件のノート`
- エラーなし

## スクリーンショット

- `/Users/hikaru/github.com/tuanemuy/hollow2/.issue/8/manual-test/screenshots/tc-e01/step-1.png`

## 結論

`noteListSearchSchema` の zod `.catch(undefined)` フォールバックが期待どおり動作。空 visibility パラメータでもエラーにならず、全件表示に戻る。
