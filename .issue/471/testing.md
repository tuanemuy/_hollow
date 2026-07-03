# 動作確認計画 — Issue #471: /admin/users がローダーエラーで表示できない

**Issue:** #471
**作成日:** 2026-07-03

---

## 確認環境

本 Issue の対応は回帰テストの追加のみ（プロダクトコード変更なし）。確認は自動テストと、既存挙動の手動再確認で足りる。

### 自動テスト（本対応の主眼）

```bash
pnpm test:integration
```

新規追加した `D1UserRepository.listAll (integration, #471)` が green であること。

### 検証環境の起動（既存挙動の手動再確認・任意）

```bash
pnpm db:migrate      # ローカル D1 にスキーマ適用（未適用時のみ）
pnpm seed:dev-admin  # 決定論的 admin ユーザー＋セッションを投入（冪等）
pnpm dev             # vite dev（Cloudflare runtime）— http://localhost:3000
```

### デプロイ方法

なし（検証環境・自動テストで確認できる）。

## 確認項目

### 1. listAll 回帰テストが green

- **対応する受け入れ基準:** AC-2
- **目的:** `/admin/users` の描画元データ経路が多様な状態の行を throw せず正しく返すことを固定する
- **手順:**
  1. `pnpm test:integration` を実行する
- **期待結果:** `D1UserRepository.listAll (integration, #471)` の各ケースが PASS する
- **確認ポイント:** active / pending / suspended / deleted / admin / profile 非 null の各行がマップされ、cursor ページングと limit が効くこと

### 2. admin 認証済みで /admin/users が一覧表示される

- **対応する受け入れ基準:** AC-1
- **目的:** admin shell の errorComponent ではなくユーザー一覧が表示されることの再確認
- **手順:**
  1. 「検証環境の起動」を実施
  2. cookie を付けて SSR を確認（agent-browser は Secure cookie を document ナビに載せないため curl が確実）:
     ```bash
     curl -s -o /dev/null -w "%{http_code}\n" \
       -H "Cookie: __Host-session=dev-admin-session-token" \
       http://localhost:3000/admin/users
     ```
- **期待結果:** HTTP 200。本文に「ユーザー管理」とアカウント件数行が含まれ、「アクセスできません」は含まれない
- **確認ポイント:** `/admin` だけでなく `/admin/users` 単独の SSR で 200 が返ること

## エッジケース・異常系

### 1. 未認証時の認証ゲート

- **目的:** cookie 無しで `/admin/users` が保護されることを確認
- **手順:**
  1. `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/admin/users`
- **期待結果:** HTTP 500（loader が `ForbiddenError` を投げ errorComponent へ）。ユーザー一覧は描画されない

## 既存機能への影響確認

- プロダクトコードは変更しないため、既存挙動への影響はない。追加するのは integration テスト 1 ファイルへの `describe` ブロックのみ。
