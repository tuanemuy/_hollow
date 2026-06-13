# TC-dir

ディレクトリ行の単一 pill ＋ツリードロップダウン（AC-4）

**結果**: PASS

検証対象: 編集画面 main > form 内の「ディレクトリ」ラベル隣の単一 pill ボタン
URL: http://localhost:3000/notes/01950622-0000-7000-8000-000000000001/edit

## 実行ログ

| # | ステップ | 期待 | 結果 | 観測 |
|---|----------|------|------|------|
| 1 | 単一 pill トリガー | ラベル+単一 pill（フォルダ＋パス＋キャレット, expanded=false）、旧UI(select+input)でない | PASS | `button "/" [expanded=false]`。旧2フィールドUIなし |
| 2 | ドロップダウン展開 | 検索 input・listbox(option)・「新規ディレクトリを作成…」表示 | PASS | pill が expanded=true に。`dialog "ディレクトリ"` 内に combobox（placeholder「ディレクトリ名で検索…」）、`listbox`、`option "新規ディレクトリを作成…"` |
| 3 | 検索フィルタ＋祖先自動展開 | `書籍` で「書籍要約」が候補表示（親 Research 自動展開） | PASS | 検索後 listbox に Research(展開済)＋書籍要約 option が出現 |
| 4 | キーボード操作 | ArrowDown でハイライト移動、Enter で選択＆pill更新 | PASS | ArrowDown×2 で aria-activedescendant が書籍要約 option(data-active=true)へ移動。Enter で dialog 閉じ、pill が `/Research/書籍要約` に更新 |
| 5 | クリック選択 | option クリックで選択＆pill更新 | PASS | 「テストディレクトリ」option クリックで dialog 閉じ pill が `/テストディレクトリ` に更新 |
| 6 | 新規作成導線 | 「新規ディレクトリを作成…」→ インライン入力 → `TC-new-dir-689` 入力 Enter → pill更新 | PASS | インライン input（placeholder「新しいディレクトリ名」）出現。入力＆Enter で pill が `新規: TC-new-dir-689` に更新（保存はせず） |
| 7 | 外側クリック/Escape で閉じる | ドロップダウンが閉じる | PASS | Escape で dialog 閉鎖を確認。外側 mousedown でも閉鎖を確認 |

## 判定

単一 pill ＋検索・ツリー・キーボード・クリック選択・新規作成導線・閉じる が全て機能。旧UI（select + 新規名 input の2フィールド常時表示）は存在しない。**PASS**
