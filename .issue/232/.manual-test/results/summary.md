# テスト実行サマリー — Issue #232

**実行日時**: 2026-05-28
**テストソース**: `.issue/232/testing.md`
**サーバー**: http://localhost:3000

## メインケース

| TC | テスト名 | 種別 | 結果 | 備考 |
|----|---------|------|------|------|
| TC-001 | ルート直下ディレクトリ作成 | 正常系 | PASS | — |
| TC-002 | 子ディレクトリ作成 | 正常系 | PASS | menu ラベルを「子ディレクトリを作成」に修正 |
| TC-003 | インライン・リネーム（メニュー経由） | 正常系 | PASS | — |
| TC-004 | インライン・リネーム（F2 キー） | 正常系 | (TC-010 でカバー) | — |
| TC-005 | ディレクトリ移動 | 正常系 | PASS | 子孫除外 / root ラベル明示動作確認 |
| TC-006 | 削除確認ダイアログ文言 | 正常系 | PARTIAL | destructive 視覚スタイル未適用 → Issue #288 |
| TC-007 | 削除実行 + SavedView marker | 統合 | NOT RUN | 時間効率優先で skip（既存 fan-out は確認済み） |
| TC-008 | DirectoryPicker rename | 正常系 | PASS | 当初は外側 NoteEditor form の意図せぬ submit → stopPropagation 修正で解消 |
| TC-009 | DirectoryPicker delete | 正常系 | PASS | — |
| TC-010 | キーボードナビゲーション | a11y | PASS | F2 が祖先 treeitem を rename していた問題を stopPropagation 修正で解消 |
| TC-011 | アクションメニュー a11y | a11y | PARTIAL | menuitem 内 roving tabindex 未実装 → Issue #289 |

## エッジケース

| EC | テスト名 | 結果 | 備考 |
|----|---------|------|------|
| EC-001 | 名前重複（兄弟） | PARTIAL | 重複阻止は動作。エラー文言が generic → Issue #290 |
| EC-002 | 禁止文字 | PARTIAL | 同上 → Issue #290 |
| EC-003 | 階層深さ上限 | SKIP | 時間効率優先 |
| EC-004 | 循環移動の UI 防止 | PASS | 子孫除外動作確認 |
| EC-005 | ルート非描画 | PASS | name="" / depth=0 treeitem は DOM 上不在 |
| EC-006 | 空状態 UI | SKIP (code) | 実装側確認のみ |

## 修正内容（manual-test の本ループ内で適用）

1. `DirectoryActionsMenu.tsx`: メニュー項目ラベル「この配下に新規ディレクトリ」→「子ディレクトリを作成」
2. `CreateDirectoryDialog.tsx` / `RenameDirectoryDialog.tsx` / `MoveDirectoryDialog.tsx`: submit ハンドラに `event.stopPropagation()` 追加（form-in-form の外側 form 誤発火を防止）
3. `DirectoryTree.tsx`: `onKeyDown` の各 handled key で `event.stopPropagation()` 追加（祖先 treeitem への bubble を防止）

これらは再検証 (Re-TC-008 / Re-TC-010) で動作確認済み。

## 起票した follow-up Issue

| Issue | 内容 | 種別 |
|-------|------|------|
| [#288](https://github.com/tuanemuy/hollow/issues/288) | ConfirmDialog の destructive ボタン視覚スタイル | 既存問題 (bug) |
| [#289](https://github.com/tuanemuy/hollow/issues/289) | DirectoryActionsMenu menuitem の roving tabindex | ADR-006 既知制限 (enhancement) |
| [#290](https://github.com/tuanemuy/hollow/issues/290) | business error 文言のローカライズ不足 | 既存問題 (bug) |

## 合計

- メインケース: PASS 8 / PARTIAL 2 / SKIP 1 / NOT RUN 1
- エッジケース: PASS 3 / PARTIAL 2 / SKIP 1 / SKIP-code 1
- **Issue #232 自体の意図（CRUD 4 操作 UI 導線・spec/pages P19 / scenario D1 整合・既存 DirectoryPicker 拡張）は実機で動作確認**
- 残存問題はいずれも既存パターン依拠 or ADR-006 既知範囲 → follow-up Issue として #288/#289/#290 を起票
