# TC-4: /signup 経路の回復

## Status: PASS

## 検証目的
legacy 行があると `/signup` のサインアップ実行（POST）が失敗し、修復（DELETE）後に新規アカウント作成が成功すること。

## 補足
`/signup` の GET レンダリング自体は instance_settings に依存しない（route の `beforeLoad` は認証チェックのみ）。実際にエラーが起きるのは POST 経路：`signUp` ユースケースが `instanceSettingsRepository.get()` を呼んだ際にレガシー行の VO 復元で失敗する。テスト 1 (GET 表示) は当該経路では NA。本テストでは POST 経路で検証した。

## 手順と結果

| # | 手順 | 期待 | 実測 |
|---|------|------|------|
| 1 | legacy 行投入 | INSERT 成功 | OK |
| 2 | 未ログインで `/signup` を開く | ページ表示は問題なし（GET は instance_settings 非依存） | フォーム表示 OK |
| 3 | フォーム送信（signuptest001 / signup-test-001@example.com / Password123!） | POST 失敗 | `/_serverFn/...SignUpForm/action...` HTTP **500** `System error`、UI に「登録に失敗しました」 |
| 4 | マイグレーション DELETE SQL 実行 | count=0 | OK |
| 5 | `/signup` リロード → 同じ値で再送信 | POST 200 + ユーザー作成 | HTTP **200** `userId: 019e4633-72f2-77d9-a2ea-d44cd2901308` |
| 6 | DB 確認 (`SELECT username, email FROM users WHERE email='signup-test-001@example.com'`) | 1 行 | OK (`signuptest001`) |

## スクリーンショット
- `/Users/hikaru/github.com/tuanemuy/hollow2/.issue/60/.manual-test/screenshots/tc-4/signup-500.png` (legacy 行下で送信失敗の UI 表示)
- `/Users/hikaru/github.com/tuanemuy/hollow2/.issue/60/.manual-test/screenshots/tc-4/signup-200.png` (DELETE 後の正常表示)
- `/Users/hikaru/github.com/tuanemuy/hollow2/.issue/60/.manual-test/screenshots/tc-4/signup-completed.png` (送信完了直後の UI)

## 所見
signUp ユースケースは UoW 内で `instanceSettingsRepository.get()` を呼ぶ。レガシー行があると `InstanceSettingsRow.toDomain()` が失敗 → 500。DELETE による修復で default 復帰し、登録が成功することを確認。Issue #60 が想定する管理画面以外への副次的影響（/signup の登録経路）も復旧することが立証された。
