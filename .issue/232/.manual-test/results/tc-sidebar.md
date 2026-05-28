# TC-Sidebar 実行結果 — Issue #232 サイドバーディレクトリ操作

- **実行日**: 2026-05-28
- **実行者**: agent-browser (verify-tc-sidebar セッション)
- **対象URL**: http://localhost:3000
- **agent-browser**: 0.27.0
- **ログインアカウント**: existing@example.com
- **テストソース**: `.issue/232/testing.md`

## サマリ

| TC | テスト名 | 判定 | 備考 |
| --- | --- | --- | --- |
| TC-001 | ルート直下ディレクトリ作成 | PASS | `TestRoot` がサイドバーに即時表示 |
| TC-002 | 子ディレクトリ作成 | PASS（軽微な仕様差） | メニュー項目が「子ディレクトリを作成」ではなく「この配下に新規ディレクトリ」になっている |
| TC-003 | インライン・リネーム（メニュー経由） | PASS | input表示 → Enterで `Child1Renamed` に更新 |
| TC-005 | ディレクトリ移動 | PASS | 自身（Child1Renamed）が選択肢に含まれず Bar 配下へ移動 |
| TC-006 | 削除確認ダイアログ文言検証 | PASS（部分的不一致） | 文言は仕様通りだが、削除ボタンの destructive スタイルが視覚的に適用されていない |

## 詳細

### TC-001: ルート直下ディレクトリ作成

| 項目 | 内容 |
| --- | --- |
| 操作 | 1) `/` (ホーム) アクセス、2) サイドバー「+」(`aria-label="ディレクトリを新規作成"`) クリック、3) ダイアログで `TestRoot` 入力、4) 「作成」クリック |
| 期待 | ダイアログが閉じ、サイドバーに `TestRoot` が即時表示 |
| 実際 | ダイアログが閉じ、サイドバーに `TestRoot`（level=1 treeitem）が追加された |
| 判定 | PASS |
| スクリーンショット | step-01-home.png, step-02-create-root.png, step-03-tc001-pass.png |

### TC-002: 子ディレクトリ作成

| 項目 | 内容 |
| --- | --- |
| 操作 | 1) `Foo` の「︙」(`aria-label="Foo の操作"`) クリック、2) ポップオーバー確認、3) 「この配下に新規ディレクトリ」クリック、4) `Child1` 入力、5) 「作成」クリック |
| 期待 | ポップオーバーに「子ディレクトリを作成」「リネーム」「移動」「削除」の 4 項目。`Foo` 配下に `Child1` が表示 |
| 実際 | ポップオーバーには「この配下に新規ディレクトリ」「リネーム」「移動」「削除」の 4 項目（**「子ディレクトリを作成」ではなく「この配下に新規ディレクトリ」**）。ダイアログには「作成先: Foo」と表示。作成後、`Foo` (`expanded=true`) 配下に `Child1` が level=2 treeitem として表示された |
| 判定 | PASS（4項目が揃いダイアログ遷移・作成は正常。ただし文言が `.issue/232/testing.md` に書かれた期待 "子ディレクトリを作成" と異なる） |
| スクリーンショット | step-04-tc002-menu.png, step-05-tc002-pass.png |

### TC-003: インライン・リネーム（メニュー経由）

| 項目 | 内容 |
| --- | --- |
| 操作 | 1) `Child1` の「︙」クリック → 2) 「リネーム」クリック → 3) input に `Child1Renamed` を入力 → 4) Enter |
| 期待 | input に初期値 `Child1` が入りフォーカス。Enter で input 消滅し新しい名前表示 |
| 実際 | `treeitem [level=2]` 内に `textbox "ディレクトリ名": Child1` が出現。値を `Child1Renamed` に書き換え Enter 押下後、input が消え `link "Child1Renamed"` 表示に切り替わった |
| 判定 | PASS |
| スクリーンショット | step-06-tc003-input.png, step-07-tc003-pass.png |

### TC-005: ディレクトリ移動

| 項目 | 内容 |
| --- | --- |
| 操作 | 1) `Child1Renamed` の「︙」→「移動」クリック、2) select の選択肢を確認、3) `Bar` を選択、4) 「移動」クリック |
| 期待 | select に「（ルート）」「Bar」「Baz」「Foo」「TestRoot」が並び、`Child1Renamed` 自身は含まれない。移動後 `Bar` 配下に `Child1Renamed` |
| 実際 | dialog `「Child1Renamed」を移動`。combobox 選択肢: `— 選択してください —` / `（ルート）` / ` //Bar` / ` //Baz` / ` //Foo` / ` //TestRoot`（**`Child1Renamed` は含まれない**）。`//Bar` 選択後、移動ボタンが活性化しクリック。完了後 `Bar` が expanded=true となり、その配下に `Child1Renamed` (level=2) が表示 |
| 判定 | PASS |
| スクリーンショット | step-08-tc005-dialog.png, step-09-tc005-pass.png |

