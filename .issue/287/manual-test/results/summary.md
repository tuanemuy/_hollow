# テスト実行サマリー

**実行日時**: 2026-07-11
**テストソース**: .issue/287/testing.md
**サーバー**: http://localhost:8787（`pnpm build:local && pnpm start`）

| TC | テスト名 | 種別 | 結果 | 失敗ステップ |
|----|---------|------|------|-------------|
| TC-001 | メディア挿入直後の `<p><img></p>` decorate（AC-1/2） | 正常系 | PASS | - |
| TC-002 | 画像前後へのテキスト入力が rollback されず保存（AC-3） | 正常系 | PASS | - |
| TC-003 | 保存 round-trip: contenteditable 非漏出（AC-4） | 正常系 | PASS | - |
| TC-004 | 既存 decorate 規則の回帰なし（AC-5） | 正常系 | PASS | - |
| TC-005 | テキスト入力後の `<img>` Backspace 削除試行 | エッジ | PASS | - |
| TC-006 | `<img>` クリック選択して文字入力 | エッジ | PASS | - |
| TC-007 | `<br>` プレースホルダ付き空ブロックへの入力 | エッジ | PASS | - |
| TC-008 | 既存機能への影響確認（wysiwyg/html 挿入・disabled・モード往復） | 回帰 | PASS | - |

**合計**: 8 件（PASS: 8 / FAIL: 0）

## フォローアップ候補（FAIL ではないが観察された実害シナリオ）

- **snapshot 追従の欠如による道連れ巻き戻り**（TC-005 / TC-007 で観察）: rollback は最後の rebuild snapshot までエディタ全体を巻き戻す。
  - TC-005: `<img>` Backspace 削除試行で、直前の未保存テキストが道連れ消失
  - TC-007: `<td><br></td>` への 1 文字入力（`<br>` remove を含むバッチ → 保守的 rollback）で、保存済みだった他ブロックの入力が DOM から消え、その後の入力で巻き戻り後の本文が上書き保存されサイレント消失
  - #287 で `<td><br></td>` 等が新たに editable になったことで遭遇頻度が上がる。Phase 4 で Issue 起票判断

## 注記

- IME 入力の確認（TC-002 確認ポイント）は agent-browser の制約で SKIP（結果ファイルに明記）
- testing.md の「別タブで開くと編集ロック」記述は現実装と乖離（ロック機構は存在せず、disabled は保存 transition 中のみ）。本 Issue の回帰ではなく、disabled 時の contenteditable 全除去は検証済み
- 保存ステータスの実文言は「保存しました」（testing.md の「保存済み」は表記差）
