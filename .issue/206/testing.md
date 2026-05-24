# 動作確認計画 — Issue #206: Argon2id (WASM) への移行

**Issue:** #206
**作成日:** 2026-05-24

---

## 確認環境

このIssueの変更を確認するために必要な手順のみ記載。

### 検証環境の起動

```bash
# ローカル DB マイグレーション適用（fresh DB の場合）
pnpm db:apply:local

# 開発サーバー起動（vite dev with Cloudflare Workers runtime）
pnpm dev
```

ブラウザで http://localhost:5173 を開く。

### デプロイ方法

```bash
# bundle size の事前確認（dry-run、Workers にはデプロイしない）
pnpm deploy:staging:dry

# staging 環境へデプロイ
pnpm deploy:staging
```

staging URL は `wrangler.staging.toml` の routes を参照。

### staging への PBKDF2 fixture ユーザ投入

lazy upgrade を staging で確認するため、PBKDF2 形式の `accounts.password` を持つテストユーザが必要。手順:

1. ローカルで admin signup → DB から `accounts.password` を取得（旧 PBKDF2 形式の fixture を別途用意するか、`scripts/` に fixture 生成スクリプトを用意）
2. staging DB に直接 INSERT で PBKDF2 形式 (iter=100,000 と iter=600,000 両方) のテストユーザを投入:

```bash
# fixture SQL を .issue/206/fixtures/pbkdf2-test-users.sql として用意
pnpm db:execute:staging .issue/206/fixtures/pbkdf2-test-users.sql
```

実装時に fixture SQL を `.issue/206/fixtures/` 配下に作成する。

---

## 確認項目

### 1. 新規 admin signup で Argon2id ハッシュが生成される

- **目的:** 新規ユーザの password が Argon2id 形式で保存されることを確認
- **手順:**
  1. `/signup` にアクセス
  2. email / password / name を入力して送信
  3. 成功画面 / ログイン後画面に遷移
  4. ローカル DB を確認: 任意の SQL を `.issue/206/fixtures/check-password.sql` に書き、`pnpm db:execute:local .issue/206/fixtures/check-password.sql` で実行（`db:execute:*` スクリプトは `--file` 形式のみ対応のため）
- **期待結果:** `password` 列の値が `$argon2id$v=19$m=19456,t=2,p=1$...` で始まる
- **確認ポイント:** prefix が `pbkdf2-sha256-v1$` ではなく `$argon2id$` であること、パラメータ部分が m=19456, t=2, p=1 になっていること

### 2. 既存 PBKDF2 ユーザのログインが成功し lazy upgrade が走る (iter=100,000)

- **目的:** Workers の PBKDF2 上限である iter=100,000 で生成された hash が verify でき、かつ Argon2id に自動アップグレードされることを確認
- **手順:**
  1. 事前準備: iter=100,000 で hash 化した既知パスワードを持つテストユーザを INSERT
  2. `/login` で当該 email / password を入力
  3. ログイン成功を確認
  4. DB を再 select: `SELECT password FROM accounts WHERE user_id = ?`
- **期待結果:** ログイン成功 + DB の `password` が `$argon2id$` で始まるよう書き換わっている
- **確認ポイント:** updated_at も更新されている

### 3. 既存 PBKDF2 ユーザのログイン (iter=600,000) でも lazy upgrade が走る

- **目的:** 旧 iter=600,000 で生成された hash も検証でき、アップグレード対象になることを確認
- **手順:** 上記 2 と同じだが、fixture は iter=600,000 で生成
- **期待結果:** ログイン成功 + DB の `password` が `$argon2id$` で始まる
- **確認ポイント:** どちらの iteration count でも同じ動線

### 4. lazy upgrade 後の 2 回目ログイン

- **目的:** upgrade 済みハッシュで継続ログインできることを確認
- **手順:**
  1. 上記 2 / 3 でログインしたユーザでログアウト
  2. 同じ email / password で再ログイン
- **期待結果:** ログイン成功 (今回は Argon2id verify が走る)
- **確認ポイント:** DB の `password` は引き続き `$argon2id$` のまま

### 5. 新規 share-link 発行で Argon2id ハッシュが生成される

- **目的:** share-link の password も Argon2id でハッシュされることを確認
- **手順:**
  1. 既存 publication 画面で share-link を発行、password を設定
  2. DB を確認: `SELECT password FROM share_links WHERE password IS NOT NULL ORDER BY created_at DESC LIMIT 1;`
- **期待結果:** `password` が `$argon2id$` で始まる

### 6. 既存 PBKDF2 share-link の verify が継続できる (upgrade なし)

