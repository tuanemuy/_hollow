# ブラウザ検証レポート — Issue #789

**実行日時**: 2026-06-28
**テストソース**: .issue/789/testing.md
**サーバー**: http://localhost:3000（`pnpm dev`）

## 結果サマリー
全 3 クラスタ・12 サブ項目中、11 PASS / 0 FAIL / 1 SKIP（disabled）。受け入れ基準 AC-1〜AC-7 をブラウザ上で確認、AC-8（IME）・disabled はユニットテストで担保。

## 確認できたこと（受け入れ基準対応）
- **AC-1**: chip + input が `role="group" aria-label="タグ"` の 1 コンテナにまとまり、`border-hairline rounded-lg` ＋ `focus-within:border-accent focus-within:shadow-focus` でフォーカス可視化。input は `role="combobox"`。
- **AC-2**: 空状態 placeholder「タグを追加…」。各 chip に `aria-label="{name} を削除"` の × ボタンがありクリックで削除可能。
- **AC-3**: `re` 入力で `listbox "タグ候補"` に `#react` が出る。確定済みは除外。
- **AC-4 / AC-7**: ArrowDown で先頭候補が `aria-selected`/active、Enter で chip 化。input に実フォーカスを残した activedescendant 方式。
- **AC-5**: 既存一致は `#tag`、新規は `＋「{name}」を新規作成` 行で区別。既存候補ゼロでも新規作成行のパネルが出る。
- **AC-6**: 51 文字で「タグ名は50文字以内で入力してください」表示＋commit 抑止、50 以下で解消、空欄ではエラーなし。
- **未選択 Enter の新規確定**: `foobarbaz` 候補があっても未選択 Enter は draft `foobar` を新規確定（候補に奪われない）。
- **エッジ**: Escape で候補クローズ＋draft 保持、候補クリックで blur 暴発なし。
- **回帰**: カンマ分割・Backspace 末尾削除・blur commit が従来どおり。autosave ペイロードに tags 不在（HAR＋ソース確認）。

## SKIP / 補完
- IME（AC-8）: ブラウザ自動操作で確実に再現困難 → `TagsInput.test.tsx` の isComposing ガードで担保。
- disabled 不活性: 保存中状態の安定再現困難 → ユニットテストで担保。

## 起票した Issue
なし（FAIL ゼロ）。

## 成果物
- 個別結果: results/TC-001.md, TC-002.md, TC-003.md
- サマリー: results/summary.md
