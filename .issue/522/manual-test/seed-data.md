# シードデータ

## アカウント
- メール: `dev-admin@example.com` / role: admin / active
- パスワードなし。固定セッショントークン `dev-admin-session-token` を投入。
- ログイン: Cookie `__Host-session=dev-admin-session-token`（Secure 必須 → CDP 経由で注入）

## テスト用ノート
- note id: `01950000-0000-7000-8000-0000000005a2`
- タイトル: `[#522] WYSIWYG 余白・フォーカス検証用ノート`
- slug: `i522-wysiwyg-margin-test`
- 本文: 先頭 `<h2>` → `<p>`×2 → `<ul>`×3 → `<h3>` → 末尾 `<p>`（先頭見出し/段落/末尾余白を1ノートで検証可）
- 編集URL: `/notes/01950000-0000-7000-8000-0000000005a2/edit`

## モード切替
- エディター上部 `EditorModeSwitch` で「WYSIWYG」=ビジュアル編集 / 「インライン編集」タブ。

## 実行コマンド
- `pnpm db:migrate`（適用済み）
- `pnpm seed:dev-admin`
- `pnpm db:execute:local`（テストノート投入）
