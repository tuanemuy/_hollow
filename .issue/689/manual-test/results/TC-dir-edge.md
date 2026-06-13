# TC-dir-edge

検索ヒットゼロ（エッジ2）

**結果**: PASS

URL: http://localhost:3000/notes/01950622-0000-7000-8000-000000000001/edit

## 実行ログ

| # | ステップ | 期待 | 結果 | 観測 |
|---|----------|------|------|------|
| 1 | 検索ゼロヒット | `zzzznomatch999` 入力で候補ゼロ、listbox 破綻せず空状態、クラッシュなし | PASS | ディレクトリ候補は0件。listbox は存在し続け、「新規ディレクトリを作成…」項目のみ表示（検索語で新規作成できる導線）。dialog は開いたまま安定 |

## 詳細

- `dialogOpen: true`, `listboxPresent: true` — DOM 破綻なし
- options = `["新規ディレクトリを作成…"]` — ディレクトリ候補ゼロ、作成導線のみ残る適切な空状態
- `aria-activedescendant = _R_53db6H2_-0` が実在要素（「新規ディレクトリを作成…」）を参照。空 listbox への dangling reference なし
- エラー・クラッシュ発生せず

## 判定

検索ヒットゼロでもクラッシュせず、aria-activedescendant の宙吊り参照もなく、適切な空状態（作成導線のみ）になる。**PASS**
