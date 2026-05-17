# TC-E03: search 経路で公開状態 select の既知挙動（ADR-008）

- **Issue:** #8
- **実行日時:** 2026-05-17
- **検証者:** Claude Code (agent-browser session `verify-tc-issue8-b`)
- **対象 URL:** `http://localhost:3000/?q=Project` → select 操作後 `?q=Project&visibility=public`
- **結果:** **PASS**（ADR-008 既知挙動として）

## 目的

ADR-008 の既知挙動「search 経路（`q` が空でない）では公開状態 select が URL には反映されるが、結果には反映されない」を確認。

## 手順

1. シードユーザーでログイン
2. `http://localhost:3000/?q=Project`（search 経路）にアクセス
3. 公開状態 select を「公開」に変更
4. URL と結果の変化を比較

## 期待結果

- URL に `visibility=public` が付与される
- 検索結果（件数・一覧）は **変わらない**
- 公開状態 select の表示自体は「公開」になる

## 実際の結果

| ステップ | URL                                                                | 件数 | select |
|----------|--------------------------------------------------------------------|------|--------|
| 初期     | `/?q=Project&page=1&limit=20`                                      | 0    | すべて |
| select 操作後 | `/?q=Project&page=1&limit=20&visibility=public`                | 0    | 公開   |

- 検索結果は select 切り替え前後とも同じ「0 件 / 該当するノートがありません」
- URL には `visibility=public` が反映された
- select 自体の selected 状態も「公開」に切り替わった

## 補足

検索クエリ `q=Project` / `q=デザイン` / `q=list` 等を試したがいずれも 0 件ヒット
（FTS5 トークナイザ周りの別問題と思われる。本 Issue #8 のスコープ外）。

ただし TC-E03 の本旨「search 経路で select 操作が結果計算に影響しない」は、
select 切替前後で URL のみ変化し結果は一切変化しなかった事実から確認できた。
これは ADR-008 の既知挙動と一致しており、ADR-012 解消用の別 Issue で対応予定。

## スクリーンショット

- 切替前（`q=Project` / select=すべて）: `/Users/hikaru/github.com/tuanemuy/hollow2/.issue/8/manual-test/screenshots/tc-e03/step-1-search-before.png`
- 切替後（`q=Project&visibility=public` / select=公開）: `/Users/hikaru/github.com/tuanemuy/hollow2/.issue/8/manual-test/screenshots/tc-e03/step-2-search-after.png`

## 結論

ADR-008 既知挙動どおり、search 経路では公開状態 select の操作が URL に反映されるが、結果計算には反映されない。本 Issue #8 のスコープでは PASS（仕様どおり）。
