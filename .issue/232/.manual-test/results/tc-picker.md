# 動作確認結果 — Issue #232: DirectoryPicker / キーボード / アクセシビリティ

**Issue:** #232
**実行日:** 2026-05-28
**実行者:** automated (agent-browser 0.27.0)
**セッション:** verify-tc-picker
**dev server:** http://localhost:3000
**ログインアカウント:** existing@example.com
**実行ソース:** `.issue/232/testing.md` (項目 8 / 9 / 10 / 11)

## サマリ

| TC | 目的 | 判定 |
| --- | --- | --- |
| TC-008 | DirectoryPicker からのリネーム | PASS（注釈あり） |
| TC-009 | DirectoryPicker からの削除（文言/挙動） | PASS |
| TC-010 | サイドバーのキーボードナビゲーション | PASS（注釈あり） |
| TC-011 | アクションメニューのアクセシビリティ | PARTIAL（注釈あり） |

注釈：TC-008 は副作用、TC-010 / TC-011 はキー処理境界に関する追加観察あり。本文の表に詳細を記載。

---

## TC-008: DirectoryPicker（NoteEditor 内）からのリネーム

| ステップ | 操作 | 期待 | 実際 | 判定 |
| --- | --- | --- | --- | --- |
| 1 | サイドバー「Foo」をクリックしてフィルター | URL に `directoryId` パラメータが付き、Foo 配下のノートのみ表示される | `http://localhost:3000/?page=1&limit=20&directoryId=01938f02-0000-7000-8000-000000000001` に遷移、ノート 2 件表示 | PASS |
| 2 | 表示された `Foo配下の検証用ノート 1` を開き「編集」をクリックして `/notes/{id}/edit` へ | エディタが開く | エディタ表示。`/notes/01938f02-0000-7000-8000-000000000101/edit` | PASS |
| 3 | NoteEditor 画面の「ディレクトリ」セクションを確認 | `<group "ディレクトリ">` が存在し、`<combobox "既存ディレクトリ">` がある | アクセシビリティツリーに `group "ディレクトリ"` が存在、`combobox "既存ディレクトリ"` ref=e28 で表示 | PASS |
| 4 | select で `Foo` が選択されていることを確認 | option `Foo` が selected | combobox の現在値 `Foo`、option `Foo` が `[selected]` | PASS |
| 5 | select の右に「リネーム」「削除」ボタンが表示されていることを確認（opt-in `allowExistingActions` 適用確認） | `button "リネーム"` / `button "削除"` がレンダリングされている | ref=e29「リネーム」、ref=e30「削除」が存在 | PASS |
| 6 | 「リネーム」をクリック | `RenameDirectoryDialog` が開く | `dialog "ディレクトリをリネーム"` が開く。初期値 `Foo`、`button "キャンセル"` / `button "保存"` あり | PASS |
| 7 | 新しい名前 `FooRenamed` を入れて「保存」をクリック | ダイアログが閉じ、DirectoryPicker の select 表示が `FooRenamed` になる | ダイアログ閉、サイドバーツリーで `FooRenamed` 表示、ノート detail / editor で combobox 値 `FooRenamed`、option `FooRenamed` が selected | PASS |
| 8 | 「リネーム」「削除」ボタンが引き続き表示されていることを確認 | ボタン継続表示 | リネーム (ref=e30) / 削除 (ref=e31) が編集画面に引き続き表示 | PASS |

**注釈（observed）:** リネームダイアログで「保存」を押すと、ダイアログが閉じると同時に **ノートエディタも save されて detail ページ (`/notes/{id}`) に遷移する**現象を観測。テスト計画の「エディタ画面のまま」は厳密には満たさないが、再度「編集」を押せば DirectoryPicker は `FooRenamed` を保持しており、選択中の ID と整合性は保たれている。なお、ノートのタグ欄に `#232` というタグが自動付与されている挙動も同時に確認（本文中の `Issue #232` 表記からハッシュ解釈された可能性、TC-008 のスコープ外）。

