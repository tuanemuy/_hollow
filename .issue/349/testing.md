# 動作確認計画 — Issue #349: パスワード最小長の不整合

**Issue:** #349
**作成日:** 2026-05-30

---

## 確認環境

このIssueの変更を確認するために必要な手順のみ記載。

### 検証環境の起動

```bash
pnpm db:migrate   # ローカル D1 にマイグレーション適用（初回 / 未適用時のみ）
pnpm dev          # vite dev (Cloudflare 構成) でローカルサーバー起動
```

サインアップ画面（`/signup`）でパスワード入力欄を確認する。バリデーションは transport boundary（Zod `inputValidator`、クライアントバンドルで実行）で行われる。

### デプロイ方法

なし（検証環境のみで確認できる。定数変更のみのため staging/production 反映は通常の `pnpm deploy:staging` フローに従う）。

## 確認項目

### 1. UI ヒント・placeholder が「12文字以上」になっている

- **目的:** 定数変更が placeholder / hint に波及していることを確認
- **手順:**
  1. `/signup` を開く
  2. パスワード欄の placeholder とヒント文を確認する
- **期待結果:** placeholder が「12文字以上」、ヒントが「12文字以上。英数字と記号を組み合わせると安全です。」と表示される
- **確認ポイント:** AdminSignUp（`/admin/signup` 等）・PasswordResetConfirm 画面も同様に 12 文字表記になっているか

### 2. 11文字パスワードが field 直下エラーで弾かれる

- **目的:** transport boundary で先に弾かれ、summary 領域ではなく field 直下に validation エラーが出ることを確認（本Issueの核心）
- **手順:**
  1. `/signup` で username / email / displayName / 利用規約同意を有効に埋める
  2. パスワードに 11 文字（例 `Passw0rd!23`）を入力して送信
- **期待結果:** パスワード欄の直下に「パスワードは12文字以上で入力してください。」が表示され、入力内容は保持される。summary 領域に `password_too_short` 由来のメッセージは出ない
- **確認ポイント:** ユースケースまで到達せず Zod で弾かれていること（field error であること）

### 3. 12文字パスワードが通る

- **目的:** 12 文字以上が transport boundary を通過することを確認
- **手順:**
  1. `/signup` でパスワードに 12 文字（例 `Passw0rd!234`）を入力して送信
- **期待結果:** パスワード長によるエラーは出ない（以降は通常のサインアップ処理に進む）

## エッジケース・異常系

### 1. 12文字ちょうど / 11文字の境界

- **目的:** 境界値で min が 12 になっていることを確認
- **手順:** 11 文字 → エラー、12 文字 → 通過、を順に試す
- **期待結果:** 12 が下限。11 は field エラー

## 既存機能への影響確認

- **ログイン（`/login`）**: password は `min(1)` のままなので、既存ユーザーの任意長パスワードでログインできること
- **PasswordResetConfirm**: newPassword / confirmPassword が 12 文字未満で field エラーになること、強度メーターのしきい値が 12 になっていること

## 確認チェックリスト

- [ ] placeholder・hint が「12文字以上」表記
- [ ] 11文字が field 直下エラー（summary ではない）
- [ ] 12文字が通過
- [ ] ログインが既存パスワードで通る（影響なし）
- [ ] PasswordResetConfirm の強度メーターしきい値が 12
