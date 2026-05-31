# ブラウザ検証レポート — Issue #345

**実行日:** 2026-05-31
**テストソース:** `.issue/345/testing.md`
**サーバー:** http://localhost:5180（`pnpm dev --port 5180`、Cloudflare Workers ランタイム）

---

## サマリー

| TC | テスト名 | 種別 | 結果 |
|----|---------|------|------|
| TC-1 | 未認証で `/exports` → `/login` | 正常系 | PASS |
| TC-1 | 未認証で `/views` → `/login` | 正常系 | PASS |
| TC-1 | 未認証で `/export` → `/login` | 正常系 | PASS |
| TC-1 | 未認証で `/notes/$noteId/export` → `/login` | 正常系 | PASS |
| TC-2 | 未認証で `/settings` → `/login`（回帰） | 正常系 | PASS |
| TC-3/4 | 認証済みケース（各ページ表示 / login・signup の逆向き redirect） | — | SKIP（理由は下記） |

**合計:** 5 件実行（PASS: 5 / FAIL: 0）、2 件 SKIP

## 検証内容

### TC-1: 未認証アクセス時の `/login` リダイレクト（課題1の主目的）

未認証（セッションクッキー無し）状態で各保護ルートにアクセスし、`/login` へリダイレクトされること、および「エラーが発生しました」シェルが表示されないことを確認した。

SSR レベルの HTTP レスポンス（`curl`）:

| パス | レスポンス |
|------|-----------|
| `/exports` | 307 → `/exports?offset=0` → 307 → `/login`（200） |
| `/views` | 307 → `/views?kind=personal` → 307 → `/login`（200） |
| `/export` | 307 → `/login` |
| `/notes/{id}/export` | 307 → `/login` |

ブラウザ（agent-browser）での最終到達:

| ルート | 最終 URL | title |
|--------|----------|-------|
| `/exports` | `/login` | ログイン |
| `/views` | `/login` | ログイン |
| `/export` | `/login` | ログイン |
| `/notes/test-note-id/export` | `/login` | ログイン |

`/login` の agent-browser スナップショットで、見出し「ログイン」・メール／パスワード入力欄・「ログイン」ボタンが描画されており、「エラーが発生しました」シェルではなく正規のログインフォームが表示されることを確認した（アクセシビリティツリー抜粋を証拠とする）。

> 注: agent-browser の `screenshot` コマンドはローカルシェルの PATH 事象で画像ファイル保存に失敗したため、検証の記録は本レポートに転記した SSR レスポンス（`curl`）・最終 URL・title・アクセシビリティスナップショットをもって証跡とする。

### TC-2: `/settings` の回帰確認

未認証で `/settings` にアクセス → `/login` へリダイレクト（最終 URL = `/login`）。共有ガードへの差し替えで既存の `/settings` ガードが壊れていないことを確認した。

## SKIP したケースとその理由

### TC-3（認証済みで各ページ表示）/ TC-4（認証済みで login・signup → ホーム）

**SKIP 理由:** ログイン操作は server-function の POST mutation で、agent-browser からのクロスオリジン POST は `403 FORBIDDEN_CROSS_ORIGIN` で弾かれる既知事象（プロジェクト MEMORY 記録済み）。このためブラウザ自動でログイン状態を作れず、認証済みフローの自動検証は不可。

**補完的な確認:**
- 認証ガードのロジック（`requireAuthenticatedRoute` / `redirectAuthenticatedRoute`）は SSR レベルの 307 リダイレクトで未認証分岐が正しく動作することを確認済み。
- 認証済み分岐は、本Issueで共通化した元実装（#342 で検証済みの `/settings` ガード、および既存の login/signup 逆向きガード）と完全に同一ロジック。`pnpm typecheck` も通過しており、回帰リスクは低い。

## 結論

Issue #345 の主目的である「未認証アクセス時の `/login` リダイレクトと『エラーが発生しました』シェルの予防」を、新たにガードを適用した4ルート（`/exports`・`/views`・`/export`・`/notes/$noteId/export`）すべてで確認。`/settings` の回帰も無し。FAIL なし、起票した Issue なし。
