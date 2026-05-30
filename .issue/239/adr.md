# ADR — Issue #239: UI にログアウト導線を追加

## ADR-001: ログアウト後のリダイレクトをクライアント側で行う

### Status
Proposed

### Context
ログアウト server function（`logOutFn`）でセッションを破棄した後、ユーザーを `/login` に遷移させる必要がある。選択肢は2つ:

- (A) server function ハンドラ内で `throw redirect({ to: "/login" })` してサーバー主導でリダイレクトする
- (B) server function は cookie クリアのみ行い、呼び出し側クライアントで `router.invalidate()` → `router.navigate({ to: "/login" })` する

### Decision
(B) を採用する。`LoginForm`（`app/components/auth/LoginForm/index.tsx`）が確立しているパターン — server function で cookie を設定し、クライアントで `router.invalidate()` してから `navigate` する — と対称にする。

### Consequences
- 良い点: `router.invalidate()` が `_app` レイアウトの loader（`userDto` をキャッシュしている）を確実に破棄し、遷移後に未認証状態が正しく反映される。ログイン処理との対称性でコードの一貫性が保たれる。`useTransition` / `isPending` でボタンの多重送信制御もクライアント側に集約できる。
- トレードオフ: JS 無効環境ではログアウトが完結しない。ただし本アプリは TanStack Start の RSC + クライアントインタラクション前提で、ログインも同様にクライアント遷移に依存しているため、新たな制約にはならない。

---

## ADR-002: 「設定」メニュー項目の遷移方式

### Status
Proposed

### Context
ドロップダウン内の「設定」項目から `/settings` へ遷移させる。メニューは roving tabindex（`tabIndex` を1項目だけ `0`、他は `-1`）の WAI-ARIA メニューパターンで実装する。`<Link>` をそのまま `role="menuitem"` にすると、リンクのデフォルト focus 挙動と roving tabindex の制御が競合しうる。

### Decision
「設定」項目も「ログアウト」項目と同じく `<button role="menuitem">` とし、`onClick` で `router.navigate({ to: "/settings" })` を呼ぶ。`DirectoryActionsMenu` の `runAndClose` パターン（trigger に focus を戻してから閉じる）を踏襲し、メニューを閉じてから遷移する。

### Consequences
- 良い点: メニュー項目がすべて `<button role="menuitem">` で統一され、roving tabindex とキーボードナビゲーションが一貫する。`DirectoryActionsMenu` のパターンをそのまま再利用できる。
- トレードオフ: `<a href>` ではないため、右クリックで「新しいタブで開く」やホバー時の URL プレビューはできない。設定画面への動線としては許容範囲（メニュー内の操作項目という位置づけ）。将来汎用 Popover プリミティブを抽出する際に再検討する。