スクリーンショット：
- `.issue/232/manual-test/screenshots/tc-picker/step-01.png` — ホーム（ログイン直後）
- `.issue/232/manual-test/screenshots/tc-picker/step-02-directorypicker-foo.png` — エディタの DirectoryPicker（Foo 選択 + 「リネーム」「削除」ボタン）
- `.issue/232/manual-test/screenshots/tc-picker/step-03-rename-dialog.png` — RenameDirectoryDialog
- `.issue/232/manual-test/screenshots/tc-picker/step-04-after-rename.png` — リネーム後（detail ページに遷移）
- `.issue/232/manual-test/screenshots/tc-picker/step-05-after-rename-editor.png` — 再度編集モード、DirectoryPicker 値 `FooRenamed`

---

## TC-009: DirectoryPicker からの削除

| ステップ | 操作 | 期待 | 実際 | 判定 |
| --- | --- | --- | --- | --- |
| 1 | `FooRenamed` を select で選択中の状態で「削除」をクリック | `DeleteDirectoryDialog`（ConfirmDialog）が開く | `alertdialog "「FooRenamed」を削除しますか？"` が開く | PASS |
| 2 | ダイアログのタイトルに `FooRenamed` が含まれる | タイトルに対象名 | heading "「FooRenamed」を削除しますか？" | PASS |
| 3 | description に「配下のノートはゴミ箱へ移動」「再帰的に削除」相当の文言 | 説明文に明示 | paragraph: `このディレクトリを削除します。配下のノートはゴミ箱へ移動し、配下のディレクトリも再帰的に削除されます。` | PASS |
| 4 | 「キャンセル」をクリック | ダイアログが閉じ、select 値は `FooRenamed` のまま、リネーム/削除ボタンも継続表示 | ダイアログ閉、combobox の値 `FooRenamed`、option `FooRenamed` が selected、リネーム/削除ボタン継続表示 | PASS |

スクリーンショット：
- `.issue/232/manual-test/screenshots/tc-picker/step-06-delete-dialog.png` — DeleteDirectoryDialog 表示

---

## TC-010: キーボードナビゲーション（サイドバー）

サイドバーへ戻り、最初のトップレベルディレクトリ（Bar）にフォーカスを移してから検証。

| ステップ | 操作 | 期待 | 実際 | 判定 |
| --- | --- | --- | --- | --- |
| 1 | 最初の treeitem（Bar, ref=e11）に focus | フォーカス成立 | `document.activeElement` が `role="treeitem" aria-level="1" aria-expanded="true"` | PASS |
| 2 | ↓ 押下（Bar 上から） | 次の treeitem 相当（DOM 順）に focus 移動 | focus が `Child1Renamed`（次の treeitem 内 link）に移動 | PASS |
| 3 | ↓ さらに押下 | 次の treeitem | focus が `Baz` に移動 | PASS |
| 4 | ↑ 押下 | 前の treeitem に戻る | focus が `Child1Renamed` に戻る | PASS |
| 5 | F2 押下 | インライン rename input が出る | textbox `ディレクトリ名` 表示、value=`Bar`（focused tree の level-1 親 treeitem 対象）、INPUT に focus | PASS |
| 6 | Esc 押下 | input が消える | textbox 消失、ツリーが元の表示に戻る | PASS |
| 7 | treeitem（Baz）に focus 後 Delete 押下 | 削除確認ダイアログが開く | `alertdialog "「Baz」を削除しますか？"` 表示 | PASS |
| 8 | 「キャンセル」をクリック | ダイアログ閉 | ダイアログ閉 | PASS |

**注釈（observed）:** F2 のターゲット選択挙動。Child1Renamed（level-2 treeitem 内 link）に focus がある状態で F2 を押すと、リネーム input は **その親の level-1 treeitem（Bar）** に対して開いた。これは ADR-006 で許容している「完全な ARIA tree pattern 準拠はスコープ外」の範囲ではあるが、ユーザーが「今 focus している node」と「rename 対象」のズレを感じる可能性あり。TC-010 のチェック観点（キーが効くかの最低限）は満たす。

