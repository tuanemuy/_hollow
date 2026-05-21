# 動作確認計画 — Issue #107: infra(dev): ローカル開発で SECRET_BOX_MASTER_KEY を自動セットして admin 設定の save をテスト可能にする

**Issue:** #107
**作成日:** 2026-05-21

---

## 確認環境

このIssueの変更を確認するために必要な手順のみ記載。

### 検証環境の起動

```bash
# 1. .dev.vars を example から作り直す（初回セットアップを再現）
rm -f .dev.vars
cp .dev.vars.example .dev.vars

# 2. ローカル D1 にマイグレーション適用
pnpm db:migrate

# 3. dev サーバー起動 (http://localhost:3000)
pnpm dev
```

### デプロイ方法

なし（検証環境のみで確認できる）。本 Issue はドキュメント・`.dev.vars.example` の整備のみで本番デプロイ対象外。

## 確認項目

### 1. 初回セットアップで `/admin/llm` のフォーム保存が成功する

- **目的:** 受け入れ基準「`cp .dev.vars.example .dev.vars` + README の手順だけで `/admin/llm` フォームから LLM 設定を保存できる」が満たされていることを確認
- **手順:**
  1. `.dev.vars` を削除して `.dev.vars.example` から再コピー
  2. `pnpm db:migrate` でローカル D1 を初期化
  3. `pnpm dev` で dev サーバーを起動
  4. `http://localhost:3000` にアクセスし、Google OAuth でログイン（OAuth クレデンシャルを `.dev.vars` に設定済みの前提）
  5. `/admin/llm` を開く
  6. 任意のプロバイダ・モデルを選び、`apiKeySource = 'db'` を選択して任意の API キー文字列を入力
  7. 「保存」ボタンを押す
- **期待結果:** 保存が成功し、200 を返す。500 (`System error`) は発生しない
- **確認ポイント:** 既存の Issue #60 の TC-2 と同じ操作で、暗号化失敗が解消されていること

### 2. README の手順だけで `SECRET_BOX_MASTER_KEY` を再生成・置換できる

- **目的:** README の Quick Start 手順が単独で完結することを確認
- **手順:**
  1. README の Quick Start セクションを上から読む
  2. 書かれた手順だけで `.dev.vars` の `SECRET_BOX_MASTER_KEY` を `openssl rand -base64 32` で再生成して上書き
  3. `pnpm dev` を再起動して 1. の操作を繰り返す
- **期待結果:** 再生成後の値でも `/admin/llm` の保存が成功する

## エッジケース・異常系

### 1. `SECRET_BOX_MASTER_KEY` を空文字に変更して `/admin/llm` 保存

- **目的:** Issue #60 の TC-2 と同じ症状（暗号化失敗）が再現することを逆向きに確認し、`SECRET_BOX_MASTER_KEY` が実際に効いていることを検証
- **手順:**
  1. `.dev.vars` の `SECRET_BOX_MASTER_KEY` を空に書き換え
  2. `pnpm dev` 再起動
  3. `/admin/llm` で apiKeySource = 'db' を選んで保存
- **期待結果:** 500 (`SECRET_BOX_MASTER_KEY is not configured`) が発生する。これによりサンプル値が有効に作用していることが裏取りできる
- **備考:** 確認後は `.dev.vars` を `.dev.vars.example` から再コピーして元に戻す

## 既存機能への影響確認

- Google OAuth ログインなど、`SECRET_BOX_MASTER_KEY` 以外のシークレットを使う機能が引き続き動くこと
- `pnpm test` (unit + integration) がパスすること

## 確認チェックリスト

- [ ] `.dev.vars.example` をコピーしただけで `pnpm dev` が起動する
- [ ] `/admin/llm` で LLM 設定（apiKeySource='db'）を保存できる（200）
- [ ] `openssl rand -base64 32` で再生成した値に置き換えても保存できる
- [ ] `SECRET_BOX_MASTER_KEY` を空にすると保存が失敗する（裏取り）
- [ ] 既存の Google OAuth ログインが動く
- [ ] `pnpm test` がパスする