### TC-006: ディレクトリ削除（確認ダイアログ文言検証）

| 項目 | 内容 |
| --- | --- |
| 操作 | 1) `TestRoot` の「︙」→「削除」クリック、2) ConfirmDialog 文言確認、3) 「キャンセル」クリック |
| 期待 | タイトルに `TestRoot` を含む、description に「配下のノートはゴミ箱へ移動」「配下のディレクトリも再帰的に削除」相当の文言、削除ボタンが destructive スタイル（赤系） |
| 実際 | alertdialog タイトル: `「TestRoot」を削除しますか？`（TestRoot 含む ✓）。description: `このディレクトリを削除します。配下のノートはゴミ箱へ移動し、配下のディレクトリも再帰的に削除されます。`（両文言を含む ✓）。**ただし削除ボタンの背景色は `rgb(245, 245, 247)`（`--color-surface` = #f5f5f7 / グレー）、テキストは `rgb(29, 29, 31)`（`--color-ink`）で、destructive な赤系（`#fbebeb` / `#c43e3e`）には**ならない**。** classList には `bg-error-surface text-error hover:bg-error-surface` と `bg-surface text-ink` が両方含まれており、後者が勝っている（おそらく CSS のカスケード順）。キャンセル動作は正常で、ダイアログが閉じ TestRoot は残った |
| 判定 | PASS（文言）/ FAIL（destructive スタイル） — 総合は PARTIAL PASS。文言は仕様通りだが、視覚的な destructive スタイルが現状効いていない |
| スクリーンショット | step-10-tc006-confirm.png, step-11-tc006-after-cancel.png |

## 主要な所見・要注目事項

1. **TC-002 のメニュー文言ズレ**: テストドキュメント (`.issue/232/testing.md` 行43) およびこの実行依頼が想定する「子ディレクトリを作成」と実装が異なり、「この配下に新規ディレクトリ」というラベルになっている。機能は正しく動くが、UI 文言と仕様ドキュメントが不一致。

2. **TC-006 destructive スタイル未適用（要修正候補）**:
   - 削除ボタンの className に `bg-surface text-ink ... bg-error-surface text-error hover:bg-error-surface` の両系統が含まれる。
   - 実測結果: 背景 `rgb(245, 245, 247)` = surface グレー / 文字 `rgb(29, 29, 31)` = ink。すなわち error 系トークンが効いていない。
   - 単独で `<div class="bg-error-surface text-error">` を生成すると `rgb(251, 235, 235)` / `rgb(196, 62, 62)` となり、ユーティリティ自体は生成されている。
   - 原因はベース button 用ユーティリティ (`bg-surface`/`text-ink`) と destructive 追加クラスの CSS カスケード上の優先順位が逆転している可能性が高い（Tailwind では同プロパティ utility は宣言順 = CSS ファイル中の出現順で決まり、クラス属性の並び順は無関係）。
   - 仕様 `.issue/232/testing.md` 行95 の「削除ボタンが destructive スタイル（赤系）で表示」は満たしていない。

3. **テストの自動化観点**:
   - select 要素の `select` コマンドは、option のラベル先頭にスペース ` //Bar` を含む状態でも `//Bar` でマッチ可能（最初の試行 ` //Bar` は反映されず、`//Bar` で成功した）。
   - すべてのテストは制限時間（12分）内に完了。各 agent-browser コマンドの応答も 20 秒以内。

## 実行ログ (主要ステップ)

1. `open http://localhost:3000` → 公開トップ
2. `open http://localhost:3000/login` → ログインフォーム
3. fill email/password → click ログイン → `/?page=1&limit=20` 着地
4. TC-001: `+` ボタン → CreateDirectoryDialog (`作成先: （ルート）`) → fill `TestRoot` → 作成
5. TC-002: Foo `︙` → menu 4 項目確認 → `この配下に新規ディレクトリ` → CreateDirectoryDialog (`作成先: Foo`) → fill `Child1` → 作成
6. TC-003: Child1 `︙` → リネーム → inline input (`Child1`) → 書き換え `Child1Renamed` → Enter
7. TC-005: Child1Renamed `︙` → 移動 → MoveDirectoryDialog (select 5 項目、自身含まず) → `//Bar` 選択 → 移動
8. TC-006: TestRoot `︙` → 削除 → alertdialog 文言・ボタンスタイル検査 → キャンセル
9. close session

## 結論

5 つのテストケースのうち、機能的には**全てPASS**。ただし以下 2 点の不一致が記録対象:

- **TC-002**: メニュー文言「子ディレクトリを作成」想定 → 実装「この配下に新規ディレクトリ」
- **TC-006**: 削除ボタンの destructive 赤系スタイルが視覚的に適用されていない（CSS カスケードの優先度問題と推測）
