# TC-UI-001: UI 回帰チェック (Issue #57)

**実施日時:** 2026-05-21
**対象:** http://localhost:3000/
**ブラウザ:** agent-browser 0.27.0 / session `verify-tc-ui-001`
**結果:** PASS

## 目的

Issue #57 (queue consumer 配線) のコード変更は Worker handlers / DI / dispatch 純粋関数のみで
フロントエンド UI は一切変更されていない。よって UI 側に回帰が生じていないことを確認する。

queue consumer は `pnpm dev` では起動しないため (independent worker)、本テストではジョブ自動消化や
retry の dispatch 結果は確認できない。それらは integration test で担保されている前提で、本TCでは
UI の表示・操作・認証ゲートの 3 点に絞って回帰チェックを行う。

## 手順と結果

### Step 1: トップ画面の表示確認

- URL: `http://localhost:3000/` → 307 リダイレクト → `?page=1&limit=20` に到達
- ページタイトル: `TanStack Start Template`
- アクセシビリティツリー: banner / main / contentinfo 構造が正常
- 主要要素を確認:
  - ヘッダーロゴ「Hollow」
  - ナビゲーション「機能」「ログイン」「アカウント作成」
  - ヒーロー見出し「散らかった頭の中に、静かな置き場所を」
  - 「WHY HOLLOW」セクション、4 つの記事カード（アップロード/メタデータ管理/公開・限定共有/エクスポート）
  - フッター（プロダクト / インスタンス / 法的事項 リンク、© 2026 Hollow）
- スクリーンショット: `screenshots/tc-ui-001/step-01-root.png`
- 結果: PASS

### Step 2: ログイン画面表示

- ヘッダーの「ログイン」リンク (e5) をクリック → `/login` に遷移
- ページ見出し「ログイン」 / 説明文「おかえりなさい。続きから始めましょう。」
- フォーム要素を確認:
  - メールアドレス textbox (required)
  - パスワード textbox (required)
  - 「パスワードを忘れた方」リンク
  - 「ログイン情報を保存する」チェックボックス
  - 「ログイン」ボタン
  - 「アカウントを作成」リンク
- スクリーンショット: `screenshots/tc-ui-001/step-02-login.png`
- 結果: PASS

### Step 3: ログインフォーム操作性

- メールアドレス textbox (e5) に focus → `test@example.com` を type
- 入力欄が正常に受け付ける（エラーなし）
- スクリーンショット: `screenshots/tc-ui-001/step-03-login-typed.png`
- 結果: PASS

### Step 4: サインアップ画面表示

- 直接 `http://localhost:3000/signup` に navigate
- ページ見出し「アカウント作成」
- フォーム要素を確認:
  - ユーザー名 textbox (required) + ヘルプテキスト「英数字とハイフン。後から変更できません。」
  - メールアドレス textbox (required)
  - パスワード textbox (required) + ヘルプテキスト「8文字以上。…」
  - 表示名 textbox (任意)
  - 利用規約同意チェックボックス（利用規約 / プライバシーポリシー リンク付き）
  - 「アカウントを作成」ボタン
  - 「ログイン」リンク
- スクリーンショット: `screenshots/tc-ui-001/step-04-signup.png`
- 結果: PASS

### Step 5: 管理画面の認証ゲート

- 未認証で `http://localhost:3000/admin/jobs` に navigate
- ページ見出し「アクセスできません」 / 説明「エラーが発生しました」
- 「ホームへ戻る」リンクが表示される
- ヘッダーに「管理者モード」表示
- ブラウザコンソールに `ForbiddenError: Admin access required` が記録 → 認証ゲートが期待通り発火
- スクリーンショット: `screenshots/tc-ui-001/step-05-admin-jobs.png`
- 結果: PASS（認証ゲートが効いている）

### Step 6: コンソール JS エラー確認

`agent-browser console` でログを取得。検出されたエラーは以下のみ:

- `ForbiddenError: Admin access required` (×4) — Step 5 の `/admin/jobs` ゲート発火による期待エラー
- `Warning: Error in route match: /admin/admin` — 上記に付随するルートマッチ警告（既存挙動）

トップ画面 / ログイン / サインアップ画面で予期せぬ JS エラーは検出されず。

`[vite] connecting...` / `[vite] connected.` / React DevTools 案内は dev サーバー由来の通常ログ。

## 総合結果

PASS

- UI が起動し、トップ / ログイン / サインアップが正常レンダリング
- 認証ゲートが管理画面で機能している (Forbidden が発火)
- フロントエンドに崩れ・予期せぬ JS エラーなし
- Issue #57 のコード変更（Worker handlers / DI / dispatch）に起因する UI 回帰は観測されない