- **目的:** legacy 互換が share-link 側でも維持されること、かつ ADR-003 の判断通り share-link 側は upgrade されないことを確認
- **手順:**
  1. 事前準備: `$pbkdf2-sha256$i=N$salt$hash` 形式の fixture を share_links に INSERT
  2. share-link URL にアクセス → password 入力
  3. アクセス成功を確認
  4. DB を再 select
- **期待結果:** アクセス成功 + DB の `password` は `$pbkdf2-sha256$` のまま (upgrade されない)

### 7. bundle size が受け入れ基準内

- **目的:** WASM 追加で Workers の bundle 上限を超えないことを確認
- **手順:**
  1. `pnpm deploy:staging:dry` を実行
  2. 出力の Total Upload (gzip 後) を確認
- **期待結果:** Total Upload が 5 MiB 未満 (Workers Paid プランの 10 MiB 上限に対する余裕基準)
- **確認ポイント:** 超過した場合は ADR-001 を再検討し、`hash-wasm` の subpath import やスタンドアロン UMD 版への切替を試す

### 8. cold start レイテンシが受け入れ基準内

- **目的:** WASM compile の cold start 上乗せが許容範囲内であることを確認
- **手順:**
  1. staging deploy 後、`wrangler tail` を別ターミナルで起動
  2. 数分間 staging に対してリクエストを送らず idle にする（cold state を作る）
  3. logIn を実行し、`wrangler tail` で初回リクエストのレスポンスタイムを採取
  4. 続けて 2 回目以降のリクエストでウォーム時のレスポンスタイムを採取
- **期待結果:** cold start 時の logIn 所要時間が ウォーム時 + 500ms 以内
- **確認ポイント:** 超過時は ADR-001 の Consequences に追記し、warm-up 戦略を別 Issue として起票

---

## エッジケース・異常系

### 1. 不正な hash 文字列を verify

- **目的:** 不正な hash 入力で `verify` が throw せず false を返すことを確認 (port 契約)
- **手順:** 単体テスト (`passwordHasher.test.ts`) でカバー。staging では暗黙的（不正 hash は通常 DB に入らない）
- **期待結果:** 空文字 / 不明 prefix / base64 壊れで false 返却、throw なし

### 2. 不正なパスワードで verify

- **目的:** 間違ったパスワードでログイン失敗時、`AuthenticationError('invalid_credentials')` が返ること、および lazy upgrade が発火しないこと
- **手順:**
  1. iter=100,000 の fixture ユーザに対して間違ったパスワードでログイン
  2. ログイン失敗を確認
  3. DB を再 select
- **期待結果:** 401 / invalid_credentials エラー + DB の `password` は PBKDF2 のまま（upgrade されない）

### 3. status pending ユーザのログイン

- **目的:** email-未認証ユーザでも verify は通り lazy upgrade が発火するが、application 層で unverified 拒否されることを確認 (ADR-003 で許容判断)
- **手順:**
  1. PBKDF2 fixture を持ち、`users.status = 'pending'` のテストユーザを準備
  2. 正しいパスワードでログイン試行
  3. レスポンスを確認
  4. DB を再 select
- **期待結果:** `AuthenticationError('unverified')` 拒否 + DB の `password` は **Argon2id に upgrade される**（ADR-003 で許容と明記）

---

## 既存機能への影響確認

- **既存 admin password の変更フロー (`changePassword`)**: 旧 PBKDF2 で hash された current_password で verify → 成功 → new_password を Argon2id で hash 保存。動作確認: 上記 2 の lazy upgrade とは別経路だが、`hashPassword` 経由なので新規 hash は Argon2id になる
- **password reset (`resetPassword`)**: 新規 hash は Argon2id
- **session 機能**: session token は password hash に依存しないため影響なし
- **share-link の新規発行 / password 変更**: Argon2id
- **既存 publication ページの公開機能**: password なし share-link は影響なし

---

## 確認チェックリスト

- [ ] 1. 新規 admin signup で Argon2id ハッシュ生成
- [ ] 2. PBKDF2 (iter=100,000) ユーザの logIn + lazy upgrade
- [ ] 3. PBKDF2 (iter=600,000) ユーザの logIn + lazy upgrade
- [ ] 4. lazy upgrade 後の 2 回目 logIn
- [ ] 5. 新規 share-link で Argon2id ハッシュ生成
- [ ] 6. 既存 PBKDF2 share-link の verify が継続 (upgrade なし)
- [ ] 7. bundle size 5 MiB 未満 (`pnpm deploy:staging:dry`)
- [ ] 8. cold start ウォーム差分 +500ms 以内 (`wrangler tail`)
- [ ] 9. 不正パスワードでログイン失敗時 lazy upgrade が走らない
- [ ] 10. status pending ユーザの unverified 拒否
- [ ] 11. changePassword / resetPassword が Argon2id で保存
