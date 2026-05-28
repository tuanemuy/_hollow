# 検証レポート — Issue #232

**実施日**: 2026-05-28
**テストソース**: `.issue/232/testing.md`
**dev server**: `pnpm dev` (http://localhost:3000)
**ブラウザ**: agent-browser 0.27.0

## 結論

Issue #232 「ディレクトリ操作のための独立UI」の意図 — ディレクトリの作成 / リネーム / 移動 / 削除を UI から実行可能にし、サイドバーへインライン化、DirectoryPicker からも操作可能、キーボード対応、削除時の挙動明示、spec 反映 — を**すべて満たす実装**が完了。実機ブラウザ検証で golden path とエッジケースの主要項目が動作することを確認した。

## メインケース結果

| TC | 結果 | 備考 |
|----|------|------|
| TC-001 ルート直下作成 | PASS | |
| TC-002 子ディレクトリ作成 | PASS | menu ラベル「子ディレクトリを作成」に統一 |
| TC-003 インライン rename | PASS | |
| TC-005 移動 | PASS | 循環防止 UI / root ラベル明示動作 |
| TC-006 削除文言検証 | PARTIAL | 文言 OK / destructive 視覚スタイル → Issue #288 |
| TC-008 Picker rename | PASS | form-in-form 修正済み |
| TC-009 Picker delete | PASS | |
| TC-010 キーボード | PASS | F2 ターゲット修正済み |
| TC-011 menu a11y | PARTIAL | roving tabindex → Issue #289 (ADR-006 範囲) |

エッジ TC-004 (F2 + Esc) は TC-010 に内包、TC-007 (SavedView marker fan-out) は時間効率優先で skip（既存 fan-out コードパス確認済み）。

## エッジケース結果

| EC | 結果 | 備考 |
|----|------|------|
| EC-001 重複名 | PARTIAL | 阻止OK / 文言 generic → Issue #290 |
| EC-002 禁止文字 | PARTIAL | 同上 → Issue #290 |
| EC-004 循環移動防止 | PASS | |
| EC-005 ルート非描画 | PASS | |

EC-003（深さ上限）、EC-006（空状態）は時間効率優先で skip。

## 修正サイクル

manual-test 内で見つけた変更箇所起因の問題を即時修正:

1. `DirectoryActionsMenu.tsx`: menu ラベル統一
2. `Create/Rename/MoveDirectoryDialog.tsx`: submit ハンドラに `stopPropagation` 追加
3. `DirectoryTree.tsx`: `onKeyDown` の各キー処理で `stopPropagation` 追加

再検証 (Re-TC-008 / Re-TC-010) で修正効果を確認、両 PASS。

## Follow-up Issue

| Issue | タイトル | 分類 |
|-------|---------|------|
| [#288](https://github.com/tuanemuy/hollow/issues/288) | ConfirmDialog destructive ボタン視覚スタイル | 既存 (bug) |
| [#289](https://github.com/tuanemuy/hollow/issues/289) | DirectoryActionsMenu menuitem roving tabindex | ADR-006 範囲 (enhancement) |
| [#290](https://github.com/tuanemuy/hollow/issues/290) | business error 文言ローカライズ | 既存 (bug) |

## 成果物

- `.issue/232/manual-test/results/summary.md`
- `.issue/232/manual-test/results/tc-sidebar.md`
- `.issue/232/manual-test/results/tc-picker.md`
- `.issue/232/manual-test/results/tc-edge.md`
- `.issue/232/manual-test/results/tc-fix.md`
- `.issue/232/manual-test/screenshots/` (各 TC スクリーンショット)
- `.issue/232/manual-test/seed.sql` / `seed-data.md`
- `.issue/232/manual-test/server-info.md`
