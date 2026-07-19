# TC-7（確認項目7 / AC-7 回帰）— `<pre>` ハイライトが従来どおり動き rollback 復元後も平文

- **対応 AC:** AC-7
- **対象ノート:** ノートB（ID `019f799f-27ac-7729-9620-2f4b058d7e48`）
- **実行日:** 2026-07-19
- **実行環境:** wrangler dev（`http://localhost:8787`）/ agent-browser 0.32.0 セッション `verify-tc-noteb`

## 結果: PASS

`<pre>` のシンタックスハイライトは表示・再適用ともに従来どおり動作し、編集中は平文・focusout で再ハイライト、保存 HTML はハイライト span / `contenteditable` を漏らさず平文で永続する。

## 重要な観測（テスト本文の言語クラスに関する補足）

testing.md 指定のノートB本文は `<pre><code>const x = 1;</code></pre>`（言語クラスなし）。ハイライタ実装 `app/components/note/content/highlighter.ts:223` は `resolveLang` が `plaintext` を返す場合（＝`class="language-*"` が無い場合）に**早期 return してハイライトを適用しない**仕様のため、指定本文のままではハイライト span は付かない（＝これは正しい挙動であり回帰ではない）。ハイライト経路そのものを実効的に検証するため、`<code class="language-js">` を付与した補助ケースでハイライト表示・再適用・平文化を確認した。

## 実行ログ

| # | 手順 | 操作 | 観測結果 | 判定 |
|---|------|------|----------|------|
| 1a | 指定本文 `<pre><code>const x = 1;</code></pre>` をビジュアルで表示 | 編集面を開く | span なし（plaintext のため：仕様どおりハイライト非適用） | PASS（仕様） |
| 1b | `language-js` 付与でハイライト表示確認（補助） | HTMLモードで `class="language-js"` 付与・保存→ビジュアル再オープン | 読み取りビュー・編集面ともに `shiki-token-keyword` / `shiki-token-number` span を注入（span=6）。ハイライト表示 OK | PASS |
| 2a | `<pre>` 内コードを編集（文字追加） | code 末尾に ` const z=3;` を入力 | 編集中は span=0（平文で編集：highlight-on-blur 設計どおり）、text 更新 | PASS |
| 2b | ハイライト再適用の確認 | 別ブロックへ focus 移動（focusout） | span=9 に再注入、text=`const x = 1; let y=2; const z=3;` 保持。「保存しました」 | PASS |
| 3 | `<pre>` 編集後に別ブロックで rollback をトリガー→`<pre>` 復元状態確認 | 確認項目5（`<strong>` 削除）で rollback を踏ませて `<pre>` を確認 | `<pre>` は span を含まない平文で復元（rollback 復元後の平文性 OK） | PASS |
| 4 | 保存 HTML に `<span>`/`contenteditable` が無いこと | HTMLタブの serialize 値を検査 | `<pre><code class="language-js">const x = 1; let y=2; const z=3;</code></pre>`、hasSpan=false / hasCE=false | PASS |

### 編集中→focusout の再ハイライト（span 数遷移）

```
編集中(focus)  : spanCount=0  text="const x = 1; let y=2; const z=3;"
focusout 後    : spanCount=9  text="const x = 1; let y=2; const z=3;"
```

### 保存 HTML（serialize 値）

```html
<pre><code class="language-js">const x = 1; let y=2; const z=3;</code></pre>
```

hasSpan=false / hasCE=false（ハイライト span・`contenteditable` 漏出なし）。

## 期待結果との対照

- ハイライト表示・再適用が従来どおり動く → **達成**（language 付きで span 注入・focusout 再適用を確認）
- rollback 復元後の `<pre>` は span を含まない平文で復元される → **達成**
- 保存 HTML の `<pre>` は平文（`contenteditable`/ハイライト span 漏出なし）→ **達成**

snapshot が `<pre>` を平文で捕捉（ハイライト churn を基準へ折り込まない）していることを確認。#840 の snapshot 追従は `<pre>` の不透明性・平文 serialize を破壊していない。
</content>
