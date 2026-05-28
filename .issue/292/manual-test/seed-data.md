# Seed data for Issue #292 manual test

**Issue:** #292 — ボタンの「テキストのみ／アイコンのみ／アイコン+ラベル」使い分けガイドライン
**作成日:** 2026-05-29
**サーバ:** `http://localhost:3000/` (`pnpm dev` 起動済み想定)
**DB:** ローカル D1 (`.wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite`) — マイグレーション適用済み

---

## サマリ

`testing.md` の UI 視覚確認は admin ロールでの利用が中心（admin/Jobs / admin/prompts / admin/design-tokens）。一部、member ロールでもアクセス可能なノート系画面（NoteActions, TrashList, BulkActionBar 等）の確認が必要。

過去の seed（#218 manual-test 由来）の baseline アカウントを流用する。新規作成は不要。

---

## 使用アカウント

### 1. admin（メイン）

| 項目 | 値 |
|---|---|
| label | admin-user |
| username | `admin-user` |
| email | `admin@example.com` |
| password | `Password123!` |
| role | `admin` |

用途:
- 確認3: admin/Jobs の「再実行」「再構築を実行」アイコン確認
- 確認6: admin/prompts, admin/design-tokens の「リセット」ダイアログ
- 確認2/4/5/6: 認証済み画面全般（ノート、ゴミ箱、ダイアログ等）

### 2. 非 admin（member ロール）

| 項目 | 値 |
|---|---|
| label | existing-user |
| username | `existing-user` |
| email | `existing@example.com` |
| password | `Password123!` |
| role | `member` |

用途: 必要に応じてアクセス制御や非adminから見える画面の確認に使用。本Issueでは optional。

---

## 既存データ

ローカル D1 には #218 以降の累積データが残存。ノート、タグ、ディレクトリ、保存済みビュー等の確認に必要なデータは admin-user 配下に既に存在することを想定。

不足する場合（ノート 0 件、ディレクトリ 0 件等）は、admin ログイン後に画面 UI から最小限のシードを行う:
- ノート: 「新規作成」→ 適当なタイトル
- タグ: ノート編集画面でタグ追加
- ディレクトリ: ディレクトリ作成 UI から

---

## 環境変数

`.dev.vars` は `.dev.vars.example` から複製済み。`SECRET_BOX_MASTER_KEY` などはローカル placeholder のまま動作する。