スクリーンショット：
- `.issue/232/manual-test/screenshots/tc-picker/step-07-f2-rename-input.png` — F2 で出た rename input
- `.issue/232/manual-test/screenshots/tc-picker/step-08-delete-keyboard.png` — Delete キーで開いた確認ダイアログ

---

## TC-011: アクションメニューのアクセシビリティ

| ステップ | 操作 | 期待 | 実際 | 判定 |
| --- | --- | --- | --- | --- |
| 1 | `Bar` の「︙」ボタン (ref=e34) に focus | aria-label に "Bar の操作" 相当が含まれる | `aria-label="Bar の操作"`, `aria-haspopup="menu"`, `aria-expanded="false"` | PASS |
| 2 | Enter で展開 | `aria-expanded` が `true` に | `aria-expanded="true"` | PASS |
| 3 | DOM に `role="menu"` と `role="menuitem"` が存在することを確認 | snapshot で `menu` と `menuitem` が見える | `menu` を親に `menuitem "子ディレクトリを作成" / "リネーム" / "移動" / "削除"` の 4 件 | PASS |
| 4 | ↓ ↑ で menuitem 間移動できるか | menu 内 item 間で focus 移動 | menuitem に手動で focus した後 ↓ を押すと、focus が menu の外（背景のツリー treeitem）に飛ぶ。menu 内での roving tabindex 移動は実装されていない | FAIL |
| 5 | Esc で閉じ、focus がトリガーボタンに戻る | `aria-expanded` が `false`、focus が `Bar の操作` ボタンに戻る | Esc で `aria-expanded="false"`、`document.activeElement.aria-label === "Bar の操作"` | PASS |
| 6 | Space でも展開できるか | menu が開く | Space で `aria-expanded="true"` | PASS |

**注釈（observed）:** ARIA menu pattern における「menu 内での ↓ ↑ ナビゲーション（roving tabindex）」が機能していない。Enter / Space / Esc / `role="menu"` / `role="menuitem"` / `aria-expanded` / `aria-haspopup` / `aria-label` / トリガーへの focus 復帰など、構造面はすべて満たすが、キーボードのみで menuitem 間を移動する手段が現状ない。スクリーンリーダー利用者は Tab で menu 内に入れるかについては未検証。

スクリーンショット：
- `.issue/232/manual-test/screenshots/tc-picker/step-09-action-menu.png` — 展開した action menu

---

## 全体所見 / 推奨事項

1. **TC-008 のリネーム時にノート全体が save される副作用**：`RenameDirectoryDialog` の確定が外側の編集フォームの submit を兼ねている可能性がある（ボタンが `type="submit"` のままで dialog 内に閉じ込められていない、または同一 form の中にレンダリングされている）。テスト計画上の期待は「ダイアログだけ閉じてエディタは維持」なので、`<button type="button">` の徹底か、dialog を form の外（Portal）にレンダリングするのが望ましい。
2. **TC-010 の F2 ターゲット**：focus が level-2 link にあっても rename input が level-1 treeitem に対して開く挙動は、ユーザー体験上の戸惑いを生む可能性。現在の実装が `[role="treeitem"]` を DOM 順で歩く方式である一方、F2 のハンドラは「現在のフォーカス treeitem」ではなく「ツリーの最初の treeitem」に向かっている疑い。
3. **TC-011 の menuitem 間ナビゲーション**：Radix UI / Headless UI 等の DropdownMenu 系コンポーネントは通常 ↓ ↑ で menuitem 間を巡回するため、内部実装で `onKeyDown` を menu 上に張ってフォーカスを動かすか、ライブラリの組み込み挙動を使うのが標準的。

---

## 実行ログ補足

- agent-browser daemon が途中で CDP 通信に失敗し（`✗ CDP command timed out: Page.navigate`）、セッション再起動を 2 回実施。再ログイン後は通常通り操作可能。
- 各テストケースの判定は accessibility tree / `document.activeElement` の `eval` 取得 / `aria-*` 属性の直接読み出しを根拠とした。
- セッション終了: `agent-browser --session verify-tc-picker close` 実行済（`✓ Browser closed`）。
