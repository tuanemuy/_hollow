# 動作確認計画 — Issue #201: フォームのエラー UX 改善 (入力保持・エラー内容の明瞭化)

**Issue:** #201
**作成日:** 2026-05-30

---

## 確認環境

このIssueの変更（`AdminSignUpForm` / `SignUpForm` のエラー UX）を確認するために必要な手順のみ記載。

### 検証環境の起動

```bash
pnpm db:migrate    # ローカル D1 にマイグレーション適用（未適用の場合）
pnpm dev           # vite dev (workerd) → http://localhost:3000
```

- `/setup` … AdminSignUpForm（初期管理者セットアップ）
- `/signup` … SignUpForm（通常サインアップ）

### Setup Token の設定（AdminSignUpForm の確認に必要）

`.dev.vars` の `ADMIN_SETUP_TOKEN` は `.dev.vars.example` 既定では空（`setup_token_disabled` になる）。AdminSignUpForm の正常系・Setup Token 不一致系を確認するには `.dev.vars` に任意の値を設定して `pnpm dev` を再起動する:

```
ADMIN_SETUP_TOKEN="test-setup-token"
```

### シードデータ

- 重複（conflict）確認には「既に存在するユーザー」が必要。専用シードスクリプトは無いため、**先に `/signup` または `/setup` で1ユーザーを作成**し、その username / email を使って重複を再現する。
- `registration_open` は既定 `1`（開放）なので `/signup` はそのまま利用可能。

### デプロイ方法

なし（検証環境のみで確認できる）。

## 確認項目

### 1. validation エラー時の入力保持（SignUpForm）

- **目的:** 入力検証エラーで戻ったとき、機微でないフィールドの入力が保持される。
- **手順:**
  1. `/signup` を開く
  2. username に `yume naut`（スペース＝不正）、email に `yumenaut@`（不正形式）、password に `123`（8文字未満）、displayName に `ユメナウト`、利用規約にチェックを入れて送信
  3. エラーで戻った画面を確認
- **期待結果:**
  - username / email / displayName の入力値が**保持**されている
  - 利用規約チェックが**保持**されている
  - password は**空**にリセットされている（機微フィールド）
  - 各不正フィールドの直下に**日本語**のエラーメッセージ（英語の Zod デフォルトでない）＋赤い `aria-invalid` 表示
- **確認ポイント:** field 名キー（`username:` 等の英語キー）がどこにも露出していないこと。

### 2. username / email 重複（conflict）の field 直下表示（SignUpForm）

- **目的:** username / email 衝突がどのフィールドの衝突か field 直下に表示される。
- **手順:**
  1. 事前に `/signup` で1ユーザー（例 username=`existing`, email=`existing@example.com`）を作成
  2. 再度 `/signup` で username=`existing`（email は新規）で送信 → username 衝突
  3. 別途 email=`existing@example.com`（username は新規）で送信 → email 衝突
- **期待結果:**
  - username 衝突時: **username フィールド直下**に「すでに登録されています」＋赤表示。汎用 summary callout（「操作を完了できませんでした…」）は出ない
  - email 衝突時: **email フィールド直下**に「すでに登録されています」
  - 入力値は保持されている
- **確認ポイント:** 「操作を完了できませんでした。時間をおいて再度お試しください」の fallback 文言が出ないこと。

### 3. Setup Token 不一致の専用 callout（AdminSignUpForm）

- **目的:** Setup Token 誤りが専用 callout で表示され、他フィールドは保持される。
- **手順:**
  1. `.dev.vars` に `ADMIN_SETUP_TOKEN="test-setup-token"` を設定して `pnpm dev` 起動
  2. `/setup` で username / email / password / displayName を入力、Setup Token に `wrong-token`、利用規約チェックで送信
- **期待結果:**
  - 「**Setup Token が正しくありません。** 値を確認してもう一度入力してください。」の専用 callout（`FORM_ERROR`）が出る
  - username / email / displayName / 利用規約チェックは**保持**
  - password / setupToken は**空**にリセット
- **確認ポイント:** Setup Token 入力欄が `aria-invalid` / `data-error` 表示になること。

### 4. AdminSignUpForm の正常系（非回帰）

- **目的:** 正しい入力で管理者作成が成功する。
- **手順:**
  1. `ADMIN_SETUP_TOKEN="test-setup-token"` を設定した状態で `/setup` を開く
  2. 全フィールドを正しく入力、Setup Token に `test-setup-token`、利用規約チェックで送信
- **期待結果:** 「管理者アカウントを作成しました」の成功画面に遷移。「ログインへ」リンクが表示される。

### 5. SignUpForm の正常系（非回帰）

- **目的:** 正しい入力でサインアップが成功する。
- **手順:** `/signup` で新規 username / email / password を入力し送信
- **期待結果:** 「確認メールを送信しました」の成功画面に遷移。

## エッジケース・異常系

### 1. acceptTerms 未チェックでの送信

- **目的:** 利用規約未同意時の validation と、チェック状態の復元。
- **手順:** `/signup` で全フィールド入力するが利用規約にチェックを入れず送信
- **期待結果:** acceptTerms の validation エラーが出る。他フィールドの入力は保持される。

### 2. system / unknown エラーの汎用 callout（抽象化維持）

- **目的:** 内部エラーがフィールド非紐付けの汎用 summary で表示され、内部詳細が漏れない。
- **手順ः** （再現可能な場合のみ）DB 停止等で system エラーを誘発、または該当経路を確認
- **期待結果:** 「登録に失敗しました。システムエラーが発生しました」の汎用 callout。内部 code / table 名等は露出しない。

## 既存機能への影響確認

- **LoginForm:** email 復元・エラー表示が従来どおり動作すること（`formatFieldErrors` 変更の波及確認）。
- **他フォームの validation サマリ:** `formatFieldErrors` 変更により、field 直下表示を持たないフォームで複数フィールドエラー時の表示が崩れていないこと（変更スコープ外だが回帰確認）。

## 確認チェックリスト

- [ ] validation エラーで username/email/displayName/acceptTerms が保持され password は消える（SignUpForm）
- [ ] validation エラーメッセージが日本語で field 直下に出る
- [ ] field 名の英語キーがどこにも露出していない
- [ ] username 重複が username フィールド直下に「すでに登録されています」
- [ ] email 重複が email フィールド直下に「すでに登録されています」
- [ ] 重複時に汎用 fallback 文言が出ない
- [ ] Setup Token 不一致の専用 callout（AdminSignUpForm）、他フィールド保持・setupToken リセット
- [ ] AdminSignUpForm 正常系が成功する
- [ ] SignUpForm 正常系が成功する
- [ ] acceptTerms 未チェックの validation とチェック状態復元
- [ ] LoginForm が従来どおり動作（非回帰）
