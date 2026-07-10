# テスト実行サマリー — Issue #824

**実行日時**: 2026-07-10
**テストソース**: .issue/824/testing.md
**サーバー**: http://localhost:3000
**検証手法**: agent-browser（viewport 切替 + computed style / DOM 検査による CSS 駆動の表示挙動確認）

| TC | 検証内容 | 対応AC | 結果 |
|----|---------|--------|------|
| TC-1 | モバイル390で既存タイトル編集を開く→ヘッダー簡略タイトル即表示 | AC-1(edit), AC-2, AC-3, AC-7, AC-8 | PASS |
| TC-2 | デスクトップ1280で編集画面→簡略タイトル非表示・検索表示 | AC-4 | PASS |
| TC-3 | モバイル390で新規ノート→空タイトル時は検索、入力で置換 | AC-1(new), AC-8 | PASS |
| TC-4 | 編集画面→ホーム遷移で簡略タイトル消滅・検索復帰 | AC-6 | PASS |
| TC-5 | 非エディタ shell 画面(/ , /settings)モバイル/デスクトップ不変 | AC-5 | PASS |
| TC-6 | エディタ title input のアクセシブル名確認（二重読み上げ防止） | AC-3 | PASS |

**合計**: 6 件（PASS: 6 / FAIL: 0）

## 主要な観測値（TC-1 モバイル390 編集画面）

- header-doc: `aria-hidden="true"` / `display: block`（モバイル表示）
- タイポ: `font-size 13px`（= プロジェクト `--text-sm`, mock 準拠）/ `font-weight 500`（font-medium）/ `text-align: start`（左寄せ、text-center なし＝AC-7）
- truncate: `white-space nowrap` + `text-overflow ellipsis` + `overflow-x hidden`、`scrollWidth > clientWidth`（長文が実際に省略）
- 押し広げ: `header.scrollWidth > clientWidth` = false（min-w-0 が効きヘッダーを広げない＝AC-2）
- 検索置換: 検索ラッパー `data-doc="true"` / `display: none`（AC-8）
- エディタ本体: `#note-editor-title` に値あり・アクセシブル名「タイトル」・`aria-hidden` なし（AC-3）

## AC-4 / AC-5 / AC-6 の観測値

- AC-4（desktop 編集）: header-doc `display:none` / 検索 `display:block`
- AC-5（`/`, `/settings` 非エディタ）: header-doc 不在 / 検索 `display:block` / `data-doc` なし（モバイル・デスクトップ両方で不変）
- AC-6（編集→`/`）: 遷移後 header-doc 不在 / `data-doc` null / 検索 `display:block`（unmount クリア成立）

## 補足（テスト経路の知見）

- `/notes`・`/notes/public` 等は共有 AppShell ヘッダー（Header.tsx）ではなく別レイアウトのヘッダーを使う。共有シェルヘッダー（検索付き）を使う非エディタ画面は `/`（ホーム）・`/settings` 等。AC-5 の回帰確認はこれら shell 画面で実施した。本 Issue の変更対象は shell ヘッダーのみで、別レイアウトのページには波及しない。
