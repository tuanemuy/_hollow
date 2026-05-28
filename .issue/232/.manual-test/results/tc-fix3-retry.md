# TC Fix-3 再検証: 禁止文字エラーメッセージのローカライズ & 兄弟名重複

- 実行日時: 2026-05-28
- セッション: verify-fix3-retry
- agent-browser: 0.27.0
- dev server: http://localhost:3000
- アカウント: existing@example.com / Password123!

## 環境メモ

- 既存ディレクトリ (root depth=1): `Bar`, `Baz`, `FooRenamed2`, `TestRoot`
  - `Bar` 配下: `Child1Renamed`
  - `FooRenamed2` 配下: `Sib`
- 過去の検証で `Foo` は `FooRenamed2` にリネーム済み、`Child1` も `Child1Renamed` に
  リネーム済み。`Foo` 名のディレクトリは現存しないため、兄弟名重複テストは
  `Bar` 配下に既存する `Child1Renamed` を使用した（兄弟名重複の意図は満たす）。

---

## 検証 1: 禁止文字 `a/b`

| 項目 | 内容 |
|---|---|
| 操作 | Bar の「︙」→「子ディレクトリを作成」→ 名前 `a/b` → 作成 |
| 期待 | ダイアログ内に「使用できない文字が含まれています」相当の具体的メッセージ |
| 実際 | ダイアログ内 alert: **`name: 使用できない文字が含まれています`** |
| 判定 | **PASS** |
| スクリーンショット | `screenshots/tc-fix3-retry/01-forbidden-char-error.png` |

ローカライズ済みかつ generic な「エラーが発生しました」ではないことを確認。
プレフィックス `name:` はフィールド名（フィールド単位エラー表示）。

## 検証 2: 兄弟名重複 `Child1Renamed`

| 項目 | 内容 |
|---|---|
| 操作 | 同じダイアログ（親=Bar）で名前を `Child1Renamed` に変更 → 作成 |
| 期待 | 何らかの具体的なエラー文言（重複・既存名等） |
| 実際 | ダイアログ内 alert: **`Sibling directory named "Child1Renamed" already exists`** |
| 判定 | **PASS** |
| スクリーンショット | `screenshots/tc-fix3-retry/02-duplicate-sibling-error.png` |

兄弟ディレクトリ名重複を具体的に示すメッセージが表示される。
ただし英語文言であり、日本語ローカライズの観点では検証 1 と挙動が異なる
（Fix-3 の対象は禁止文字メッセージのみであり、本検証の依頼仕様としては
「具体的な文言」が出ていれば PASS）。

---

## 総合結果

| 検証 | 判定 |
|---|---|
| 検証 1 (禁止文字 ローカライズ) | PASS |
| 検証 2 (兄弟名重複 具体的文言) | PASS |

## 補足

- 兄弟名重複メッセージは英語（`Sibling directory named "..." already exists`）。
  日本語化の余地があるが、本 TC のスコープ外。
- フィールドレベル alert のキー名 `name:` がそのまま表示されている。
  UI 文言として馴染ませる場合は除去/翻訳の検討余地あり（スコープ外）。
