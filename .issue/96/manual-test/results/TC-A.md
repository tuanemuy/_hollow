# TC-A: admin ページ群が全て 200 で描画される

**結果**: PASS
**実行時間**: 約90秒
**セッション**: verify-tc-a

## 注意事項

- テスト手順書では `/sign-in` を指定していたが、実際のルートは `/login` のため `/login` を使用。
- ログイン後のリダイレクト先は `/?page=1&limit=20`（admin ダッシュボードではなく一般トップ）。`/admin` 系へは手動でアクセスして確認。

## 実行ログ

| # | 操作 | 期待結果 | 実際の結果 | 判定 |
|---|------|---------|-----------|------|
| 1 | http://localhost:3000/login を開く | サインインフォーム表示 | 「ログイン」見出し・メール/パスワード入力欄表示 | PASS |
| 2 | `admin@example.com` / `Password123!` で送信 | ログイン成功 | `/?page=1&limit=20` へ遷移、ログイン成功 | PASS |
| 3 | http://localhost:3000/admin にアクセス | 200 描画、TypeError なし | 「ダッシュボード」見出し描画、管理ナビ表示、TypeError なし | PASS |
| 4 | http://localhost:3000/admin/metrics にアクセス | 200 描画、利用状況見出し描画 | 「利用状況」見出し、現在の利用量・インスタンス上限テーブル描画 | PASS |
| 5 | http://localhost:3000/admin/llm にアクセス | 200 描画、LLM 設定フォーム、SecretBoxError 出ない | 「LLM 設定」、API キー入力欄、モデル設定フォーム描画、`NullSecretBox` fallback でも副作用なし | PASS |
| 6 | http://localhost:3000/admin/registration にアクセス | 200 描画、TypeError なし | 「登録制御」見出し、サインアップ公開スイッチ描画 | PASS |
| 7 | http://localhost:3000/admin/users にアクセス | 200 描画、TypeError なし | 「ユーザー管理」、14 アカウント (admin含む) のテーブル描画 | PASS |
| 8 | http://localhost:3000/admin/jobs にアクセス | 200 描画、TypeError なし | 「ジョブ監視」、取り込み・エクスポート・クリーンアップセクション描画 | PASS |

## HTTP ステータスコード確認 (curl 直接)

| URL | Status |
|-----|--------|
| /admin | 200 |
| /admin/metrics | 200 |
| /admin/llm | 200 |
| /admin/registration | 200 |
| /admin/users | 200 |
| /admin/jobs | 200 |

全て 200 で応答。

## スクリーンショット

- Step 1 (login form): `screenshots/tc-a/step-01-login.png`
- Step 2 (after login): `screenshots/tc-a/step-02-after-login.png`
- Step 3 (/admin): `screenshots/tc-a/step-03-admin.png`
- Step 4 (/admin/metrics): `screenshots/tc-a/step-04-metrics.png`
- Step 5 (/admin/llm): `screenshots/tc-a/step-05-llm.png`
- Step 6 (/admin/registration): `screenshots/tc-a/step-06-registration.png`
- Step 7 (/admin/users): `screenshots/tc-a/step-07-users.png`
- Step 8 (/admin/jobs): `screenshots/tc-a/step-08-jobs.png`

## サーバーログ check

`tail -100 /tmp/manual-test-server.log | grep -iE "typeerror|cannot read|StorageUnavailable|SecretBox"` の結果:

```
(出力なし — TypeError / Cannot read / StorageUnavailable / SecretBox いずれも検出されず)
```

補足: ログ中に `ForbiddenError: Admin access required` は複数件見られたが、これは認証なしで curl 直接アクセスした際の正常な拒否レスポンス（ログイン後のブラウザセッションでは admin として全ページ正常描画）。

## 失敗詳細

なし。全ステップ PASS。

## 検証された観点

- DI で `NullUsageMetricsProvider` を含む各種 Null 実装が正しくワイヤリングされ、admin 画面描画時に `TypeError: Cannot read properties of undefined` が発生しない。
- `/admin/llm` のページ描画時に `SecretBoxError` が出ない（`NullSecretBox` fallback が描画副作用なし）。
- 全 admin ルートが認証済みセッションで 200 を返し、各ページ固有の主要見出しが描画される。
