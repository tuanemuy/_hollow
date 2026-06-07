# 動作確認計画 — Issue #560: 共有リンクのパスワード失敗カウンタが永続化されずロックアウトが発火しない

**Issue:** #560
**作成日:** 2026-06-07

---

## 確認環境

このIssueの変更を確認するために必要な手順のみ記載（プロジェクト全体のセットアップは省略）。

### 検証環境の起動

```bash
# ローカル D1 にマイグレーション適用（未適用の場合）
pnpm db:migrate

# パスワード付き共有リンクのシードを投入（#544 のシードを流用）
pnpm db:execute:local .issue/544/manual-test/seed.sql

# 開発サーバー起動（ローカル D1 / miniflare）
pnpm dev
```

seed.sql は token `test-share-passworded-0001`（パスワード平文 `test1234`）のパスワード付き有効リンクを含む。アクセス URL は `/share/test-share-passworded-0001`。

### デプロイ方法

なし（検証環境のローカル D1 で確認できる）。

## 確認項目

### 1. 誤パスワードで failed_attempts が increment される

- **目的:** 失敗カウンタが DB に永続化されることを確認する（本バグの核心）。
- **手順:**
  1. `/share/test-share-passworded-0001` を開く
  2. 誤ったパスワード（例 `wrong`）を1回送信する
  3. 以下で DB を確認:
     ```bash
     wrangler d1 execute hollow-local-d1 --local --command "SELECT failed_attempts, locked_until, version FROM share_links WHERE token_hash IS NOT NULL AND id = '01950000-0000-7000-8000-000000000030';"
     ```
- **期待結果:** `failed_attempts` が `1` に増えている（修正前は `0` のまま）。`version` も進む。画面はインラインエラー「パスワードが正しくありません。」。
- **確認ポイント:** 1回の誤送信ごとに `failed_attempts` が確実に +1 されること。

### 2. maxAttempts 到達でロックアウトが発火する

- **目的:** 5回到達で `locked_until` がセットされ、以降ロックアウトされることを確認する。
- **手順:**
  1. 同じリンクで誤パスワードを合計5回送信する
  2. DB を確認（上記 SELECT）→ `failed_attempts = 5`、`locked_until` に未来時刻がセットされている
  3. さらにもう1回（6回目）アクセス・送信する
- **期待結果:** 6回目は `share_link_locked`（ロックアウト警告 `role="status"` の案D アラート「試行回数の上限に達しました。しばらく時間をおいて再度お試しください。」）が表示される。
- **確認ポイント:** 5回目までは `share_link_password_invalid`（インラインエラー）、6回目でロックアウト警告に切り替わる境界。#544 で実装済みのロックアウト UI が初めて実機で観測できる。

### 3. 正パスワードで成功し、カウンタが reset される

- **目的:** 成功時に failed_attempts が 0 にリセットされ、アクセスできることを確認する。
- **手順:**
  1. （ロック前に）数回誤パスワードを送って `failed_attempts > 0` にする
  2. 正しいパスワード `test1234` を送信する
- **期待結果:** 公開ノート `/notes/public/01950000-0000-7000-8000-000000000020` へ遷移する。DB 上 `failed_attempts = 0`、`locked_until = NULL`、`last_accessed_at` が更新されている。
- **確認ポイント:** 成功パスの reset / recordAccess が従来どおり永続化されること（挙動が壊れていないこと）。

## エッジケース・異常系

### 1. 失効した共有リンク

- **目的:** revoked リンクで `share_link_revoked` が返り、カウンタ更新が走らないこと。
- **手順:** seed の失効リンク（token `test-share-revoked-0001` 等、seed.sql 参照）にアクセスする。
- **期待結果:** 失効エラーが表示される。`failed_attempts` は変化しない（save を積む前の早期 throw のため）。

## 既存機能への影響確認

- **共有リンクの正常閲覧（パスワードなし）:** パスワード無しの公開共有リンクが従来どおり開けること。
- **成功時のアクセス記録:** 正パスワード成功時に `last_accessed_at` が更新され、ノートが表示されること（確認項目3でカバー）。

## 確認チェックリスト

- [ ] 誤パスワード1回で `failed_attempts` が 1 に増える
- [ ] 誤パスワード5回で `failed_attempts = 5` かつ `locked_until` セット
- [ ] 6回目でロックアウト警告（案D / role="status"）が表示される
- [ ] 正パスワードで成功し `failed_attempts = 0` / `locked_until = NULL` に reset
- [ ] revoked リンクで失効エラー（カウンタ不変）
- [ ] パスワード無し共有リンクの閲覧が従来どおり動く
