# テスト実行サマリー — Issue #696

**実行日時**: 2026-06-13
**テストソース**: .issue/696/testing.md
**サーバー**: http://localhost:3000
**手法**: agent-browser 0.27.1（Cookie セッション注入で dev-admin 認証）

| TC | テスト名 | 種別 | 結果 | AC |
|----|---------|------|------|-----|
| TC-1 | 編集画面に WYSIWYG タブが表示・切替可能 | 正常系 | PASS | AC-1 |
| TC-2 | 非対応タグ含有時の警告ダイアログ表示・失われる要素提示 | 正常系 | PASS | AC-2, AC-5 |
| TC-3 | 対応タグのみは警告無しで即切替 | 正常系 | PASS | AC-3 |
| TC-4 | キャンセル時にモード・コンテンツ維持 | 正常系 | PASS | AC-4 |
| TC-5 | 同意して切替後、ペイン内バナーが再同意を求めない | 正常系 | PASS | AC-7 |
| TC-6 | 新規作成画面のタブ構成が不変 | 回帰 | PASS | AC-6 |

**合計**: 6 件（PASS: 6 / FAIL: 0）

## 補足

- **AC-8（自動保存との整合）** はブラウザ操作での観測が難しいため、ユニットテスト（`noteEditorModeChange.test.tsx` の in-flight saveDraft cancel テスト green、切替自体は contentHtml を変更しない）で担保。`pnpm test:unit app/components/note/editor` = 258 passed。

## 観測ログ要点

- TC-1: 編集画面のタブ列が `[ビジュアル(selected), WYSIWYG, FrontMatter, HTML]`（ADR-003 の並び順どおり）。WYSIWYG タブで切替可能。
- TC-2: 非対応タグ（`<section>`, `<table>`, `<tbody>`, `<td>` 等）を含むノートで WYSIWYG タブ押下 → `role="alertdialog"`「WYSIWYG モードに切り替えますか？」が出現。本文に「次の要素は WYSIWYG モードでは保持されません:」＋失われるタグを `<code>` リストで提示。クリック時点ではモード未切替（ビジュアル selected のまま）。
- TC-3: 対応タグのみ（`<p>`, `<strong>`, `<em>`, `<a>`）のノートで WYSIWYG タブ押下 → ダイアログ無しで即 WYSIWYG ペイン（ツールバー表示）に切替。
- TC-4: ダイアログで「キャンセル」→ ダイアログ消滅・ビジュアルタブ selected 維持・table コンテンツ保持（装飾破壊なし）。
- TC-5: ダイアログで「切り替える」→ WYSIWYG タブ selected。ペイン内警告は `role="note"` の控えめ表示（「以下の要素は WYSIWYG モードでは保持されません:」）で、再同意ボタンは存在しない（二重同意なし）。
- TC-6: `/notes/new` のタブ列は `[WYSIWYG(selected), FrontMatter, HTML]` で本変更前と同一。
