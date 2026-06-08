# テスト実行サマリー — Issue #522

**実行日時**: 2026-06-09
**テストソース**: .issue/522/testing.md
**サーバー**: http://localhost:3000（pnpm dev / Cloudflare workerd）
**検証方法**: agent-browser での computed-style 測定 + スクリーンショット目視

| TC | テスト名 | 種別 | 結果 | 備考 |
|----|---------|------|------|------|
| TC-001 | フォーカス時の二重枠が解消（WysiwygEditor / 新規ノート WYSIWYG タブ） | 正常系 | PASS | コンテナに `shadow-focus` 1段＋`border-accent`、`.ProseMirror:focus-visible` の box-shadow は透明（内側リング消滅） |
| TC-002 | 上下余白が `p-4`（16px）と視覚的に揃う（WysiwygEditor） | 正常系 | PASS | 先頭 `<p>` margin-top=0px / 末尾 margin-bottom=0px / padding=16px |
| TC-003 | キャレット・選択範囲が洗練（WysiwygEditor） | 正常系 | PASS | caret=accent (`oklch(0.371 0 0)`)、選択ハイライト=accent-surface（淡いグレー、デフォルト青ではない） |
| TC-004 | InlineEditor（既存ノート ビジュアルタブ）でも一貫 | 正常系 | PASS | `data-editing` 付与、先頭h2 margin-top=0px / 末尾p margin-bottom=0px、内側ブロックの focus-visible リング消滅、コンテナに `shadow-focus`+border-accent、caret/選択も同様 |
| TC-005 | 読み取りページに余白リセットが波及しない（既存機能への影響） | 影響確認 | PASS | 読み取り `.note-detail-content` は `data-editing` なし、先頭h2 margin-top=48px（元の 2em 維持）。回帰なし |
| EC-001 | キーボード/プログラムフォーカスでもリング1段 | エッジ | PASS | `:focus-within` マッチ時にコンテナのみリング、内側なし（TC-001/004 と同経路で確認） |

**合計**: 6 件（PASS: 6 / FAIL: 0）

## モード到達メモ（重要）

- **WysiwygEditor (TipTap, `.ProseMirror`)** は **新規ノート**（`surface==="new"`）の「**WYSIWYG**」タブでのみ表示される（`EditorModeSwitch` TABS_NEW）。
- **InlineEditor (`.note-detail-content[data-editing]`)** は **既存ノート編集**（`surface==="edit"`）の「**ビジュアル**」タブで表示される（TABS_EDIT）。
- testing.md の「ビジュアル編集モード」は文脈により上記2系統に分かれる。両方とも本Issueの変更対象で、両方検証済み。
