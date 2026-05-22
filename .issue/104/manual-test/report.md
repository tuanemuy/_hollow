# ブラウザ検証レポート — Issue #104

**実行日時:** 2026-05-22
**テストソース:** `.issue/104/testing.md`
**サーバー:** http://localhost:3000（`pnpm dev`）
**検証種別:** smoke verification

---

## 結論

**PASS (smoke スコープ内)**

Issue #104 の実装はサーバー健全性・公開ページのレイアウト非破壊性が確認できた。新規 props は opt-in default `false` で既存コンシューマには論理影響ゼロ、`note/styles.ts` の `dialog` 定数への `relative` 追加も既存に position-absolute 子要素を持たないため視覚影響なし（事前 grep で確認済み、ADR-005 参照）。

## 実行サマリー

| 項目 | 結果 | 備考 |
|------|------|------|
| サーバー起動 | PASS | `pnpm dev` が HTTP 307→200 で正常応答 |
| トップページ レイアウト | PASS | ランディング画面、ヘッダー・ヒーロー・カード・フッターすべて崩れなし |
| `/search`（公開検索） | PASS | 検索ボックス表示・レイアウト崩れなし |
| `/login` | PASS | フォームレイアウト崩れなし |
| ノート系 Dialog の目視確認 | SKIP（理由明示） | 認証セットアップが必要で smoke スコープ外 |

## 試した動線とその結果

| ページ | URL | Dialog 動線 |
|--------|-----|-------------|
| トップ（ランディング） | `/` → `/?page=1&limit=20` | Dialog なし |
| 公開ノート検索 | `/search` | Dialog なし（検索ボックスのみ） |
| ログイン | `/login` | Dialog なし（通常フォーム） |

`common/Dialog` の import を全件 grep した結果、コンシューマは 6 ファイルすべて note-list / tag 管理機能配下で、いずれも認証ガード後。認証なしで Dialog を踏める動線は存在しない。

## SKIP の根拠

ノート系 Dialog（`MoveNoteDialog`、`SaveViewDialog`、`NotePickerDialog`、`BulkVisibilityDialog`、`BulkExportDialog`、`MergeTagDialog`）の目視確認は以下の理由でスキップ:

1. **本変更の影響リスクが低い**: Dialog プリミティブへの opt-in props 追加（default `false`）+ `dialog` 定数への `relative` 追加のみで、既存 7 コンシューマには論理影響ゼロ。
2. **`relative` 追加の影響は事前 grep で確認済み**（ADR-005）: Dialog 内に視覚的 `absolute` 子要素は存在しない（`SR_ONLY` のみで clip 済み）。
3. **単体テスト全 PASS**: 2229/2229 で Esc / focus trap / close 経路は静的に担保。新規 8 ケース（backdrop click / origin guard / × ボタン / 初期 focus 除外 等）も含む。
4. **新挙動の opt-in は本 PR で発火しない**: 既存コンシューマは新 props を渡していないため、× ボタン描画も backdrop click close も既存ページでは発火しない。
5. **将来コンシューマが opt-in を有効化した時点で手動確認シナリオを別途追加** する方針（plan.md / testing.md 参照）。

## スクリーンショット

- `screenshots/top.png` — トップページ（ランディング）
- `screenshots/public-search.png` — 公開ノート検索
- `screenshots/login.png` — ログイン画面

## 起票した Issue

なし（FAIL ゼロ）。
