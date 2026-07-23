# TC-2（確認項目2 / TC-007 相当）— 複数ブロック編集後の空セル入力で先行編集が消えず上書き保存もされない

- **対応 AC:** AC-3
- **対象ノート:** ノートB（ID `019f799f-27ac-7729-9620-2f4b058d7e48`, URL `http://localhost:8787/notes/019f799f-27ac-7729-9620-2f4b058d7e48`）
- **実行日:** 2026-07-19
- **実行環境:** wrangler dev（`http://localhost:8787`）/ agent-browser 0.32.0 セッション `verify-tc-noteb`

## 結果: PASS

先行編集（追記A / 追記B）は空セルへの X 入力後も DOM から消えず、後続の Y 入力・自動保存・再読み込みを経ても「初期本文+入力」への巻き戻り（サイレント上書き）は発生しなかった。

## 実行ログ

| # | 手順 | 操作 | 観測結果 | 判定 |
|---|------|------|----------|------|
| 1 | ノートBをビジュアルタブで開く | `/notes/{id}/edit` を開く。ビジュアル(inline)がデフォルト選択 | 5 ブロック（p 段落A / p 段落B / pre / p空 / td空）が各々 `contenteditable=true` で表示 | PASS |
| 2 | 段落A末尾に `追記A` 入力→自動保存待ち | caret を段落A末尾に置き `追記A` を非IME入力 | `<p contenteditable="true">段落A追記A</p>`、巻き戻りなし。「保存しました」表示 | PASS |
| 3 | 段落B末尾に `追記B` 入力→自動保存待ち | 同様に `追記B` 入力 | `<p contenteditable="true">段落B追記B</p>`、巻き戻りなし。「保存しました」表示 | PASS |
| 4 | 空 `<td><br></td>` にキャレット→`X` 1文字入力 | td を focus し末尾 caret で `X` 入力 | `<td contenteditable="true">X</td>`（placeholder `<br>` は消え X 定着） | PASS |
| 5 | rollback 発動時の DOM 確認 | 全ブロック outerHTML を取得 | 段落A追記A / 段落B追記B が**そのまま保持**。全体巻き戻りは起きていない | PASS |
| 6 | 空 `<p><br></p>` へ `Y` 入力→自動保存発火 | 空段落を focus し `Y` 入力 | `<p contenteditable="true">Y</p>`、他ブロック保持。「保存しました」表示 | PASS |
| 7 | 読み取りビュー＋再読み込みで保存内容確認 | `/edit` 再読み込み・読み取りビュー・HTMLタブを確認 | 下記「保存内容」の通り全編集が永続。上書きなし | PASS |

### 手順5 直後の DOM（全ブロック）

```
<p contenteditable="true">段落A追記A</p>
<p contenteditable="true">段落B追記B</p>
<pre contenteditable="true"><code>const x = 1;</code></pre>
<p contenteditable="true"><br></p>
<td contenteditable="true">X</td>
```

### 保存内容（再読み込み後の HTML タブ = 永続化された contentHtml）

```html
<p>段落A追記A</p>
<p>段落B追記B</p>
<pre><code>const x = 1;</code></pre>
<p>Y</p>
<table>
  <tbody>
    <tr>
      <td>X</td>
    </tr>
  </tbody>
</table>
```

### 読み取りビュー本文

```
段落A追記A / 段落B追記B / const x = 1; / Y / X
```

## 期待結果との対照

- 手順5で 追記A・追記B が DOM から消えない → **達成**（初回 rebuild snapshot までの全体巻き戻りなし）
- 手順6〜7 後続保存で 追記A/追記B が保存内容に含まれ「初期本文+Y」に上書きされない → **達成**（再読み込み・読み取りビュー双方で確認）
- table/tbody/tr/セル構造は壊れない → **達成**（HTMLタブでも `<table><tbody><tr><td>X</td>` 正常）
- `contenteditable` は保存 HTML に漏れない → **達成**

修正前の 2 段の実害（先行編集の DOM 消失・巻き戻り前本文での上書き保存）はいずれも解消されている。
</content>
</invoke>
