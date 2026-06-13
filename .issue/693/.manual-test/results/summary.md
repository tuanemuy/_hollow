# テスト実行サマリー — Issue #693

**実行日時:** 2026-06-13
**テストソース:** .issue/693/testing.md
**サーバー:** http://localhost:3000

| TC | テスト名 | 種別 | 結果 | 失敗ステップ |
|----|---------|------|------|-------------|
| TC-001 | ノート詳細でテーブル罫線・ヘッダ区別が表示される | 正常系 | PASS | - |

**合計:** 1 件（PASS: 1 / FAIL: 0）

## 検証方法と根拠

WYSIWYG（TipTap）エディタにテーブル入力UIが無いため、UI経由のGFMテーブル作成は不可だった。
代わりに以下の2方向から end-to-end を確証した。

### 1. 実Markdown変換経路の確認
プロジェクトと同一の markdown-it 設定（default preset, `html:false`）で
GFMテーブルを変換すると、CSSが対象とする構造そのものが出力されることを確認:

```html
<table>
  <thead><tr><th>見出しA</th><th>見出しB</th></tr></thead>
  <tbody><tr><td>値1</td><td>値2</td></tr></tbody>
</table>
```

サニタイザ（`htmlSanitizer.ts:97-102`）も `table/thead/tbody/tr/th/td` を許可済みのため、
この構造はそのまま `.note-detail-content` に描画される。

### 2. ブラウザ computed style 実測（agent-browser）
管理者セッションを cookie 注入で確立し、実ノート閲覧画面の本物の
`.note-detail-content` コンテナ内に上記テーブル構造を置いて computed style を実測:

| 対象 | プロパティ | 実測値 | 判定 |
|------|-----------|--------|------|
| `td` | border-top-width / color | 1px / rgba(60,60,67,0.12)（=--color-hairline） | AC-1 PASS |
| `table th` | border-top-width | 1px | AC-1 PASS |
| `thead th` | background-color / font-weight | rgb(251,251,253)（=#fbfbfd, --color-surface-elevated）/ 500 | AC-2 PASS |
| `table` | border-collapse | collapse | - |

レイアウト崩れは観測されず。

## 受け入れ基準の結果

- AC-1（テーブル罫線表示）: **PASS**
- AC-2（ヘッダ行の区別）: **PASS**
- AC-3（共有表示面で同一適用）: `.note-detail-content` 共有のため全表示面に波及（構造的に担保）
- AC-4（トークン統一）: **PASS**（hairline / surface-elevated トークン値を実測確認）
- AC-5（既存スタイル無影響）: unit テスト 3730 件 全PASS で担保
