# シードデータ — Issue #285 manual-test

## テストユーザー
- existing@example.com / Password123!（local D1 シード済み・ログイン機能確認済み）

## 作成したノート
- タイトル: Issue285 検証用コードブロック
- URL: http://localhost:3005/notes/019e953b-4922-713e-94b5-8dc5dfc2adac
- 本文（HTML モードで入力）:
  ```html
  <p>サンプル段落です。</p>
  <pre><code>function hello() {
    return "world";
  }</code></pre>
  <p>末尾の段落です。</p>
  ```
- 読み取り専用ビューでコードブロックが正しく表示されることを確認済み（screenshots/seed-note.png）

## 既知の注意（agent-browser）
- agent-browser の `click @ref` / `find role tab` が React の onClick まで届かないことがある（モード切替タブ・保存ボタンで発生）。
- 回避策: `agent-browser --session {s} eval` で対象要素の `.click()` を直接呼ぶと発火する。
- ただしテキスト編集（contentEditable への入力）自体は通常の操作で機能する。
