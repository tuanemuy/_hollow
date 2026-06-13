# テスト実行サマリー — Issue #689

**実行日時**: 2026-06-13
**テストソース**: .issue/689/testing.md
**サーバー**: http://localhost:3000

| TC | テスト名 | 種別 | 結果 | 備考 |
|----|---------|------|------|------|
| TC-tags-1 | タグ行のチップUI（AC-1） | 正常系 | PASS | チップ + borderless 入力が同一 list 内に共存 |
| TC-tags-2 | タグ追加/削除/保存/autosave/重複/空（AC-2） | 正常系 | PASS | IME 抑止のみ手動確認推奨 |
| TC-title | タイトルの見出しフォント・行高（AC-3） | 正常系 | PASS | font-heading 適用、lineHeight=fontSize×1.12 |
| TC-body | 本文エディタのボーダーレス化（AC-5） | 正常系 | PASS | 初回 FAIL → InlineEditor 修正後 PASS |
| TC-dir | ディレクトリ行の単一pill＋ツリードロップダウン（AC-4） | 正常系 | PASS | 検索/折りたたみ/キーボード/選択/新規作成/閉じる 全機能 |
| TC-dir-edge | 検索ヒットゼロ | 異常系 | PASS | 候補ゼロでもクラッシュせず空状態 |

**合計**: 6 件（PASS: 6 / FAIL: 0）

## 検証中に発見・即時修正した問題

- **TC-body 初回 FAIL**: 計画/Issue は `WysiwygEditor.tsx`（新規画面の WYSIWYG タブ専用）の枠線撤去のみを対象としていたが、編集画面（P12 = モック対象）の「ビジュアル」タブは `InlineEditor`（`inline` モード）を描画する。ボーダーレス化が編集画面の実エディタに反映されていなかった。
  - 修正: `InlineEditor.tsx` L863 の host className からも `rounded-md border border-hairline` を撤去（`p-4` / `min-h-[480px]` / `focus-within:*` は温存）。
  - 変更箇所起因かつ即時修正可能なため Phase 2 に戻って修正・再検証し PASS を確認した（Issue 起票は不要）。

## 補足

- IME 変換確定中の Enter 抑止（`isComposing`）は agent-browser で再現困難なため自動検証対象外。実装上は `TagsInput` / `DirectoryTreeSelect` の検索・新規名入力で `event.nativeEvent.isComposing` ガードを実装済み。手動確認を推奨。
